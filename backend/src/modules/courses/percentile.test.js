import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { percentileRank } from './progress.service.js';

/**
 * A percentile is read as a standing, so getting it subtly wrong is worse than
 * not showing one: "83rd" tells a lead somebody is near the top of their
 * cohort, and nothing on the screen would reveal that the arithmetic had
 * drifted.
 *
 * The mid-rank method is what these pin down — ties sit in the middle of their
 * band rather than all at its top or all at its bottom.
 */

describe('percentileRank', () => {
  it('is null for a cohort of one', () => {
    // One person is not a distribution. Any formula returns 50 here, which
    // would read as a real middling standing rather than as no answer.
    assert.equal(percentileRank(80, [80]), null);
  });

  it('is null when the candidate has no score', () => {
    assert.equal(percentileRank(null, [10, 20, 30]), null);
  });

  it('is null when nobody has a score', () => {
    assert.equal(percentileRank(null, []), null);
  });

  it('places bottom, middle and top of an evenly spread cohort', () => {
    const marks = [0, 50, 100];
    assert.equal(percentileRank(0, marks), 17);
    assert.equal(percentileRank(50, marks), 50);
    assert.equal(percentileRank(100, marks), 83);
  });

  it('puts everyone in a fully tied cohort at the middle', () => {
    // Not 0 and not 100: four people on the same mark are level with each
    // other, and either extreme would be a lie about three of them.
    const marks = [50, 50, 50, 50];
    for (const mark of marks) assert.equal(percentileRank(mark, marks), 50);
  });

  it('splits a tie so the pair share the band between them', () => {
    // 40, 40, 90: the two on 40 sit below the 90 and level with each other.
    const marks = [40, 40, 90];
    assert.equal(percentileRank(40, marks), 33);
    assert.equal(percentileRank(90, marks), 83);
  });

  it('never reports 0 or 100, because nobody is below or above themselves', () => {
    const marks = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    for (const mark of marks) {
      const rank = percentileRank(mark, marks);
      assert.ok(rank > 0, `${mark} came out at ${rank}`);
      assert.ok(rank < 100, `${mark} came out at ${rank}`);
    }
  });

  it('ranks a mark not in the cohort by where it would fall', () => {
    // A candidate whose score is recomputed between reads must still rank
    // sensibly rather than throwing or landing at an extreme.
    assert.equal(percentileRank(45, [10, 40, 90, 100]), 50);
  });

  it('orders candidates the same way their marks do', () => {
    const marks = [12, 34, 56, 78, 91];
    const ranks = marks.map((m) => percentileRank(m, marks));
    const ascending = [...ranks].sort((a, b) => a - b);
    assert.deepEqual(ranks, ascending, 'a higher mark must never rank lower');
  });

  it('is unaffected by the order the cohort arrives in', () => {
    const marks = [70, 20, 90, 20, 55];
    const shuffled = [55, 90, 20, 70, 20];
    for (const mark of marks) {
      assert.equal(percentileRank(mark, marks), percentileRank(mark, shuffled));
    }
  });

  it('returns whole numbers', () => {
    // The screen prints these unformatted, so a fraction would leak through.
    const marks = [1, 2, 3, 4, 5, 6, 7];
    for (const mark of marks) {
      assert.equal(Number.isInteger(percentileRank(mark, marks)), true);
    }
  });
});
