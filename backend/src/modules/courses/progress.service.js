import { prisma } from '../../lib/prisma.js';

/** Below this, a topic is called out as needing work. */
const WEAK_THRESHOLD = 50;

const round = (n) => Math.round(n * 10) / 10;

/**
 * How every candidate on a course is doing.
 *
 * Scores follow the same rule as the candidate's own view — the LATEST scored
 * attempt per quiz, marks-weighted — so a trainer and a candidate never see
 * different numbers for the same work.
 */
export async function courseProgress(courseId) {
  const [topics, enrollments, assignments] = await Promise.all([
    prisma.topic.findMany({
      where: { courseId },
      orderBy: { position: 'asc' },
      select: {
        id: true,
        title: true,
        position: true,
        quiz: { select: { id: true, isPublished: true, passPercentage: true } },
      },
    }),
    prisma.enrollment.findMany({
      where: { courseId, status: 'active' },
      include: { user: { select: { id: true, fullName: true, email: true } } },
      orderBy: { enrolledAt: 'asc' },
    }),
    prisma.topicAssignment.findMany({
      where: { topic: { courseId } },
      select: { userId: true, topicId: true },
    }),
  ]);

  const quizIds = topics.filter((t) => t.quiz?.isPublished).map((t) => t.quiz.id);
  const candidateIds = enrollments.map((e) => e.userId);

  const attempts =
    quizIds.length === 0 || candidateIds.length === 0
      ? []
      : await prisma.attempt.findMany({
          where: {
            quizId: { in: quizIds },
            candidateId: { in: candidateIds },
            status: 'scored',
          },
          orderBy: [{ quizId: 'asc' }, { attemptNumber: 'asc' }],
          select: {
            candidateId: true,
            quizId: true,
            attemptNumber: true,
            totalScore: true,
            maxScore: true,
            percentage: true,
            submittedAt: true,
          },
        });

  // Latest attempt per candidate per quiz — ascending order means later rows win.
  const latest = new Map();
  const tries = new Map();
  for (const a of attempts) {
    const key = `${a.candidateId}:${a.quizId}`;
    latest.set(key, a);
    tries.set(key, (tries.get(key) ?? 0) + 1);
  }

  const allottedByUser = new Map();
  for (const a of assignments) {
    if (!allottedByUser.has(a.userId)) allottedByUser.set(a.userId, new Set());
    allottedByUser.get(a.userId).add(a.topicId);
  }

  const candidates = enrollments.map((enrollment) => {
    const allotted = allottedByUser.get(enrollment.userId) ?? new Set();
    const myTopics = topics.filter((t) => allotted.has(t.id));

    let earned = 0;
    let possible = 0;

    const topicRows = myTopics.map((topic) => {
      const quiz = topic.quiz?.isPublished ? topic.quiz : null;
      const key = quiz ? `${enrollment.userId}:${quiz.id}` : null;
      const attempt = key ? latest.get(key) : null;

      if (attempt) {
        earned += attempt.totalScore;
        possible += attempt.maxScore;
      }

      return {
        topicId: topic.id,
        title: topic.title,
        position: topic.position,
        hasQuiz: Boolean(quiz),
        attempts: key ? (tries.get(key) ?? 0) : 0,
        percentage: attempt ? Number(attempt.percentage) : null,
        totalScore: attempt?.totalScore ?? null,
        maxScore: attempt?.maxScore ?? null,
        submittedAt: attempt?.submittedAt ?? null,
      };
    });

    const withQuiz = topicRows.filter((t) => t.hasQuiz);
    const done = withQuiz.filter((t) => t.percentage !== null);

    // Areas of improvement: weakest scores first, then anything untouched.
    const weak = done
      .filter((t) => t.percentage < WEAK_THRESHOLD)
      .sort((a, b) => a.percentage - b.percentage);
    const notAttempted = withQuiz.filter((t) => t.percentage === null);

    return {
      id: enrollment.userId,
      fullName: enrollment.user.fullName,
      email: enrollment.user.email,
      enrolledAt: enrollment.enrolledAt,
      startedAt: enrollment.startedAt,
      completedAt: enrollment.completedAt,
      topicsAllotted: myTopics.length,
      quizzesAvailable: withQuiz.length,
      quizzesDone: done.length,
      marksEarned: earned,
      marksPossible: possible,
      overallPercentage: possible === 0 ? null : round((earned / possible) * 100),
      topics: topicRows,
      needsWork: weak.map((t) => ({ title: t.title, position: t.position, percentage: t.percentage })),
      notAttempted: notAttempted.map((t) => ({ title: t.title, position: t.position })),
    };
  });

  const scored = candidates.filter((c) => c.overallPercentage !== null);

  // Which topics the group as a whole struggles with — the signal for fixing
  // the course rather than coaching one person.
  const topicDifficulty = topics
    .filter((t) => t.quiz?.isPublished)
    .map((topic) => {
      const scores = candidates
        .map((c) => c.topics.find((t) => t.topicId === topic.id))
        .filter((t) => t?.percentage !== null && t !== undefined)
        .map((t) => t.percentage);

      return {
        topicId: topic.id,
        title: topic.title,
        position: topic.position,
        responses: scores.length,
        average: scores.length === 0 ? null : round(scores.reduce((a, b) => a + b, 0) / scores.length),
      };
    })
    .filter((t) => t.average !== null)
    .sort((a, b) => a.average - b.average);

  return {
    candidates,
    summary: {
      candidates: candidates.length,
      started: candidates.filter((c) => c.startedAt).length,
      completed: candidates.filter((c) => c.completedAt).length,
      averageScore:
        scored.length === 0
          ? null
          : round(scored.reduce((sum, c) => sum + c.overallPercentage, 0) / scored.length),
      weakestTopics: topicDifficulty.slice(0, 3),
    },
  };
}
