import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { AppError } from '../../middleware/error.js';
import { scoreAttempt } from './scoring.js';

const router = Router();
const handle = (fn) => (req, res, next) => fn(req, res, next).catch(next);

router.use(requireAuth, requireRole('candidate'));

/**
 * Stamps the day a candidate first opened anything in a course.
 *
 * Only ever set once — updateMany with a startedAt:null filter means a second
 * visit cannot overwrite the original date, and no read-then-write race can
 * either.
 */
async function markStarted(userId, courseId) {
  await prisma.enrollment.updateMany({
    where: { userId, courseId, startedAt: null },
    data: { startedAt: new Date() },
  });
}

/**
 * Marks a course complete once every published quiz on the candidate's
 * allotted topics has at least one scored attempt.
 *
 * Recomputed after each submission rather than counted incrementally, so it
 * stays correct when a trainer allots a new topic or publishes another quiz —
 * which un-completes the course until that quiz is attempted too.
 */
async function refreshCompletion(userId, courseId) {
  const allotted = await prisma.topicAssignment.findMany({
    where: { userId, topic: { courseId } },
    select: { topic: { select: { quiz: { select: { id: true, isPublished: true } } } } },
  });

  const quizIds = allotted
    .map((a) => a.topic.quiz)
    .filter((q) => q?.isPublished)
    .map((q) => q.id);

  if (quizIds.length === 0) return;

  const attempted = await prisma.attempt.findMany({
    where: { candidateId: userId, quizId: { in: quizIds }, status: 'scored' },
    select: { quizId: true },
    distinct: ['quizId'],
  });

  const done = attempted.length === quizIds.length;

  if (done) {
    // Only stamp a course that isn't already complete — retaking a quiz later
    // must not move the original completion date forward.
    await prisma.enrollment.updateMany({
      where: { userId, courseId, completedAt: null },
      data: { completedAt: new Date() },
    });
  } else {
    // Allotting a new topic or publishing another quiz reopens the course.
    await prisma.enrollment.updateMany({
      where: { userId, courseId, completedAt: { not: null } },
      data: { completedAt: null },
    });
  }
}

/** Throws unless this topic has been allotted to the signed-in candidate. */
async function assertAllotted(userId, topicId) {
  const allotted = await prisma.topicAssignment.findUnique({
    where: { userId_topicId: { userId, topicId } },
  });
  // Same response whether the topic is missing or simply not theirs, so this
  // can't be used to discover which topics exist.
  if (!allotted) throw new AppError(404, 'Topic not found');
}

/**
 * The candidate's own view of their courses.
 *
 * Every query here is anchored on TopicAssignment rather than Course, so a
 * candidate can only ever see topics explicitly allotted to them — unallotted
 * topics in the same course are invisible, not merely locked.
 */
router.get(
  '/my-courses',
  handle(async (req, res) => {
    const assignments = await prisma.topicAssignment.findMany({
      where: { userId: req.user.id },
      include: {
        topic: {
          include: {
            course: { select: { id: true, code: true, title: true, description: true } },
            _count: { select: { materials: true } },
            quiz: { select: { id: true, isPublished: true } },
          },
        },
      },
    });

    // Latest scored attempt per quiz, for the sidebar badges.
    const attempts = await prisma.attempt.findMany({
      where: { candidateId: req.user.id, status: 'scored' },
      orderBy: { attemptNumber: 'desc' },
      select: { quizId: true, percentage: true, attemptNumber: true },
    });
    const latestByQuiz = new Map();
    for (const a of attempts) {
      if (!latestByQuiz.has(a.quizId)) latestByQuiz.set(a.quizId, a);
    }

    const byCourse = new Map();
    for (const { topic } of assignments) {
      if (!byCourse.has(topic.course.id)) {
        byCourse.set(topic.course.id, { ...topic.course, topics: [] });
      }

      const latest = topic.quiz ? latestByQuiz.get(topic.quiz.id) : null;

      byCourse.get(topic.course.id).topics.push({
        id: topic.id,
        title: topic.title,
        description: topic.description,
        position: topic.position,
        materialCount: topic._count.materials,
        hasQuiz: Boolean(topic.quiz?.isPublished),
        latestScore: latest ? Number(latest.percentage) : null,
      });
    }

    const courses = [...byCourse.values()].map((course) => ({
      ...course,
      topics: course.topics.sort((a, b) => a.position - b.position),
    }));

    res.json({ courses });
  }),
);

