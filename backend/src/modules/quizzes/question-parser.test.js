import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuestions } from './question-parser.js';

/**
 * Importing questions fails quietly in the worst way: a document that parses
 * "successfully" but marks nothing correct produces a quiz every candidate
 * fails, and nothing in the app says why. So the cases worth pinning down are
 * the ones where a line is nearly right rather than plainly wrong.
 */

const correctLabels = (question) =>
  question.options.filter((option) => option.isCorrect).map((option) => option.label);

const one = (text) => {
  const parsed = parseQuestions(text);
  assert.equal(parsed.length, 1, `expected one question, got ${parsed.length}`);
  return parsed[0];
};

describe('parseQuestions', () => {
  it('reads a plain numbered question with an answer line', () => {
    const q = one(`1. What is Node.js?
A. A JavaScript runtime
B. A database
Correct Answer: A`);

    assert.equal(q.prompt, 'What is Node.js?');
    assert.equal(q.options.length, 2);
    assert.deepEqual(correctLabels(q), ['A JavaScript runtime']);
    assert.deepEqual(q.issues, []);
  });

  describe('answer lines a PDF has mangled', () => {
    // Word writes list markers as glyphs in a symbol font. Extraction turns
    // those into whatever character sits at that code point, so the bullet in
    // front of "Correct Answer:" arrives as a digit, a tick, a dot — anything.
    const bullets = ['3', '✓', '✔', '·', '•', '>', '-', '[]', '→'];

    for (const bullet of bullets) {
      it(`copes with a "${bullet}" before the answer`, () => {
        const q = one(`1. Which engine powers Node.js?
A. SpiderMonkey
B. V8
${bullet} Correct Answer: B`);

        assert.deepEqual(correctLabels(q), ['V8'], `"${bullet}" broke the answer line`);
        assert.deepEqual(q.issues, []);
      });
    }

    it('does not swallow the answer line into the last option', () => {
      // The symptom that made this visible: with the line unmatched it became
      // part of option B's text, and the question imported with nothing right.
      const q = one(`1. Which engine powers Node.js?
A. SpiderMonkey
B. V8
3 Correct Answer: B`);

      assert.equal(q.options[1].label, 'V8');
    });
  });

  it('ignores the page footer a PDF repeats at every break', () => {
    // "-- 1 of 4 --" starts with a dash, which is a bullet an option may use.
    // Read as one it takes letter A and shifts every real option down, so the
    // paper imports with the wrong answers marked and nothing says so.
    for (const footer of ['-- 1 of 4 --', '— 2/4 —', 'Page 3 of 10', '3 | Page', '1 of 4']) {
      const q = one(`1. Which engine powers Node.js?
A. SpiderMonkey
${footer}
B. V8
Correct Answer: B`);

      assert.equal(q.options.length, 2, `"${footer}" was read as an option`);
      assert.deepEqual(correctLabels(q), ['V8'], `"${footer}" shifted the answers`);
    }
  });

  it('does not mistake an option that talks about answers for an answer line', () => {
    // "C. Correct answer is A" begins with a letter, so the bullet prefix
    // cannot reach the keyword — which is why that prefix excludes letters.
    const q = one(`1. Pick one
A. First
B. Second
C. Correct answer is A
Answer: B`);

    assert.equal(q.options.length, 3);
    assert.equal(q.options[2].label, 'Correct answer is A');
    assert.deepEqual(correctLabels(q), ['Second']);
  });

  it('accepts the other ways of saying it', () => {
    for (const phrasing of ['Answer: B', 'Answers: B', 'Ans: B', 'Key: B', 'Correct: B', 'Correct option: B']) {
      const q = one(`1. Pick one
A. First
B. Second
${phrasing}`);
      assert.deepEqual(correctLabels(q), ['Second'], `"${phrasing}" was not understood`);
    }
  });

  it('takes a star or a trailing marker instead of an answer line', () => {
    assert.deepEqual(correctLabels(one(`1. Pick one
*A. First
B. Second`)), ['First']);

    assert.deepEqual(correctLabels(one(`1. Pick one
A. First (correct)
B. Second`)), ['First']);
  });

  it('reads several correct answers as a multiple-choice question', () => {
    const q = one(`1. Pick two
A. First
B. Second
C. Third
Answer: A, C`);

    assert.deepEqual(correctLabels(q), ['First', 'Third']);
    assert.equal(q.type, 'mcq_multi');
  });

  it('reports a question with nothing marked rather than guessing', () => {
    const q = one(`1. Pick one
A. First
B. Second`);

    assert.deepEqual(correctLabels(q), []);
    assert.ok(q.issues.length > 0, 'an unmarked question must carry an issue');
  });

  it('takes the marks line when there is one, and defaults to 1', () => {
    assert.equal(one(`1. Pick one
A. First
B. Second
Marks: 3
Answer: A`).marks, 3);

    assert.equal(one(`1. Pick one
A. First
B. Second
Answer: A`).marks, 1);
  });

  it('reads a whole document, not just the first question', () => {
    const parsed = parseQuestions(`1. First question?
A. Yes
B. No
3 Correct Answer: A
2. Second question?
A. Yes
B. No
3 Correct Answer: B`);

    assert.equal(parsed.length, 2);
    assert.deepEqual(correctLabels(parsed[0]), ['Yes']);
    assert.deepEqual(correctLabels(parsed[1]), ['No']);
  });

  it('returns nothing for text that is not a question paper', () => {
    assert.deepEqual(parseQuestions('Just some prose about Node.js.'), []);
    assert.deepEqual(parseQuestions(''), []);
  });
});
