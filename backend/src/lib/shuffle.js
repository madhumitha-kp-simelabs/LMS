/**
 * Deterministic shuffling, for serving a quiz in a different order to each
 * candidate.
 *
 * Seeded rather than random on purpose. A candidate who refreshes the page
 * mid-quiz, or whose connection drops and comes back, must see the paper they
 * were already halfway through — a fresh order every request would be a worse
 * experience than no shuffling at all. Seeding on the candidate, the quiz and
 * the attempt number gives an order that is stable for one sitting, different
 * for the next retake, and different for the person beside them, without
 * storing anything.
 *
 * This is not cryptography and does not need to be. The property required is
 * "two candidates get different papers", not "the order is unguessable" — the
 * answer key never leaves the server either way.
 */

/** 32-bit FNV-1a. Fast, well spread, and short enough to read. */
function hash(seed) {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — a small PRNG with a good enough period for shuffling a page. */
function generator(seed) {
  let state = hash(seed) || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher-Yates, over a copy. The input is left alone because callers pass
 * Prisma rows they still need in their original order elsewhere.
 */
export function seededShuffle(items, seed) {
  const out = [...items];
  const next = generator(seed);

  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }

  return out;
}

/**
 * One quiz, ordered for one candidate's next sitting.
 *
 * Questions and options are shuffled with different seeds, so two candidates
 * who happen to get the same question order still see its options differently.
 *
 * `count` draws that many questions from the bank instead of serving all of
 * them. Omit it and every question is served, which is the right answer for a
 * quiz too small to have a bank.
 *
 * `position` is deliberately dropped from what goes back. It is the canonical
 * order, and leaving it in would let two candidates sort their papers back into
 * the same sequence and compare answers by number — which is the exact thing
 * the shuffling is for.
 */
export function shuffleQuizFor(quiz, { userId, attemptNumber, count = null }) {
  const base = `${userId}:${quiz.id}:${attemptNumber}`;

  // Shuffle first, then take from the top. Selection and order fall out of the
  // one seed, so the submit route can rebuild the exact same paper from the
  // same three facts without anything being stored between the two requests.
  const drawn = seededShuffle(quiz.questions, base);
  const paper = count != null && count < drawn.length ? drawn.slice(0, count) : drawn;

  return {
    ...quiz,
    questions: paper.map(({ position, ...question }) => ({
      ...question,
      options: seededShuffle(question.options, `${base}:${question.id}`).map(
        ({ position: _, ...option }) => option,
      ),
    })),
  };
}