/**
 * Every published course, for browsing.
 *
 * Summary only — title, description and how big the course is. Topics,
 * material and questions are deliberately excluded: browsing is not a way to
 * read content you have not been allotted.
 */
router.get(
  '/catalogue',
  handle(async (req, res) => {
    const [courses, enrollments] = await Promise.all([
      prisma.course.findMany({
        where: { isPublished: true },
        orderBy: { title: 'asc' },
        select: {
          id: true,
          code: true,
          title: true,
          description: true,
          durationWeeks: true,
          owner: { select: { fullName: true } },
          _count: { select: { topics: true } },
        },
      }),
      prisma.enrollment.findMany({
        where: { userId: req.user.id },
        select: { courseId: true, status: true },
      }),
    ]);

    const statusByCourse = new Map(enrollments.map((e) => [e.courseId, e.status]));

    // How many topics the candidate can actually open, so an approved course
    // that has not been allotted yet is honest about showing nothing.
    const allotted = await prisma.topicAssignment.groupBy({
      by: ['topicId'],
      where: { userId: req.user.id },
    });
    const allottedTopicIds = new Set(allotted.map((a) => a.topicId));
    const topicsPerCourse = await prisma.topic.findMany({
      where: { id: { in: [...allottedTopicIds] } },
      select: { id: true, courseId: true },
    });
    const allottedCount = new Map();
    for (const topic of topicsPerCourse) {
      allottedCount.set(topic.courseId, (allottedCount.get(topic.courseId) ?? 0) + 1);
    }

    res.json({
      courses: courses.map((course) => ({
        id: course.id,
        code: course.code,
        title: course.title,
        description: course.description,
        durationWeeks: course.durationWeeks,
        trainerName: course.owner.fullName,
        topicCount: course._count.topics,
        // 'none' | 'pending' | 'active'
        subscription: statusByCourse.get(course.id) ?? 'none',
        allottedTopics: allottedCount.get(course.id) ?? 0,
      })),
    });
  }),
);

/** Asks to join a course. Creates a pending request — never instant access. */
router.post(
  '/courses/:courseId/subscribe',
  handle(async (req, res) => {
    const course = await prisma.course.findFirst({
      where: { id: req.params.courseId, isPublished: true },
    });
    if (!course) throw new AppError(404, 'Course not found');

    const existing = await prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: req.user.id, courseId: course.id } },
    });
    if (existing) {
      throw new AppError(
        409,
        existing.status === 'pending'
          ? 'You have already asked to join this course'
          : 'You are already enrolled in this course',
      );
    }

    const enrollment = await prisma.enrollment.create({
      data: { userId: req.user.id, courseId: course.id, status: 'pending' },
    });

    res.status(201).json({ subscription: enrollment.status });
  }),
);

/** Withdraws a request that has not been approved yet. */
router.delete(
  '/courses/:courseId/subscribe',
  handle(async (req, res) => {
    const existing = await prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: req.user.id, courseId: req.params.courseId } },
    });
    if (!existing) throw new AppError(404, 'You have not asked to join this course');

    // Cancelling an approved enrollment would strip access a trainer granted,
    // so only pending requests can be withdrawn here.
    if (existing.status !== 'pending') {
      throw new AppError(409, 'Your place on this course has been approved — ask your trainer to remove you');
    }

    await prisma.enrollment.delete({ where: { id: existing.id } });
    res.status(204).end();
  }),
);

const feedbackSchema = z.object({
  rating: z.number().int().min(1, 'Give a rating from 1 to 5').max(5),
  comment: z.string().trim().max(2000).optional(),
});

/** Only an approved member of a course may comment on it. */
async function assertEnrolled(userId, courseId) {
  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
  });
  if (!enrollment || enrollment.status !== 'active') {
    throw new AppError(403, 'You can only give feedback on a course you are enrolled in');
  }
}

router.get(
  '/courses/:courseId/feedback',
  handle(async (req, res) => {
    const feedback = await prisma.courseFeedback.findUnique({
      where: { userId_courseId: { userId: req.user.id, courseId: req.params.courseId } },
      select: { rating: true, comment: true, updatedAt: true },
    });
    res.json({ feedback });
  }),
);

