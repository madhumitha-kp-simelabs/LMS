import { prisma } from '../../lib/prisma.js';

/**
 * Writing notifications.
 *
 * Kept apart from the routes that read them because nothing which *creates* a
 * notification is about notifications — a lead publishing a revised edition is
 * publishing a course. Those places should be able to say "tell them" in a line
 * without importing a router.
 *
 * Every call site treats this as best effort. A notice that fails to save must
 * never take down the thing it was reporting: publishing the course is what
 * matters, and losing the publish because the notice failed is the wrong trade.
 */

/**
 * A later edition has been published — tell the people still on an earlier one.
 *
 * Only candidates who are actively on an older version and have not finished
 * it. Somebody who completed v1 has nothing to decide, and somebody whose
 * enrolment was already superseded has moved on once and should not be chased
 * again.
 *
 * The notice names both versions. "The course changed" is not actionable;
 * "you are on v1, v2 is out" tells them exactly what the choice is.
 */
export async function announceNewVersion(course) {
  if (course.version <= 1) return 0;

  const earlier = await prisma.enrollment.findMany({
    where: {
      status: 'active',
      completedAt: null,
      supersededAt: null,
      course: { code: course.code, version: { lt: course.version } },
      // Staff on the course are not learners on it, and the ones who built the
      // new edition least of all.
      user: { role: { in: ['candidate', 'lead'] } },
    },
    select: { userId: true, course: { select: { version: true } } },
  });

  if (earlier.length === 0) return 0;

  /**
   * One person, one notice.
   *
   * Somebody active on two earlier editions matches twice above, and is still
   * one person being told one thing. The highest edition they are on is the
   * one worth quoting back: "you are on version 2" is true and useful where
   * "you are on version 1" would be stale.
   */
  const onVersion = new Map();
  for (const enrolment of earlier) {
    const seen = onVersion.get(enrolment.userId);
    if (seen === undefined || enrolment.course.version > seen) {
      onVersion.set(enrolment.userId, enrolment.course.version);
    }
  }

  /**
   * Nobody is told about the same edition twice.
   *
   * Publishing is not a one-off: a lead can unpublish and republish, or
   * publish, revise and publish again, and every one of those sent the whole
   * cohort another copy of the same sentence. One candidate had four.
   *
   * This was meant to be handled by `skipDuplicates: true` on the insert,
   * which never did anything — that only skips rows breaking a unique
   * constraint, and Notification has none. The check has to be explicit.
   */
  const alreadyTold = await prisma.notification.findMany({
    where: { kind: 'new_version', courseId: course.id },
    select: { userId: true },
  });
  for (const notice of alreadyTold) onVersion.delete(notice.userId);

  if (onVersion.size === 0) return 0;

  await prisma.notification.createMany({
    data: [...onVersion].map(([userId, version]) => ({
      userId,
      kind: 'new_version',
      courseId: course.id,
      title: `${course.code} version ${course.version} is now available`,
      body:
        `You are on version ${version}. ` +
        `Version ${course.version} has revised material and may have new topics.

` +
        'You can finish the version you are on, or move across — moving keeps your ' +
        'results on the old one as a record.',
    })),
  });

  return onVersion.size;
}
