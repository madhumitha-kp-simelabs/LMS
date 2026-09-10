import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { seededShuffle, shuffleQuizFor } from './shuffle.js';

/**
 * Shuffling is the anti-cheating half of assessment, and it has two duties that
 * pull against each other: every candidate must get a different paper, and the
 * same candidate must get the *same* paper twice — once when the quiz is served
 * and again when it is submitted, since nothing is stored in between.
 *
 * Both are silent when they break. A shuffle that stopped being deterministic
 * would mark answers against the wrong questions; one that stopped varying
 * would hand the whole cohort the same order. Neither throws.
 */

const quiz = {
  id: 'quiz-1',
  title: 'React basics',
  questions: Array.from({ length: 10 }, (_, i) => ({
    id: `q${i + 1}`,
    position: i + 1,
    prompt: `Question ${i + 1}`,
    marks: 1,
    options: Array.from({ length: 4 }, (_, j) => ({
      id: `q${i + 1}o${j + 1}`,
      position: j + 1,
      label: `Option ${j + 1}`,
      isCorrect: j === 0,
    })),
  })),
};

const ids = (q) => q.questions.map((x) => x.id);
const sit = (over) => shuffleQuizFor(quiz, { userId: 'u1', attemptNumber: 1, ...over });

describe('seededShuffle', () => {
  it('gives the same order for the same seed', () => {
    const a = seededShuffle([1, 2, 3, 4, 5, 6, 7, 8], 'seed');
    const b = seededShuffle([1, 2, 3, 4, 5, 6, 7, 8], 'seed');
    assert.deepEqual(a, b);
  });

  it('gives a different order for a different seed', () => {
    const a = seededShuffle([1, 2, 3, 4, 5, 6, 7, 8], 'seed-a');
    const b = seededShuffle([1, 2, 3, 4, 5, 6, 7, 8], 'seed-b');
    assert.notDeepEqual(a, b);
  });

  it('keeps every item exactly once', () => {
    const input = Array.from({ length: 50 }, (_, i) => i);
    const out = seededShuffle(input, 'seed');
    assert.equal(out.length, input.length);
    assert.deepEqual([...out].sort((x, y) => x - y), input);
  });

  it('leaves the input alone', () => {
    // Callers pass Prisma rows they still need in their original order.
    const input = [1, 2, 3, 4, 5];
    seededShuffle(input, 'seed');
    assert.deepEqual(input, [1, 2, 3, 4, 5]);
  });

  it('copes with empty and single-item lists', () => {
    assert.deepEqual(seededShuffle([], 'seed'), []);
    assert.deepEqual(seededShuffle(['only'], 'seed'), ['only']);
  });
});

describe('shuffleQuizFor', () => {
  it('rebuilds the identical paper from the same three facts', () => {
    // The submit route reproduces the served paper from user, quiz and attempt
    // number alone. If this drifts, answers are marked against the wrong
    // questions and nothing anywhere reports an error.
    const served = sit();
    const resubmitted = sit();
    assert.deepEqual(served, resubmitted);
  });

  it('gives two candidates different question orders', () => {
    const a = shuffleQuizFor(quiz, { userId: 'u1', attemptNumber: 1 });
    const b = shuffleQuizFor(quiz, { userId: 'u2', attemptNumber: 1 });
    assert.notDeepEqual(ids(a), ids(b));
  });

  it('gives a retake a different order from the first sitting', () => {
    const first = shuffleQuizFor(quiz, { userId: 'u1', attemptNumber: 1 });
    const second = shuffleQuizFor(quiz, { userId: 'u1', attemptNumber: 2 });
    assert.notDeepEqual(ids(first), ids(second));
  });

  it('varies the option order between questions in one paper', () => {
    // The leak this guards is subtler than two candidates matching: if every
    // question in a paper shares one seed, they all get the same permutation
    // and a candidate learns "the answer is always in slot 3". Caught by
    // mutating the option seed to drop the question id, which the
    // across-candidates check below did not notice.
    const paper = sit();
    const orders = new Set(
      paper.questions.map((q) => q.options.map((o) => o.label).join('|')),
    );
    assert.ok(
      orders.size > 1,
      `all ${paper.questions.length} questions share one option order`,
    );
  });

  it('shuffles options independently of questions', () => {
    // Two candidates who happen to land on the same question order must still
    // see its options differently, so the seeds must not be shared.
    const a = shuffleQuizFor(quiz, { userId: 'u1', attemptNumber: 1 });
    const b = shuffleQuizFor(quiz, { userId: 'u2', attemptNumber: 1 });

    const optionsFor = (paper, questionId) =>
      paper.questions.find((q) => q.id === questionId).options.map((o) => o.id);

    assert.notDeepEqual(optionsFor(a, 'q1'), optionsFor(b, 'q1'));
  });

  it('serves every question when no count is given', () => {
    assert.equal(sit().questions.length, quiz.questions.length);
    assert.deepEqual([...ids(sit())].sort(), quiz.questions.map((q) => q.id).sort());
  });

  it('draws only `count` questions when asked', () => {
    const paper = sit({ count: 4 });
    assert.equal(paper.questions.length, 4);
    assert.equal(new Set(ids(paper)).size, 4, 'no question drawn twice');
  });

  it('draws a different subset for a different candidate', () => {
    const a = shuffleQuizFor(quiz, { userId: 'u1', attemptNumber: 1, count: 4 });
    const b = shuffleQuizFor(quiz, { userId: 'u2', attemptNumber: 1, count: 4 });
    assert.notDeepEqual(ids(a).sort(), ids(b).sort());
  });

  it('serves everything when count exceeds the bank', () => {
    assert.equal(sit({ count: 999 }).questions.length, quiz.questions.length);
  });

  it('strips position from questions and options', () => {
    // Position is the canonical order. Leaving it in would let two candidates
    // sort their papers back into the same sequence and compare by number,
    // which is the exact thing the shuffling exists to prevent.
    for (const question of sit().questions) {
      assert.equal(question.position, undefined, `${question.id} still carries position`);
      for (const option of question.options) {
        assert.equal(option.position, undefined, `${option.id} still carries position`);
      }
    }
  });

  it('keeps which option is correct', () => {
    // Shuffling must move the options, never relabel them.
    for (const question of sit().questions) {
      assert.equal(question.options.filter((o) => o.isCorrect).length, 1);
    }
  });

  it('leaves the source quiz untouched', () => {
    const before = JSON.stringify(quiz);
    sit({ count: 3 });
    assert.equal(JSON.stringify(quiz), before);
  });
});