/** Upsert, so editing feedback replaces it rather than adding a second entry. */
router.put(
  '/courses/:courseId/feedback',
  handle(async (req, res) => {
    await assertEnrolled(req.user.id, req.params.courseId);
    const input = feedbackSchema.parse(req.body);

    const feedback = await prisma.courseFeedback.upsert({
      where: { userId_courseId: { userId: req.user.id, courseId: req.params.courseId } },
      update: { rating: input.rating, comment: input.comment ?? null },
      create: {
        userId: req.user.id,
        courseId: req.params.courseId,
        rating: input.rating,
        comment: input.comment ?? null,
      },
      select: { rating: true, comment: true, updatedAt: true },
    });

    res.json({ feedback });
  }),
);

router.delete(
  '/courses/:courseId/feedback',
  handle(async (req, res) => {
    const { count } = await prisma.courseFeedback.deleteMany({
      where: { userId: req.user.id, courseId: req.params.courseId },
    });
    if (count === 0) throw new AppError(404, 'You have not left feedback on this course');
    res.status(204).end();
  }),
);

/**
 * Score analysis for the signed-in candidate.
 *
 * "Their score" is the LATEST scored attempt per quiz, not the best — retakes
 * are meant to reflect current understanding. Every attempt is still returned
 * so the trend over repeated tries is visible.
 */
router.get(
  '/progress',
  handle(async (req, res) => {
    const [assignments, enrollments] = await Promise.all([
      prisma.topicAssignment.findMany({
        where: { userId: req.user.id },
        include: {
          topic: {
            include: {
              course: { select: { id: true, code: true, title: true } },
              quiz: { select: { id: true, title: true, isPublished: true, passPercentage: true } },
            },
          },
        },
      }),
      prisma.enrollment.findMany({
        where: { userId: req.user.id },
        select: { courseId: true, enrolledAt: true, startedAt: true, completedAt: true },
      }),
    ]);

    const datesByCourse = new Map(enrollments.map((e) => [e.courseId, e]));

    const quizIds = assignments
      .map((a) => a.topic.quiz)
      .filter((q) => q?.isPublished)
      .map((q) => q.id);

    const attempts = await prisma.attempt.findMany({
      where: { candidateId: req.user.id, quizId: { in: quizIds }, status: 'scored' },
      orderBy: [{ quizId: 'asc' }, { attemptNumber: 'asc' }],
      select: {
        id: true,
        quizId: true,
        attemptNumber: true,
        totalScore: true,
        maxScore: true,
        percentage: true,
        submittedAt: true,
      },
    });

    const byQuiz = new Map();
    for (const attempt of attempts) {
      if (!byQuiz.has(attempt.quizId)) byQuiz.set(attempt.quizId, []);
      byQuiz.get(attempt.quizId).push({ ...attempt, percentage: Number(attempt.percentage) });
    }

    const byCourse = new Map();
    for (const { topic } of assignments) {
      if (!byCourse.has(topic.course.id)) {
        byCourse.set(topic.course.id, { ...topic.course, topics: [] });
      }

      const quiz = topic.quiz?.isPublished ? topic.quiz : null;
      const history = quiz ? (byQuiz.get(quiz.id) ?? []) : [];
      const latest = history.length > 0 ? history[history.length - 1] : null;
      const best = history.reduce(
        (top, a) => (top === null || a.percentage > top.percentage ? a : top),
        null,
      );

      byCourse.get(topic.course.id).topics.push({
        topicId: topic.id,
        title: topic.title,
        position: topic.position,
        hasQuiz: Boolean(quiz),
        passPercentage: quiz ? Number(quiz.passPercentage) : null,
        attemptCount: history.length,
        latest: latest && {
          percentage: latest.percentage,
          totalScore: latest.totalScore,
          maxScore: latest.maxScore,
          submittedAt: latest.submittedAt,
        },
        bestPercentage: best?.percentage ?? null,
        history: history.map((a) => ({
          attemptNumber: a.attemptNumber,
          percentage: a.percentage,
          submittedAt: a.submittedAt,
        })),
      });
    }

    const courses = [...byCourse.values()].map((course) => {
      const topics = course.topics.sort((a, b) => a.position - b.position);
      const withQuiz = topics.filter((t) => t.hasQuiz);
      const attempted = withQuiz.filter((t) => t.latest);

      // Marks-weighted, so a 10-mark quiz counts more than a 2-mark one.
      const earned = attempted.reduce((sum, t) => sum + t.latest.totalScore, 0);
      const possible = attempted.reduce((sum, t) => sum + t.latest.maxScore, 0);

      const dates = datesByCourse.get(course.id);

      return {
        ...course,
        topics,
        dates: {
          enrolledAt: dates?.enrolledAt ?? null,
          startedAt: dates?.startedAt ?? null,
          completedAt: dates?.completedAt ?? null,
        },
        summary: {
          quizzesAvailable: withQuiz.length,
          quizzesAttempted: attempted.length,
          marksEarned: earned,
          marksPossible: possible,
          overallPercentage: possible === 0 ? null : Math.round((earned / possible) * 1000) / 10,
        },
      };
    });

    res.json({ courses });
  }),
);

