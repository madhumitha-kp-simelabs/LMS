import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';

const router = Router();
const handle = (fn) => (req, res, next) => fn(req, res, next).catch(next);

router.use(requireAuth, requireRole('admin'));

const round = (n, dp = 1) => Math.round(n * 10 ** dp) / 10 ** dp;

/**
 * Organisation-wide overview: every course, trainer and candidate in one
 * payload, so the dashboard renders from a single request.
 *
 * Scores follow the same rule as everywhere else — the LATEST scored attempt
 * per quiz counts, not the best — and are marks-weighted so a 10-mark quiz
 * carries more than a 2-mark one.
 */
router.get(
  '/overview',
  handle(async (req, res) => {
    const [courses, users, attempts] = await Promise.all([
      prisma.course.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          owner: { select: { id: true, fullName: true } },
          _count: { select: { topics: true } },
          enrollments: { select: { userId: true, status: true } },
          feedback: { select: { rating: true } },
        },
      }),
      prisma.user.findMany({
        orderBy: { fullName: 'asc' },
        include: {
          _count: {
            select: {
              coursesOwned: true,
              enrollments: true,
              topicAccess: true,
              attempts: true,
            },
          },
        },
      }),
      prisma.attempt.findMany({
        where: { status: 'scored' },
        orderBy: [{ quizId: 'asc' }, { attemptNumber: 'asc' }],
        select: {
          candidateId: true,
          quizId: true,
          totalScore: true,
          maxScore: true,
          submittedAt: true,
        },
      }),
    ]);

    // Latest attempt per candidate per quiz — later rows overwrite earlier ones
    // because the query is ordered by attemptNumber ascending.
    const latest = new Map();
    for (const attempt of attempts) {
      latest.set(`${attempt.candidateId}:${attempt.quizId}`, attempt);
    }

    const perCandidate = new Map();
    for (const attempt of latest.values()) {
      const entry = perCandidate.get(attempt.candidateId) ?? {
        earned: 0,
        possible: 0,
        quizzes: 0,
        lastActive: null,
      };
      entry.earned += attempt.totalScore;
      entry.possible += attempt.maxScore;
      entry.quizzes += 1;
      if (!entry.lastActive || attempt.submittedAt > entry.lastActive) {
        entry.lastActive = attempt.submittedAt;
      }
      perCandidate.set(attempt.candidateId, entry);
    }

    const courseRows = courses.map((course) => {
      const active = course.enrollments.filter((e) => e.status === 'active').length;
      const pending = course.enrollments.filter((e) => e.status === 'pending').length;
      const ratings = course.feedback.map((f) => f.rating);

      return {
        id: course.id,
        code: course.code,
        title: course.title,
        isPublished: course.isPublished,
        createdAt: course.createdAt,
        trainer: course.owner,
        topics: course._count.topics,
        candidates: active,
        pendingRequests: pending,
        feedbackCount: ratings.length,
        feedbackAverage:
          ratings.length === 0 ? null : round(ratings.reduce((a, b) => a + b, 0) / ratings.length),
      };
    });

    // How many distinct candidates each trainer reaches, across their courses.
    const reachByTrainer = new Map();
    for (const course of courses) {
      const set = reachByTrainer.get(course.ownerId) ?? new Set();
      for (const e of course.enrollments) {
        if (e.status === 'active') set.add(e.userId);
      }
      reachByTrainer.set(course.ownerId, set);
    }

    const trainers = users
      .filter((u) => u.role === 'trainer')
      .map((u) => ({
        id: u.id,
        fullName: u.fullName,
        email: u.email,
        isActive: u.isActive,
        createdAt: u.createdAt,
        courses: u._count.coursesOwned,
        candidatesReached: reachByTrainer.get(u.id)?.size ?? 0,
      }));

    const candidates = users
      .filter((u) => u.role === 'candidate')
      .map((u) => {
        const s = perCandidate.get(u.id);
        return {
          id: u.id,
          fullName: u.fullName,
          email: u.email,
          isActive: u.isActive,
          createdAt: u.createdAt,
          courses: u._count.enrollments,
          topicsAllotted: u._count.topicAccess,
          attempts: u._count.attempts,
          quizzesDone: s?.quizzes ?? 0,
          averageScore: s && s.possible > 0 ? round((s.earned / s.possible) * 100) : null,
          lastActive: s?.lastActive ?? null,
        };
      });

    const admins = users
      .filter((u) => u.role === 'admin')
      .map((u) => ({
        id: u.id,
        fullName: u.fullName,
        email: u.email,
        isActive: u.isActive,
        createdAt: u.createdAt,
      }));

    const scored = candidates.filter((c) => c.averageScore !== null);

    res.json({
      stats: {
        courses: courseRows.length,
        publishedCourses: courseRows.filter((c) => c.isPublished).length,
        trainers: trainers.length,
        candidates: candidates.length,
        admins: admins.length,
        topics: courseRows.reduce((sum, c) => sum + c.topics, 0),
        attempts: attempts.length,
        pendingRequests: courseRows.reduce((sum, c) => sum + c.pendingRequests, 0),
        averageScore:
          scored.length === 0
            ? null
            : round(scored.reduce((sum, c) => sum + c.averageScore, 0) / scored.length),
      },
      // Per-course rows are computed above for the headline figures, but not
      // returned — the admin view is about people, not course content.
      trainers,
      candidates,
      admins,
    });
  }),
);

export default router;
