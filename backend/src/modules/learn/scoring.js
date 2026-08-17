/**
 * All-or-nothing MCQ scoring.
 *
 * A question earns its full marks only when the selected options are exactly
 * the correct set — every correct option chosen, and no incorrect one. There is
 * no partial credit and no negative marking, so the floor is always 0.
 */
export function scoreQuestion(question, selectedOptionIds) {
  const correct = new Set(question.options.filter((o) => o.isCorrect).map((o) => o.id));
  const selected = new Set(selectedOptionIds);

  const exactMatch =
    correct.size === selected.size && [...correct].every((id) => selected.has(id));

  return {
    isCorrect: exactMatch,
    awardedMarks: exactMatch ? question.marks : 0,
  };
}

/** Scores a whole submission. Unanswered questions simply score zero. */
export function scoreAttempt(questions, answersByQuestionId) {
  const results = questions.map((question) => {
    const selected = answersByQuestionId.get(question.id) ?? [];
    return { question, selected, ...scoreQuestion(question, selected) };
  });

  const totalScore = results.reduce((sum, r) => sum + r.awardedMarks, 0);
  const maxScore = questions.reduce((sum, q) => sum + q.marks, 0);
  // Guard against a quiz whose questions were all deleted mid-flight.
  const percentage = maxScore === 0 ? 0 : Math.round((totalScore / maxScore) * 10000) / 100;

  return { results, totalScore, maxScore, percentage };
}
