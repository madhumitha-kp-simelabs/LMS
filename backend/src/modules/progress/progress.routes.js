import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { courseProgress } from '../courses/progress.service.js';

const router = Router();
const handle = (fn) => (req, res, next) => fn(req, res, next).catch(next);

router.use(requireAuth, requireRole('trainer', 'lead', 'admin'));

/**
 * Every candidate on every course this person works on, in one list.
 *
 * The per-course progress screen answers "how is this cohort doing", and only
 * once you have picked a course. A lead running three courses had no way to ask
 * the question that actually starts the week — who is stuck, anywhere — without
 * opening each course and comparing by eye.
 *
 * Built by reusing courseProgress per course rather than writing a second,
 * wider query: the two screens must agree on what "needs work" means, and the
 * cheapest way to guarantee that is for one of them to be the other's parts.
 */
router.get(
  '/',
  handle(async (req, res) => {
    const mine =
      req.user.role === 'admin'
        ? {}
        : { OR: [{ ownerId: req.user.id }, { team: { some: { userId: req.user.id } } }] };

    const courses = await prisma.course.findMany({
      where: mine,
      orderBy: { code: 'asc' },
      select: {
        id: true,
        code: true,
        title: true,
        ownerId: true,
        category: { select: { id: true, name: true, slug: true, position: true } },
      },
    });

    // Sequential rather than Promise.all: this is a handful of courses on a
    // page nobody reloads in a loop, and firing every course's progress query
    // at once buys milliseconds at the cost of a connection spike.
    const rows = [];
    for (const course of courses) {
      const { candidates } = await courseProgress(course.id);

      for (const candidate of candidates) {
        rows.push({
          ...candidate,
          course: {
            id: course.id,
            code: course.code,
            title: course.title,
            category: course.category,
          },
          // Whether the reader can act here, or is only looking on. Marking and
          // publishing belong to the course's lead.
          mine: course.ownerId === req.user.id,
        });
      }
    }

    res.json({
      // One row per candidate per course — somebody on two courses is two rows,
      // because their standing on one says nothing about the other.
      progress: rows,
      courses: courses.map((course) => ({
        ...course,
        mine: course.ownerId === req.user.id,
        candidates: rows.filter((r) => r.course.id === course.id).length,
      })),
    });
  }),
);

/**
 * Candidates who have run past their deadline, for the lead's inbox.
 *
 * Computed on request rather than written as notification rows when the date
 * passes. Overdue is not an event, it is a condition: it stops being true the
 * moment somebody finishes, is granted more time, or has their course paused,
 * and a stored notice would sit in the inbox insisting otherwise. Deriving it
 * also means no scheduled job — there is nothing in this application that runs
 * on a clock, and adding one to send a message that can be worked out on the
 * spot would be machinery for its own sake.
 *
 * Paused candidates are excluded: their clock is stopped, which is exactly the
 * arrangement that says they are not late.
 */
router.get(
  '/overdue',
  handle(async (req, res) => {
    const mine =
      req.user.role === 'admin'
        ? {}
        : { OR: [{ ownerId: req.user.id }, { team: { some: { userId: req.user.id } } }] };

    const rows = await prisma.enrollment.findMany({
      where: {
        status: 'active',
        completedAt: null,
        discontinuedAt: null,
        supersededAt: null,
        pausedAt: null,
        dueAt: { not: null, lt: new Date() },
        course: mine,
      },
      // Furthest past their date first — the person three weeks over needs
      // attention before the one who slipped yesterday.
      orderBy: { dueAt: 'asc' },
      include: {
        user: { select: { id: true, fullName: true, email: true } },
        course: {
          select: {
            id: true,
            code: true,
            version: true,
            title: true,
            ownerId: true,
          },
        },
      },
    });

    const now = Date.now();

    res.json({
      overdue: rows.map((row) => ({
        id: `${row.courseId}:${row.userId}`,
        candidate: row.user,
        course: row.course,
        // Whether the reader can do anything about it, or is only being told.
        mine: row.course.ownerId === req.user.id,
        dueAt: row.dueAt,
        startedAt: row.startedAt,
        pausedDays: row.pausedDays,
        daysOver: Math.floor((now - row.dueAt.getTime()) / 86400000),
      })),
      count: rows.length,
    });
  }),
);

export default router;
