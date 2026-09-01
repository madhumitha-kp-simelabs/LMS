import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middleware/error.js';

/**
 * Pausing and resuming one candidate's clock on one course.
 *
 * Two people can do this — the candidate, from their own schedule card, and the
 * course's lead on their behalf. The lead's is the case the handbook actually
 * describes: somebody is pulled onto a project or goes on leave, and it is the
 * lead who knows and records it, not the person who has stopped logging in.
 *
 * Both go through here rather than each computing the arithmetic themselves. A
 * pause that added days one way and a different number the other would be a
 * quiet, permanent divergence in people's deadlines.
 */

/** Whole days between two instants, rounded down. */
const daysBetween = (from, to) => Math.floor((to.getTime() - from.getTime()) / 86400000);

async function load(userId, courseId) {
  const enrolment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
    include: { user: { select: { fullName: true } } },
  });
  if (!enrolment || enrolment.status !== 'active') {
    throw new AppError(404, 'That candidate is not on this course');
  }
  return enrolment;
}

/**
 * Stopping the clock.
 *
 * Refused on a course already finished, stopped, or moved off — there is no
 * deadline left to protect, and pausing one would leave a state nobody can
 * reason about later.
 */
export async function pauseEnrolment(userId, courseId) {
  const enrolment = await load(userId, courseId);

  if (enrolment.pausedAt) throw new AppError(409, 'That course is already paused');
  if (enrolment.completedAt) throw new AppError(409, 'That course is already finished');
  if (enrolment.discontinuedAt) throw new AppError(409, 'That course has been stopped');
  if (enrolment.supersededAt) {
    throw new AppError(409, 'That candidate has moved to a later version of this course');
  }

  const updated = await prisma.enrollment.update({
    where: { id: enrolment.id },
    data: { pausedAt: new Date() },
  });

  return { pausedAt: updated.pausedAt, fullName: enrolment.user.fullName };
}

/**
 * Starting it again, and giving back exactly the days lost.
 *
 * Rounded down, so a pause of a few hours buys nobody a day — and so the
 * alternative, a deadline that drifts by hours every time somebody pauses over
 * lunch, does not happen.
 */
export async function resumeEnrolment(userId, courseId) {
  const enrolment = await load(userId, courseId);
  if (!enrolment.pausedAt) throw new AppError(409, 'That course is not paused');

  const lost = Math.max(0, daysBetween(enrolment.pausedAt, new Date()));

  const updated = await prisma.enrollment.update({
    where: { id: enrolment.id },
    data: {
      pausedAt: null,
      pausedDays: enrolment.pausedDays + lost,
      // Only a course that had a deadline gets one moved.
      ...(enrolment.dueAt && {
        dueAt: new Date(enrolment.dueAt.getTime() + lost * 86400000),
      }),
    },
  });

  return { daysPaused: lost, dueAt: updated.dueAt, fullName: enrolment.user.fullName };
}
