import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { requireAuth } from '../../middleware/auth.js';
import { AppError } from '../../middleware/error.js';

const router = Router();
const handle = (fn) => (req, res, next) => fn(req, res, next).catch(next);

router.use(requireAuth);

/**
 * Asking for more time on a course, and the lead granting it.
 *
 * Approving moves that candidate's Enrollment.dueAt and nobody else's. The
 * whole feature exists because a deadline that could not move would mean
 * either giving everyone the slowest person's timeline or marking good people
 * late for reasons that had nothing to do with them.
 *
 * Shaped after the session-request module deliberately: a candidate asking and
 * a lead answering is the same shape of conversation, and two screens that
 * behave the same are two fewer things to learn.
 */

const askSchema = z.object({
  requestedUntil: z.coerce.date({ message: 'Pick the date you need until' }),
  reason: z.string().trim().min(10, 'Say why you need the time').max(1000),
});

const answerSchema = z
  .object({
    status: z.enum(['approved', 'declined']),
    // Omitting it grants exactly the date requested, which is the common case.
    grantedUntil: z.coerce.date().nullable().optional(),
    response: z.string().trim().max(1000).or(z.literal('')).nullable().optional(),
  })
  .refine((input) => input.status !== 'declined' || Boolean(input.response), {
    message: 'Say why, so they know where they stand',
    path: ['response'],
  });

const include = {
  course: {
    select: { id: true, code: true, title: true, owner: { select: { id: true, fullName: true } } },
  },
  user: { select: { id: true, fullName: true, email: true } },
  decidedBy: { select: { id: true, fullName: true } },
};

const shape = (row) => ({
  id: row.id,
  status: row.status,
  requestedUntil: row.requestedUntil,
  reason: row.reason,
  grantedUntil: row.grantedUntil,
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
    const rows = await prisma.extensionRequest.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      include,
    });
    res.json({ extensions: rows.map(shape) });
  }),
);

/**
 * One open request per course. A candidate waiting on an answer does not need a
 * second way to ask, and two open requests would leave the lead deciding which
 * of them moves the deadline.
 */
router.post(
  '/courses/:courseId',
  handle(async (req, res) => {
    const input = askSchema.parse(req.body);

    const enrolment = await prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: req.user.id, courseId: req.params.courseId } },
      include: { course: { select: { ownerId: true, durationWeeks: true } } },
    });
    if (!enrolment || enrolment.status !== 'active') {
      throw new AppError(404, 'You are not on that course');
    }
    if (!enrolment.course.ownerId) {
      throw new AppError(409, 'That course has no lead yet — there is nobody to ask');
    }
    // Nothing to extend. Says so plainly rather than approving into a null.
    if (!enrolment.dueAt) {
      throw new AppError(409, 'That course has no end date, so there is nothing to extend');
    }
    if (enrolment.completedAt) {
      throw new AppError(409, 'You have already finished that course');
    }

    // Asking to be given until a date you have already passed, or one before
    // your current deadline, is not an extension — say so rather than recording
    // a request that could only ever shorten the course.
    if (input.requestedUntil <= enrolment.dueAt) {
      throw new AppError(
        422,
        'Pick a date after your current deadline — that is what an extension is.',
      );
    }

    const open = await prisma.extensionRequest.findFirst({
      where: { userId: req.user.id, courseId: req.params.courseId, status: 'requested' },
    });
    if (open) throw new AppError(409, 'You have already asked for more time on this course');

    const created = await prisma.extensionRequest.create({
      data: { courseId: req.params.courseId, userId: req.user.id, ...input },
      include,
    });

    res.status(201).json({ extension: shape(created) });
  }),
);

/** Withdrawing a request nobody has answered yet. */
router.delete(
  '/:extensionId',
  handle(async (req, res) => {
    const { count } = await prisma.extensionRequest.deleteMany({
      where: { id: req.params.extensionId, userId: req.user.id, status: 'requested' },
    });
    if (count === 0) throw new AppError(404, 'That request cannot be withdrawn');
    res.status(204).end();
  }),
);

// ---------------------------------------------------------- the answering end

/** The lead was asked; an admin can step in. A team trainer cannot. */
async function assertMayAnswer(user, courseId) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { ownerId: true },
  });
  if (!course) throw new AppError(404, 'Course not found');

  if (user.role !== 'admin' && course.ownerId !== user.id) {
    throw new AppError(403, 'Only this course’s lead can grant more time');
  }
}

router.get(
  '/inbox',
  handle(async (req, res) => {
    if (!['lead', 'admin'].includes(req.user.role)) return res.json({ extensions: [], count: 0 });

    const rows = await prisma.extensionRequest.findMany({
      where: {
        status: 'requested',
        course: req.user.role === 'admin' ? {} : { ownerId: req.user.id },
      },
      orderBy: { createdAt: 'asc' },
      include,
    });

    // The deadline each request is about, so the lead can answer without
    // opening another screen to find out what they are extending from.
    const enrolments = await prisma.enrollment.findMany({
      where: {
        courseId: { in: rows.map((r) => r.courseId) },
        userId: { in: rows.map((r) => r.userId) },
      },
      select: { userId: true, courseId: true, dueAt: true, pausedDays: true },
    });
    const dueBy = new Map(enrolments.map((e) => [`${e.userId}:${e.courseId}`, e]));

    res.json({
      extensions: rows.map((row) => ({
        ...shape(row),
        enrolment: dueBy.get(`${row.userId}:${row.courseId}`) ?? null,
      })),
      count: rows.length,
    });
  }),
);

/**
 * Granting the time, or refusing it.
 *
 * The deadline move and the decision are one transaction: a request marked
 * approved beside a deadline that never moved is worse than either failing,
 * because nobody would notice until the candidate was marked late.
 */
router.patch(
  '/:extensionId',
  handle(async (req, res) => {
    const input = answerSchema.parse(req.body);

    const request = await prisma.extensionRequest.findUnique({
      where: { id: req.params.extensionId },
    });
    if (!request) throw new AppError(404, 'Request not found');
    if (request.status !== 'requested') throw new AppError(409, 'That request has been answered');

    await assertMayAnswer(req.user, request.courseId);

    const granted =
      input.status === 'approved' ? (input.grantedUntil ?? request.requestedUntil) : null;

    const updated = await prisma.$transaction(async (tx) => {
      const answered = await tx.extensionRequest.update({
        where: { id: request.id },
        data: {
          status: input.status,
          grantedUntil: granted,
          response: input.response?.trim() || null,
          decidedById: req.user.id,
          decidedAt: new Date(),
        },
        include,
      });

      if (granted) {
        const enrolment = await tx.enrollment.findUnique({
          where: { userId_courseId: { userId: request.userId, courseId: request.courseId } },
          select: { id: true, dueAt: true },
        });

        /**
         * The deadline becomes the agreed date outright.
         *
         * Simpler than the old arithmetic and free of its bug: adding days to
         * the standing deadline meant a request answered a week late silently
         * landed a week later than either party had in mind. A date means the
         * same thing whenever it is answered.
         */
        if (enrolment) {
          await tx.enrollment.update({
            where: { id: enrolment.id },
            data: { dueAt: granted },
          });
        }
      }

      return answered;
    });

    res.json({ extension: shape(updated) });
  }),
);

export default router;
