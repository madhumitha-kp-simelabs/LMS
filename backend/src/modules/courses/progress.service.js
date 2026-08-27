import { prisma } from '../../lib/prisma.js';

/**
 * Used only for a quiz that somehow carries no pass mark of its own. Every
 * quiz has one — the column defaults to 60 — so this is a floor, not a policy.
 */
const FALLBACK_PASS_MARK = 60;

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

  /**
   * The rest of each candidate's load, across the whole organisation.
   *
   * Someone crawling through this course may simply be carrying three others,
   * and without that a lead reads slow progress as a person struggling when it
   * is a person overcommitted. Which is a different conversation.
   *
   * Identity and milestones only — course, its lead, and whether they have
   * started or finished. Scores on somebody else's course belong to that
   * course's team, by the same rule that governs every other cross-course read
   * here; the point is to see how much they are carrying, not how they are
   * doing at it.
   */
  const elsewhere =
    candidateIds.length === 0
      ? []
      : await prisma.enrollment.findMany({
          where: { userId: { in: candidateIds }, courseId: { not: courseId } },
          orderBy: { enrolledAt: 'asc' },
          select: {
            userId: true,
            status: true,
            startedAt: true,
            completedAt: true,
            course: {
              select: {
                id: true,
                code: true,
                title: true,
                owner: { select: { id: true, fullName: true } },
              },
            },
          },
        });

  const elsewhereByCandidate = new Map();
  for (const row of elsewhere) {
    const list = elsewhereByCandidate.get(row.userId) ?? [];
    list.push({
      id: row.course.id,
      code: row.course.code,
      title: row.course.title,
      lead: row.course.owner?.fullName ?? null,
      status: row.status,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
    });
    elsewhereByCandidate.set(row.userId, list);
  }

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
            // The id is what lets the screen open the answers — without it the
            // row can say 40% and nothing more.
            id: true,
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
        // What this quiz asks for. Shown beside the score so "48%" reads as
        // near-miss or nowhere near, rather than as a number on its own.
        passMark: quiz ? Number(quiz.passPercentage) : null,
        passed:
          attempt && quiz
            ? Number(attempt.percentage) >= Number(quiz.passPercentage)
            : null,
        attempts: key ? (tries.get(key) ?? 0) : 0,
        attemptId: attempt?.id ?? null,
        attemptNumber: attempt?.attemptNumber ?? null,
        percentage: attempt ? Number(attempt.percentage) : null,
        totalScore: attempt?.totalScore ?? null,
        maxScore: attempt?.maxScore ?? null,
        submittedAt: attempt?.submittedAt ?? null,
      };
    });

    const withQuiz = topicRows.filter((t) => t.hasQuiz);
    const done = withQuiz.filter((t) => t.percentage !== null);

    // Areas of improvement: weakest first, then anything untouched.
    //
    // Measured against each quiz's own pass mark rather than one number for
    // the whole system. A lead who sets a quiz at 80% is saying 70% is not good
    // enough on it, and a fixed threshold would quietly overrule them.
    const weak = done
      .filter((t) => t.percentage < (t.passMark ?? FALLBACK_PASS_MARK))
      .sort((a, b) => a.percentage - b.percentage);
    const notAttempted = withQuiz.filter((t) => t.percentage === null);

    return {
      id: enrollment.userId,
      fullName: enrollment.user.fullName,
      email: enrollment.user.email,
      enrolledAt: enrollment.enrolledAt,
      startedAt: enrollment.startedAt,
      completedAt: enrollment.completedAt,
      otherCourses: elsewhereByCandidate.get(enrollment.userId) ?? [],
      topicsAllotted: myTopics.length,
      quizzesAvailable: withQuiz.length,
      quizzesDone: done.length,
      marksEarned: earned,
      marksPossible: possible,
      overallPercentage: possible === 0 ? null : round((earned / possible) * 100),
      topics: topicRows,
      needsWork: weak.map((t) => ({
        title: t.title,
        position: t.position,
        percentage: t.percentage,
        passMark: t.passMark,
      })),
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
