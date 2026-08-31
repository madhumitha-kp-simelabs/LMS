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

  await prisma.notification.createMany({
    data: earlier.map((enrolment) => ({
      userId: enrolment.userId,
      kind: 'new_version',
      courseId: course.id,
      title: `${course.code} version ${course.version} is now available`,
      body:
        `You are on version ${enrolment.course.version}. ` +
        `Version ${course.version} has revised material and may have new topics.\n\n` +
        'You can finish the version you are on, or move across — moving keeps your ' +
        'results on the old one as a record.',
    })),
    // A lead who unpublishes and republishes should not send the notice twice;
    // duplicates are cheap to skip and impossible to un-send.
    skipDuplicates: true,
  });

  return earlier.length;
}
