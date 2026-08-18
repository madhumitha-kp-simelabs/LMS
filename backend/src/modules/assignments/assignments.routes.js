import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { AppError } from '../../middleware/error.js';
// Everything about candidates — approving them, allotting topics to them — is
// the course lead's call. A team trainer builds content; they do not decide who
// sees it. Read-only views stay open to the whole team.
import {
  assertCourseLead,
  assertCourseRead,
  assertTopicLead,
  assertTopicRead,
} from '../courses/courses.service.js';

const router = Router();
const handle = (fn) => (req, res, next) => fn(req, res, next).catch(next);

router.use(requireAuth, requireRole('trainer', 'admin'));

const allotSchema = z.object({
  candidateIds: z.array(z.string().uuid()).min(1, 'Pick at least one candidate'),
});

/** Every candidate account, for the allotment picker. */
router.get(
  '/candidates',
  handle(async (req, res) => {
    const candidates = await prisma.user.findMany({
      where: { role: 'candidate', isActive: true },
      select: { id: true, fullName: true, email: true },
      orderBy: { fullName: 'asc' },
    });
    res.json({ candidates });
  }),
);

/** Who currently has access to this topic. */
router.get(
  '/topics/:topicId/assignments',
  handle(async (req, res) => {
    await assertTopicRead(req.user, req.params.topicId);

    const assignments = await prisma.topicAssignment.findMany({
      where: { topicId: req.params.topicId },
      include: { user: { select: { id: true, fullName: true, email: true } } },
      orderBy: { assignedAt: 'asc' },
    });
    res.json({ assignments });
  }),
);

router.post(
  '/topics/:topicId/assignments',
  handle(async (req, res) => {
    const topic = await assertTopicLead(req.user, req.params.topicId);
    const { candidateIds } = allotSchema.parse(req.body);

    const candidates = await prisma.user.findMany({
      where: { id: { in: candidateIds }, role: 'candidate' },
      select: { id: true },
    });
    if (candidates.length !== candidateIds.length) {
      throw new AppError(422, 'One or more of those accounts is not an active candidate');
    }

    // Allotting a topic implies membership of its course, so keep Enrollment in
    // step rather than letting a candidate hold a topic in a course they are
    // not enrolled in. Granting access also settles any pending request.
    await prisma.$transaction([
      prisma.enrollment.createMany({
        data: candidates.map((c) => ({ userId: c.id, courseId: topic.courseId })),
        skipDuplicates: true,
      }),
      prisma.enrollment.updateMany({
        where: { courseId: topic.courseId, userId: { in: candidates.map((c) => c.id) }, status: 'pending' },
        data: { status: 'active' },
      }),
      prisma.topicAssignment.createMany({
        data: candidates.map((c) => ({
          userId: c.id,
          topicId: topic.id,
          assignedBy: req.user.id,
        })),
        skipDuplicates: true,
      }),
    ]);

    res.status(201).json({ assigned: candidates.length });
  }),
);

router.delete(
  '/topics/:topicId/assignments/:userId',
  handle(async (req, res) => {
    await assertTopicLead(req.user, req.params.topicId);

    await prisma.topicAssignment.deleteMany({
      where: { topicId: req.params.topicId, userId: req.params.userId },
    });
    res.status(204).end();
  }),
);

/**
 * Every pending request across the trainer's courses — the inbox.
 *
 * Admins see all of them; a trainer sees only requests for courses they own,
 * so the same route serves both without a separate admin endpoint.
 */
router.get(
  '/requests',
  handle(async (req, res) => {
    const requests = await prisma.enrollment.findMany({
      where: {
        status: 'pending',
        course: req.user.role === 'admin' ? {} : { ownerId: req.user.id },
      },
      include: {
        user: { select: { id: true, fullName: true, email: true } },
        course: {
          select: {
            id: true,
            code: true,
            title: true,
            owner: { select: { fullName: true } },
            _count: { select: { topics: true } },
          },
        },
      },
      orderBy: { enrolledAt: 'asc' },
    });

    res.json({ requests, count: requests.length });
  }),
);

/** Candidates waiting for a decision on this course. */
router.get(
  '/courses/:courseId/requests',
  handle(async (req, res) => {
    await assertCourseRead(req.user, req.params.courseId);

    const requests = await prisma.enrollment.findMany({
      where: { courseId: req.params.courseId, status: 'pending' },
      include: { user: { select: { id: true, fullName: true, email: true } } },
      orderBy: { enrolledAt: 'asc' },
    });

    res.json({ requests });
  }),
);

const decisionSchema = z.object({
  // Approving without allotting anything leaves the candidate enrolled but
  // with nothing to open, so this defaults to on.
  allotAllTopics: z.boolean().default(true),
});

router.post(
  '/courses/:courseId/requests/:userId/approve',
  handle(async (req, res) => {
    await assertCourseLead(req.user, req.params.courseId);
    const { allotAllTopics } = decisionSchema.parse(req.body ?? {});

    const request = await prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: req.params.userId, courseId: req.params.courseId } },
    });
    if (!request || request.status !== 'pending') {
      throw new AppError(404, 'No pending request from that candidate');
    }

    const topics = allotAllTopics
      ? await prisma.topic.findMany({ where: { courseId: req.params.courseId }, select: { id: true } })
      : [];

    await prisma.$transaction([
      prisma.enrollment.update({ where: { id: request.id }, data: { status: 'active' } }),
      prisma.topicAssignment.createMany({
        data: topics.map((t) => ({
          userId: req.params.userId,
          topicId: t.id,
          assignedBy: req.user.id,
        })),
        skipDuplicates: true,
      }),
    ]);

    res.json({ approved: true, topicsAllotted: topics.length });
  }),
);

router.delete(
  '/courses/:courseId/requests/:userId',
  handle(async (req, res) => {
    await assertCourseLead(req.user, req.params.courseId);

    const { count } = await prisma.enrollment.deleteMany({
      where: { userId: req.params.userId, courseId: req.params.courseId, status: 'pending' },
    });
    if (count === 0) throw new AppError(404, 'No pending request from that candidate');

    res.status(204).end();
  }),
);

/** Allot every topic in a course at once — the common case for a new joiner. */
router.post(
  '/courses/:courseId/assignments',
  handle(async (req, res) => {
    await assertCourseLead(req.user, req.params.courseId);
    const { candidateIds } = allotSchema.parse(req.body);

    const topics = await prisma.topic.findMany({
      where: { courseId: req.params.courseId },
      select: { id: true },
    });
    if (topics.length === 0) throw new AppError(422, 'That course has no topics yet');

    const pairs = candidateIds.flatMap((userId) =>
      topics.map((t) => ({ userId, topicId: t.id, assignedBy: req.user.id })),
    );

    await prisma.$transaction([
      prisma.enrollment.createMany({
        data: candidateIds.map((userId) => ({ userId, courseId: req.params.courseId })),
        skipDuplicates: true,
      }),
      prisma.enrollment.updateMany({
        where: { courseId: req.params.courseId, userId: { in: candidateIds }, status: 'pending' },
        data: { status: 'active' },
      }),
      prisma.topicAssignment.createMany({ data: pairs, skipDuplicates: true }),
    ]);

    res.status(201).json({ assigned: pairs.length });
  }),
);

export default router;
