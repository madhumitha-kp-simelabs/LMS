import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import {
  createCourseSchema,
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
router.use(requireAuth, requireRole('trainer', 'admin'));

router.get(
  '/',
  handle(async (req, res) => {
    res.json({ courses: await courses.listCourses(req.user) });
  }),
);

router.post(
  '/',
  handle(async (req, res) => {
    const input = createCourseSchema.parse(req.body);
    res.status(201).json({ course: await courses.createCourse(req.user, input) });
  }),
);

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
    await courses.assertCourseAccess(req.user, req.params.courseId);
    res.json(await courseProgress(req.params.courseId));
  }),
);

/** What candidates said about this course, with the distribution of ratings. */
router.get(
  '/:courseId/feedback',
  handle(async (req, res) => {
    await courses.assertCourseAccess(req.user, req.params.courseId);

    const entries = await prisma.courseFeedback.findMany({
      where: { courseId: req.params.courseId },
      include: { user: { select: { id: true, fullName: true, email: true } } },
      orderBy: { updatedAt: 'desc' },
    });

    const distribution = [1, 2, 3, 4, 5].map(
      (star) => entries.filter((e) => e.rating === star).length,
    );
    const average =
      entries.length === 0
        ? null
        : Math.round((entries.reduce((sum, e) => sum + e.rating, 0) / entries.length) * 10) / 10;

    res.json({
      feedback: entries,
      summary: { count: entries.length, average, distribution },
    });
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

router.delete(
  '/topics/:topicId',
  handle(async (req, res) => {
    await courses.deleteTopic(req.user, req.params.topicId);
    res.status(204).end();
  }),
);

export default router;
