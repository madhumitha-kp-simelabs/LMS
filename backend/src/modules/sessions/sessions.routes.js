import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { requireAuth } from '../../middleware/auth.js';
import { AppError } from '../../middleware/error.js';

const router = Router();
const handle = (fn) => (req, res, next) => fn(req, res, next).catch(next);

router.use(requireAuth);

/**
 * One-to-one sessions: a candidate asks their course's lead for time, the lead
 * gives it a slot or says why not.
 *
 * Both ends live in one module because they are two halves of one conversation
 * — splitting the asking into /learn and the answering into /allot would put
 * the same three rules in two files and let them drift.
 */

const askSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, 'Say a little about what you would like to go over')
    .max(1000),
});

/**
 * The lead's answer. Scheduling needs a time; declining needs a reason, because
 * "no" with no explanation is worse for the candidate than a slow yes.
 */
const answerSchema = z
  .object({
    status: z.enum(['scheduled', 'declined']),
    scheduledAt: z.coerce.date().nullable().optional(),
    response: z.string().trim().max(1000).or(z.literal('')).nullable().optional(),
  })
  .refine((input) => input.status !== 'scheduled' || input.scheduledAt != null, {
    message: 'Give the session a date and time',
    path: ['scheduledAt'],
  })
  .refine((input) => input.status !== 'declined' || Boolean(input.response), {
    message: 'Say why, so they know what to do instead',
    path: ['response'],
  });

/** Everything a screen shows about one request, from either side. */
const shape = (row) => ({
  id: row.id,
  status: row.status,
  reason: row.reason,
  scheduledAt: row.scheduledAt,
  response: row.response,
  createdAt: row.createdAt,
  decidedAt: row.decidedAt,
  decidedBy: row.decidedBy ? { id: row.decidedBy.id, fullName: row.decidedBy.fullName } : null,
  course: row.course,
  candidate: row.user,
});

const include = {
  course: {
    select: { id: true, code: true, title: true, owner: { select: { id: true, fullName: true } } },
  },
  user: { select: { id: true, fullName: true, email: true } },
  decidedBy: { select: { id: true, fullName: true } },
};

// ------------------------------------------------------------- the asking end

/** Everything this person has asked for, newest first. */
router.get(
  '/mine',
  handle(async (req, res) => {
    const rows = await prisma.sessionRequest.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      include,
    });
    res.json({ sessions: rows.map(shape) });
  }),
);

/**
 * Asking for a session on a course.
 *
 * One open request per course at a time: a candidate who has asked and not been
 * answered does not need a second way to ask, and a lead opening the inbox to
 * three copies of the same plea learns nothing new from the second and third.
 * A course they have already met about can be asked again freely.
 */
router.post(
  '/courses/:courseId',
  handle(async (req, res) => {
    const { reason } = askSchema.parse(req.body);

    const enrolment = await prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: req.user.id, courseId: req.params.courseId } },
      include: { course: { select: { id: true, ownerId: true } } },
    });
    // Same message whether the course is missing or simply not theirs, so this
    // cannot be used to discover which courses exist.
    if (!enrolment || enrolment.status !== 'active') {
      throw new AppError(404, 'You are not on that course');
    }
    if (!enrolment.course.ownerId) {
      throw new AppError(409, 'That course has no lead yet — there is nobody to ask');
    }

    const open = await prisma.sessionRequest.findFirst({
      where: { userId: req.user.id, courseId: req.params.courseId, status: 'requested' },
    });
    if (open) {
      throw new AppError(409, 'You have already asked for a session on this course');
    }

    const created = await prisma.sessionRequest.create({
      data: { courseId: req.params.courseId, userId: req.user.id, reason },
      include,
    });

    res.status(201).json({ session: shape(created) });
  }),
);

/** Withdrawing a request nobody has answered yet. */
router.delete(
  '/:sessionId',
  handle(async (req, res) => {
    const { count } = await prisma.sessionRequest.deleteMany({
      where: { id: req.params.sessionId, userId: req.user.id, status: 'requested' },
    });
    // Once answered it is a record of something arranged, not a draft — taking
    // it back would erase a time the lead has already set aside.
    if (count === 0) throw new AppError(404, 'That request cannot be withdrawn');

    res.status(204).end();
  }),
);

// ---------------------------------------------------------- the answering end

/** Where the lead sits on this course, for the checks below. */
async function assertMayAnswer(user, courseId) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { ownerId: true },
  });
  if (!course) throw new AppError(404, 'Course not found');

  // The lead was asked personally, so the lead answers. An admin can step in —
  // somebody has to when a lead is away — but a team trainer cannot commit
  // their lead's time.
  if (user.role !== 'admin' && course.ownerId !== user.id) {
    throw new AppError(403, 'Only this course’s lead can answer that request');
  }
}

/** The inbox: everything waiting on this lead, oldest first. */
router.get(
  '/inbox',
  handle(async (req, res) => {
    if (!['lead', 'admin'].includes(req.user.role)) return res.json({ sessions: [], count: 0 });

    const rows = await prisma.sessionRequest.findMany({
      where: {
        status: 'requested',
        course: req.user.role === 'admin' ? {} : { ownerId: req.user.id },
      },
      // Oldest first — the point of a queue is that waiting longest goes first.
      orderBy: { createdAt: 'asc' },
      include,
    });

    res.json({ sessions: rows.map(shape), count: rows.length });
  }),
);

/** Giving it a time, or saying why not. */
router.patch(
  '/:sessionId',
  handle(async (req, res) => {
    const input = answerSchema.parse(req.body);

    const request = await prisma.sessionRequest.findUnique({
      where: { id: req.params.sessionId },
      select: { id: true, courseId: true, status: true },
    });
    if (!request) throw new AppError(404, 'Request not found');

    await assertMayAnswer(req.user, request.courseId);

    const updated = await prisma.sessionRequest.update({
      where: { id: request.id },
      data: {
        status: input.status,
        // Cleared when declining, so a rejected request never carries a stale
        // time somebody might still turn up for.
        scheduledAt: input.status === 'scheduled' ? input.scheduledAt : null,
        response: input.response?.trim() || null,
        decidedById: req.user.id,
        decidedAt: new Date(),
      },
      include,
    });

    res.json({ session: shape(updated) });
  }),
);

export default router;
