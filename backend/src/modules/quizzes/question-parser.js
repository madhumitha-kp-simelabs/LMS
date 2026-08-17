/**
 * Parses MCQs out of the plain text extracted from a PDF or Word document.
 *
 * Documents must follow the documented template — free-form prose cannot be
 * parsed reliably, especially from PDFs, where extraction discards layout. The
 * parser is forgiving about the common variations of that template and reports
 * per-question issues rather than guessing, so a bad parse is visible in the
 * preview instead of silently creating wrong questions.
 *
 * Accepted shapes:
 *
 *   1. Which document authorises a project?      Q: / Q1. / 1. / 1)
 *   *A) Project charter                          leading * marks correct
 *   B) Work breakdown structure
 *   C) Risk register
 *   Marks: 2                                     optional, defaults to 1
 *
 * Correct options may instead be flagged by a trailing marker — (correct),
 * [x], ✔ — or by an "Answer: A, C" line after the options.
 */

const QUESTION_LINE = /^(?:Q\s*\d*\s*[.):-]|\d+\s*[.)])\s*(.+)$/i;
const OPTION_LINE = /^(\*)?\s*(?:\(?([A-Ha-h])\s*[.)]|[-•*])\s*(.+)$/;
const MARKS_LINE = /^marks?\s*[:=]\s*(\d+)\s*$/i;
// Covers "Answer:", "Answers:", "Ans:", "Key:", "Correct:", and the common
// "Correct answers:" / "Correct option(s):" phrasings.
const ANSWER_LINE =
  /^(?:correct(?:\s+(?:answers?|options?|choices?))?|answers?|ans|key)\s*[:=]\s*(.+)$/i;
const TRAILING_CORRECT = /\s*(?:\((?:correct|right|ans(?:wer)?)\)|\[\s*x\s*\]|✔|✓)\s*$/i;

const MAX_OPTIONS = 6;
const MIN_OPTIONS = 2;

function cleanOption(text) {
  const isCorrect = TRAILING_CORRECT.test(text);
  return { label: text.replace(TRAILING_CORRECT, '').trim(), isCorrect };
}

/**
 * Turns "A, C" or "A and C" or "A & C" into ['a','c'].
 *
 * Word boundaries matter: without them the "a" and "d" inside a connecting
 * word like "and" would be read as option letters.
 */
function parseAnswerLetters(value) {
  return [...value.toLowerCase().matchAll(/\b([a-h])\b/g)].map((m) => m[1]);
}

function finalise(draft) {
  if (!draft) return null;

  const issues = [];
  let options = draft.options;

  if (draft.answerLetters.length > 0) {
    // An explicit Answer: line overrides any inline marking.
    options = options.map((o) => ({
      ...o,
      isCorrect: draft.answerLetters.includes(o.letter),
    }));

    const unmatched = draft.answerLetters.filter(
      (letter) => !options.some((o) => o.letter === letter),
    );
    if (unmatched.length > 0) {
      issues.push(`Answer line refers to option ${unmatched.join(', ').toUpperCase()}, which is missing`);
    }
  }

  if (options.length < MIN_OPTIONS) issues.push('Fewer than two options were found');
  if (options.length > MAX_OPTIONS) issues.push(`More than ${MAX_OPTIONS} options were found`);
  if (options.length > 0 && !options.some((o) => o.isCorrect)) {
    issues.push('No correct answer was marked');
  }
  if (options.some((o) => o.label.length === 0)) issues.push('An option has no text');

  const correctCount = options.filter((o) => o.isCorrect).length;

  return {
    prompt: draft.prompt,
    marks: draft.marks,
    type: correctCount > 1 ? 'mcq_multi' : 'mcq_single',
    options: options.map(({ label, isCorrect }) => ({ label, isCorrect })),
    issues,
  };
}

export function parseQuestions(rawText) {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0);

  const questions = [];
  let draft = null;

  const push = () => {
    const done = finalise(draft);
    if (done) questions.push(done);
    draft = null;
  };

  for (const line of lines) {
    const marks = line.match(MARKS_LINE);
    if (marks && draft) {
      draft.marks = Math.min(100, Math.max(1, Number(marks[1])));
      continue;
    }

    const answer = line.match(ANSWER_LINE);
    if (answer && draft) {
      draft.answerLetters = parseAnswerLetters(answer[1]);
      continue;
    }

    // An option only makes sense inside a question; checking the question
    // pattern first would otherwise swallow "1) ..." style options.
    const option = draft && line.match(OPTION_LINE);
    if (option) {
      const { label, isCorrect } = cleanOption(option[3]);
      draft.options.push({
        letter: (option[2] ?? String.fromCharCode(97 + draft.options.length)).toLowerCase(),
        label,
        isCorrect: Boolean(option[1]) || isCorrect,
      });
      continue;
    }

    const question = line.match(QUESTION_LINE);
    if (question) {
      push();
      draft = { prompt: question[1].trim(), marks: 1, options: [], answerLetters: [] };
      continue;
    }

    // A continuation line: append to whatever we are currently building.
    if (draft) {
      if (draft.options.length > 0) {
        const last = draft.options[draft.options.length - 1];
        last.label = `${last.label} ${line}`.trim();
      } else {
        draft.prompt = `${draft.prompt} ${line}`.trim();
      }
    }
  }

  push();

  return questions.filter((q) => q.prompt.length > 0);
}
