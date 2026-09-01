import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';

const router = Router();
const handle = (fn) => (req, res, next) => fn(req, res, next).catch(next);

router.use(requireAuth, requireRole('trainer', 'lead', 'admin'));

/**
 * What candidates have said about the courses this person works on, across all
 * of them at once.
 *
 * A course's own feedback already shows on its Content tab, but that answers
 * "how is this course going" and only once you are already inside it. A lead
 * running four courses had no way to ask "what are people telling us", which is
 * the question feedback actually exists to answer — and the per-course panel
 * hides itself when empty, so the feature was invisible until somebody used it.
 *
 * Scoped the same way every other staff read is: your own courses, the ones you
 * are on the team of, and everything if you are an admin.
 */
router.get(
  '/',
  handle(async (req, res) => {
    const mine =
      req.user.role === 'admin'
        ? {}
        : { OR: [{ ownerId: req.user.id }, { team: { some: { userId: req.user.id } } }] };

    const entries = await prisma.courseFeedback.findMany({
      where: { course: mine },
      // Newest first: this is a page you check, not a record you audit.
      orderBy: { updatedAt: 'desc' },
      include: {
        user: { select: { id: true, fullName: true, email: true } },
        course: {
          select: {
            id: true,
            code: true,
            version: true,
            title: true,
            ownerId: true,
            category: { select: { id: true, name: true, slug: true, position: true } },
          },
        },
      },
    });

    // Every course they work on, including the ones nobody has rated — "no
    // feedback yet" is a finding, and a page that silently omits those courses
    // reads as though they have none rather than none in.
    const courses = await prisma.course.findMany({
      where: mine,
      orderBy: { code: 'asc' },
      select: {
        id: true,
        code: true,
        version: true,
        title: true,
        ownerId: true,
        category: { select: { id: true, name: true, slug: true, position: true } },
      },
    });

    /** Nulls skipped, not counted as zero — see the note in courses.routes. */
    const mean = (rows, pick) => {
      const given = rows.map(pick).filter((value) => value != null);
      if (given.length === 0) return null;
      return Math.round((given.reduce((sum, v) => sum + v, 0) / given.length) * 10) / 10;
    };

    const summarise = (rows) => ({
      count: rows.length,
      average: mean(rows, (r) => r.rating),
      distribution: [1, 2, 3, 4, 5].map((star) => rows.filter((r) => r.rating === star).length),
      content: mean(rows, (r) => r.contentRating),
      duration: mean(rows, (r) => r.durationRating),
    });

    res.json({
      feedback: entries.map((entry) => ({
        id: entry.id,
        rating: entry.rating,
        contentRating: entry.contentRating,
        durationRating: entry.durationRating,
        comment: entry.comment,
        updatedAt: entry.updatedAt,
        candidate: entry.user,
        course: entry.course,
        mine: entry.course.ownerId === req.user.id,
      })),
      courses: courses.map((course) => ({
        ...course,
        mine: course.ownerId === req.user.id,
        ...summarise(entries.filter((e) => e.courseId === course.id)),
      })),
      summary: summarise(entries),
    });
  }),
);

export default router;
