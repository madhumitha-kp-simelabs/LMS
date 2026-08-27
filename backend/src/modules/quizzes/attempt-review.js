import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middleware/error.js';

/**
 * One submitted attempt, question by question, with the answer key.
 *
 * Shared by the candidate reviewing their own attempt and by staff reviewing
 * somebody else's. The two differ only in who is allowed to ask — the caller
 * does that check and passes the attempt id — so the shaping lives here once
 * rather than being written twice and drifting.
 *
 * Every option carries two independent flags: what was chosen, and what was
 * actually correct. A wrong answer then explains itself instead of merely being
 * marked wrong, which is the whole point of showing this to a trainer.
 */
export async function buildAttemptReview(attemptId, where = {}) {
  const attempt = await prisma.attempt.findFirst({
    where: { id: attemptId, status: 'scored', ...where },
    include: {
      candidate: { select: { id: true, fullName: true, email: true } },
      quiz: {
        include: {
          topic: {
            select: { id: true, title: true, courseId: true, position: true },
          },
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
      // A question that was never answered is not the same as one answered
      // wrongly, and a trainer reading a low score needs to tell them apart:
      // one is a knowledge gap, the other is running out of time.
      answered: Boolean(answer),
      options: question.options.map((option) => ({
        id: option.id,
        label: option.label,
        isCorrect: option.isCorrect,
        selected: chosen.has(option.id),
      })),
    };
  });

  return {
    attempt: {
      id: attempt.id,
      attemptNumber: attempt.attemptNumber,
      totalScore: attempt.totalScore,
      maxScore: attempt.maxScore,
      percentage: Number(attempt.percentage),
      submittedAt: attempt.submittedAt,
      topicTitle: attempt.quiz.topic.title,
      topicId: attempt.quiz.topic.id,
      courseId: attempt.quiz.topic.courseId,
      candidate: attempt.candidate,
    },
    questions,
  };
}
