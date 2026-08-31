import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { AppError } from '../../middleware/error.js';

const router = Router();
const handle = (fn) => (req, res, next) => fn(req, res, next).catch(next);

router.use(requireAuth);

/**
 * Asking to stop a course, and an administrator deciding.
 *
 * The decision sits with an administrator rather than the course's lead on
 * purpose: a lead losing a candidate has an interest in the answer, and the
 * handbook puts the processing with L&D for the same reason. The lead sees the
 * outcome — the candidate leaves their cohort — but does not rule on it.
 */

const askSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, 'Say why you are stopping — it is the part that is actually useful')
    .max(1000),
});

const answerSchema = z
  .object({
    status: z.enum(['approved', 'declined']),
    response: z.string().trim().max(1000).or(z.literal('')).nullable().optional(),
  })
  .refine((input) => input.status !== 'declined' || Boolean(input.response), {
    message: 'Say why, so they know where they stand',
    path: ['response'],
  });

const include = {
  course: {
    select: {
      id: true,
      code: true,
      version: true,
      title: true,
      owner: { select: { id: true, fullName: true } },
    },
  },
  user: { select: { id: true, fullName: true, email: true } },
  decidedBy: { select: { id: true, fullName: true } },
};

const shape = (row) => ({
  id: row.id,
  status: row.status,
  reason: row.reason,
  response: row.response,
  createdAt: row.createdAt,
  decidedAt: row.decidedAt,
  decidedBy: row.decidedBy,
  course: row.course,
  candidate: row.user,
});

// ------------------------------------------------------------- the asking end

router.get(
  '/mine',
  handle(async (req, res) => {
    const rows = await prisma.discontinuationRequest.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      include,
    });
    res.json({ discontinuations: rows.map(shape) });
  }),
);

router.post(
  '/courses/:courseId',
  handle(async (req, res) => {
    const input = askSchema.parse(req.body);

    const enrolment = await prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: req.user.id, courseId: req.params.courseId } },
    });
    if (!enrolment || enrolment.status !== 'active') {
      throw new AppError(404, 'You are not on that course');
    }
    if (enrolment.completedAt) {
      throw new AppError(409, 'You have finished that course — there is nothing to stop');
    }
    if (enrolment.discontinuedAt) {
      throw new AppError(409, 'You have already stopped that course');
    }

    const open = await prisma.discontinuationRequest.findFirst({
      where: { userId: req.user.id, courseId: req.params.courseId, status: 'requested' },
    });
    if (open) throw new AppError(409, 'You have already asked to stop this course');

    const created = await prisma.discontinuationRequest.create({
      data: { courseId: req.params.courseId, userId: req.user.id, reason: input.reason },
      include,
    });

    res.status(201).json({ discontinuation: shape(created) });
  }),
);

/** Changing your mind, while nobody has ruled on it yet. */
router.delete(
  '/:requestId',
  handle(async (req, res) => {
    const { count } = await prisma.discontinuationRequest.deleteMany({
      where: { id: req.params.requestId, userId: req.user.id, status: 'requested' },
    });
    if (count === 0) throw new AppError(404, 'That request cannot be withdrawn');
    res.status(204).end();
  }),
);

// ---------------------------------------------------------- the answering end

/** Everything waiting on an administrator. */
router.get(
  '/inbox',
  handle(async (req, res) => {
    // Answered with an empty queue rather than a 403, so the Inbox page can ask
    // for it unconditionally and not care who is looking.
    if (req.user.role !== 'admin') return res.json({ discontinuations: [], count: 0 });

    const rows = await prisma.discontinuationRequest.findMany({
      where: { status: 'requested' },
      orderBy: { createdAt: 'asc' },
      include,
    });

    // How far in they are. Somebody stopping a course they never started is a
    // different conversation from somebody stopping at four topics out of five.
    const enrolments = await prisma.enrollment.findMany({
      where: {
        courseId: { in: rows.map((r) => r.courseId) },
        userId: { in: rows.map((r) => r.userId) },
      },
      select: { userId: true, courseId: true, startedAt: true, dueAt: true },
    });
    const progress = new Map(enrolments.map((e) => [`${e.userId}:${e.courseId}`, e]));

    res.json({
      discontinuations: rows.map((row) => ({
        ...shape(row),
        enrolment: progress.get(`${row.userId}:${row.courseId}`) ?? null,
      })),
      count: rows.length,
    });
  }),
);

router.patch(
  '/:requestId',
  requireRole('admin'),
  handle(async (req, res) => {
    const input = answerSchema.parse(req.body);

    const request = await prisma.discontinuationRequest.findUnique({
      where: { id: req.params.requestId },
    });
    if (!request) throw new AppError(404, 'Request not found');
    if (request.status !== 'requested') throw new AppError(409, 'That request has been answered');

    // The decision and its effect are one write. A request marked approved
    // beside an enrolment still counted as running would leave the candidate on
    // a course they were told they had left.
    const updated = await prisma.$transaction(async (tx) => {
      const answered = await tx.discontinuationRequest.update({
        where: { id: request.id },
        data: {
          status: input.status,
          response: input.response?.trim() || null,
          decidedById: req.user.id,
          decidedAt: new Date(),
        },
        include,
      });

      if (input.status === 'approved') {
        await tx.enrollment.updateMany({
          where: { userId: request.userId, courseId: request.courseId },
          data: { discontinuedAt: new Date() },
        });
      }

      return answered;
    });

    res.json({ discontinuation: shape(updated) });
  }),
);

export default router;
