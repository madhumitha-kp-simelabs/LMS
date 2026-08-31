import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import {
  assignDutySchema,
  createTopicSchema,
  updateCourseAdminSchema,
  updateCourseSchema,
  updateTopicSchema,
} from './courses.schema.js';
import * as courses from './courses.service.js';
import { courseProgress } from './progress.service.js';

const router = Router();
const handle = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// Everything here is trainer/admin territory. Candidates use /api/learn.
router.use(requireAuth, requireRole('trainer', 'lead', 'admin'));

router.get(
  '/',
  handle(async (req, res) => {
    res.json({ courses: await courses.listCourses(req.user) });
  }),
);

// Creating a course lives at POST /api/admin/courses — an admin decides which
// courses exist and what they are called. Trainers fill in the ones they are
// allotted: topics, material, quizzes, and the course's own duration and code.

router.get(
  '/:courseId',
  handle(async (req, res) => {
    res.json({ course: await courses.getCourse(req.user, req.params.courseId) });
  }),
);

router.patch(
  '/:courseId',
  handle(async (req, res) => {
    // The schema itself enforces the rule: a trainer's payload has no `code`
    // field to parse, so sending one is silently dropped rather than applied.
    const schema = req.user.role === 'admin' ? updateCourseAdminSchema : updateCourseSchema;
    const input = schema.parse(req.body);
    res.json({ course: await courses.updateCourse(req.user, req.params.courseId, input) });
  }),
);

router.delete(
  '/:courseId',
  handle(async (req, res) => {
    await courses.deleteCourse(req.user, req.params.courseId);
    res.status(204).end();
  }),
);

/** How every candidate on this course is progressing. */
router.get(
  '/:courseId/progress',
  handle(async (req, res) => {
    await courses.assertCourseRead(req.user, req.params.courseId);
    res.json(await courseProgress(req.params.courseId));
  }),
);

/** What candidates said about this course, with the distribution of ratings. */
router.get(
  '/:courseId/feedback',
  handle(async (req, res) => {
    await courses.assertCourseRead(req.user, req.params.courseId);

    const entries = await prisma.courseFeedback.findMany({
      where: { courseId: req.params.courseId },
      include: { user: { select: { id: true, fullName: true, email: true } } },
      orderBy: { updatedAt: 'desc' },
    });

    const distribution = [1, 2, 3, 4, 5].map(
      (star) => entries.filter((e) => e.rating === star).length,
    );

    /**
     * The mean of one dimension, over the people who rated it.
     *
     * Nulls are skipped rather than counted as zero — feedback left before the
     * breakdown existed would otherwise drag every average down and make the
     * course look worse the longer it has been running.
     */
    const mean = (pick) => {
      const given = entries.map(pick).filter((value) => value != null);
      if (given.length === 0) return null;
      return {
        average: Math.round((given.reduce((sum, v) => sum + v, 0) / given.length) * 10) / 10,
        count: given.length,
      };
    };

    res.json({
      feedback: entries,
      summary: {
        count: entries.length,
        average:
          entries.length === 0
            ? null
            : Math.round((entries.reduce((sum, e) => sum + e.rating, 0) / entries.length) * 10) /
              10,
        distribution,
        // What the overall is made of. Either can be null, meaning nobody who
        // has rated this course has rated that part of it yet.
        content: mean((e) => e.contentRating),
        duration: mean((e) => e.durationRating),
      },
    });
  }),
);

/**
 * Copying a course into its next version — the way a revised edition is made.
 *
 * Everything describing the course comes across; nobody on it does. The copy is
 * a draft, so the cohort part-way through the current edition is undisturbed
 * while the new one is revised.
 */
router.post(
  '/:courseId/duplicate',
  handle(async (req, res) => {
    const course = await courses.duplicateCourse(req.user, req.params.courseId);
    res.status(201).json({ course });
  }),
);

router.post(
  '/:courseId/topics',
  handle(async (req, res) => {
    const input = createTopicSchema.parse(req.body);
    res.status(201).json({ topic: await courses.createTopic(req.user, req.params.courseId, input) });
  }),
);

router.patch(
  '/topics/:topicId',
  handle(async (req, res) => {
    const input = updateTopicSchema.parse(req.body);
    res.json({ topic: await courses.updateTopic(req.user, req.params.topicId, input) });
  }),
);

/**
 * The lead handing out a topic's two jobs. Send either half, or both; a null
 * hands that half back to nobody.
 */
router.patch(
  '/topics/:topicId/duty',
  handle(async (req, res) => {
    const duties = assignDutySchema.parse(req.body);
    res.json({ topic: await courses.assignTopicDuties(req.user, req.params.topicId, duties) });
  }),
);

router.delete(
  '/topics/:topicId',
  handle(async (req, res) => {
    await courses.deleteTopic(req.user, req.params.topicId);
    res.status(204).end();
  }),
);

export default router;