router.get(
  '/topics/:topicId',
  handle(async (req, res) => {
    await assertAllotted(req.user.id, req.params.topicId);

    const topic = await prisma.topic.findUnique({
      where: { id: req.params.topicId },
      include: {
        course: { select: { id: true, code: true, title: true } },
        materials: {
          orderBy: { position: 'asc' },
          select: {
            id: true,
            type: true,
            title: true,
            originalFilename: true,
            mimeType: true,
            fileSizeBytes: true,
          },
        },
      },
    });

    // Opening a topic is what "starting the course" means.
    await markStarted(req.user.id, topic.courseId);

    res.json({ topic });
  }),
);

/**
 * The quiz as the candidate sees it: questions and options, but never the
 * isCorrect flag. The answer key must not reach the browser, or it can be read
 * straight out of the network tab.
 */
router.get(
  '/topics/:topicId/quiz',
  handle(async (req, res) => {
    await assertAllotted(req.user.id, req.params.topicId);

    const quiz = await prisma.quiz.findUnique({
      where: { topicId: req.params.topicId },
      include: {
        questions: {
          orderBy: { position: 'asc' },
          select: {
            id: true,
            type: true,
            prompt: true,
            marks: true,
            position: true,
            options: {
              orderBy: { position: 'asc' },
              select: { id: true, label: true, position: true },
            },
          },
        },
      },
    });

    if (!quiz || !quiz.isPublished) throw new AppError(404, 'No quiz is available for this topic');

    const attempts = await prisma.attempt.findMany({
      where: { candidateId: req.user.id, quizId: quiz.id, status: 'scored' },
      orderBy: { attemptNumber: 'desc' },
      select: {
        id: true,
        attemptNumber: true,
        totalScore: true,
        maxScore: true,
        percentage: true,
        submittedAt: true,
      },
    });

    const attemptsLeft =
      quiz.maxAttempts == null ? null : Math.max(0, quiz.maxAttempts - attempts.length);

    res.json({
      quiz: {
        id: quiz.id,
        title: quiz.title,
        maxAttempts: quiz.maxAttempts,
        passPercentage: Number(quiz.passPercentage),
        questions: quiz.questions,
        totalMarks: quiz.questions.reduce((sum, q) => sum + q.marks, 0),
      },
      attempts,
      attemptsLeft,
      canAttempt: attemptsLeft === null || attemptsLeft > 0,
    });
  }),
);

/**
 * The answer key for one of the candidate's own submitted attempts.
 *
 * Deliberately a separate endpoint behind an explicit action, rather than part
 * of the submit response: it is the only place isCorrect is exposed to a
 * candidate, and it is reachable only for an attempt they have already sat.
 */
router.get(
  '/attempts/:attemptId/review',
  handle(async (req, res) => {
    const attempt = await prisma.attempt.findFirst({
      // Scoped to the caller — one candidate can never review another's attempt.
      where: { id: req.params.attemptId, candidateId: req.user.id, status: 'scored' },
      include: {
        quiz: {
          include: {
            topic: { select: { id: true, title: true } },
            questions: {
              orderBy: { position: 'asc' },
              include: { options: { orderBy: { position: 'asc' } } },
            },
          },
        },
        answers: { include: { selectedOptions: true } },
      },
    });

    if (!attempt) throw new AppError(404, 'Attempt not found');

    const answerByQuestion = new Map(attempt.answers.map((a) => [a.questionId, a]));

    const questions = attempt.quiz.questions.map((question) => {
      const answer = answerByQuestion.get(question.id);
      const chosen = new Set((answer?.selectedOptions ?? []).map((s) => s.optionId));

      return {
        id: question.id,
        prompt: question.prompt,
        type: question.type,
        marks: question.marks,
        awardedMarks: answer?.awardedMarks ?? 0,
        isCorrect: answer?.isCorrect ?? false,
        options: question.options.map((option) => ({
          id: option.id,
          label: option.label,
          isCorrect: option.isCorrect,
          selected: chosen.has(option.id),
        })),
      };
    });

    res.json({
      attempt: {
        id: attempt.id,
        attemptNumber: attempt.attemptNumber,
        totalScore: attempt.totalScore,
        maxScore: attempt.maxScore,
        percentage: Number(attempt.percentage),
        submittedAt: attempt.submittedAt,
        topicTitle: attempt.quiz.topic.title,
      },
      questions,
    });
  }),
);

const submitSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().uuid(),
        optionIds: z.array(z.string().uuid()),
      }),
    )
    .min(1, 'Answer at least one question'),
});

router.post(
  '/topics/:topicId/quiz/attempts',
  handle(async (req, res) => {
    await assertAllotted(req.user.id, req.params.topicId);
    const { answers } = submitSchema.parse(req.body);

    const quiz = await prisma.quiz.findUnique({
      where: { topicId: req.params.topicId },
      include: { questions: { include: { options: true } } },
    });
    if (!quiz || !quiz.isPublished) throw new AppError(404, 'No quiz is available for this topic');
    if (quiz.questions.length === 0) throw new AppError(422, 'This quiz has no questions');

    const priorAttempts = await prisma.attempt.count({
      where: { candidateId: req.user.id, quizId: quiz.id, status: 'scored' },
    });
    if (quiz.maxAttempts != null && priorAttempts >= quiz.maxAttempts) {
      throw new AppError(409, `You have used all ${quiz.maxAttempts} attempts for this quiz`);
    }

    // Reject answers that reference another quiz's questions, or options that
    // don't belong to the question they were submitted under.
    const questionsById = new Map(quiz.questions.map((q) => [q.id, q]));
    const answersByQuestionId = new Map();

    for (const answer of answers) {
      const question = questionsById.get(answer.questionId);
      if (!question) throw new AppError(422, 'An answer refers to a question outside this quiz');

      const validOptionIds = new Set(question.options.map((o) => o.id));
      for (const optionId of answer.optionIds) {
        if (!validOptionIds.has(optionId)) {
          throw new AppError(422, 'An answer refers to an option outside its question');
        }
      }
      answersByQuestionId.set(answer.questionId, [...new Set(answer.optionIds)]);
    }

    const { results, totalScore, maxScore, percentage } = scoreAttempt(
      quiz.questions,
      answersByQuestionId,
    );

    // One transaction so a half-written attempt can never be left behind.
    const attempt = await prisma.$transaction(async (tx) => {
      const created = await tx.attempt.create({
        data: {
          candidateId: req.user.id,
          quizId: quiz.id,
          attemptNumber: priorAttempts + 1,
          status: 'scored',
          submittedAt: new Date(),
          totalScore,
          maxScore,
          percentage,
        },
      });

      for (const result of results) {
        await tx.answer.create({
          data: {
            attemptId: created.id,
            questionId: result.question.id,
            awardedMarks: result.awardedMarks,
            isCorrect: result.isCorrect,
            status: 'submitted',
            selectedOptions: {
              create: result.selected.map((optionId) => ({ optionId })),
            },
          },
        });
      }

      return created;
    });

    // Submitting counts as starting, in case they went straight to the quiz.
    const topic = await prisma.topic.findUnique({
      where: { id: req.params.topicId },
      select: { courseId: true },
    });
    await markStarted(req.user.id, topic.courseId);
    await refreshCompletion(req.user.id, topic.courseId);

    res.status(201).json({
      attempt: {
        id: attempt.id,
        attemptNumber: attempt.attemptNumber,
        totalScore,
        maxScore,
        percentage,
        passed: percentage >= Number(quiz.passPercentage),
      },
      // Which questions were right, but deliberately NOT which options were
      // correct — retakes are unlimited, so handing over the answer key would
      // make the next attempt meaningless.
      breakdown: results.map((r) => ({
        questionId: r.question.id,
        prompt: r.question.prompt,
        marks: r.question.marks,
        awardedMarks: r.awardedMarks,
        isCorrect: r.isCorrect,
      })),
    });
  }),
);

export default router;
