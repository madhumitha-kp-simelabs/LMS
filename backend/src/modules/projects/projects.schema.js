import { z } from 'zod';

export const createProjectSchema = z.object({
  title: z.string().trim().min(3).max(200),
  brief: z.string().trim().max(4000).optional(),
  // Nullable so a deadline can be cleared again, not only set.
  dueAt: z.coerce.date().nullable().optional(),
});

export const updateProjectSchema = createProjectSchema.partial();

/** An admin handing a project to people — several at a time is the normal case. */
export const allotProjectSchema = z.object({
  candidateIds: z.array(z.string().uuid()).min(1, 'Pick at least one candidate'),
});

/** A candidate marking their own copy finished, or undoing it. */
export const setDoneSchema = z.object({
  done: z.boolean(),
});

/** What the candidate handed in: a link, a note, or both. Empty clears it. */
export const submissionSchema = z.object({
  url: z.string().trim().url('Enter a full link, starting with http').or(z.literal('')).nullable().optional(),
  note: z.string().trim().max(2000).or(z.literal('')).nullable().optional(),
});

/**
 * The lead's mark on one candidate's work: a score out of 100, a comment, or
 * both. Refused when empty, because "evaluated, said nothing" is not a
 * judgement — clearing a mark is a DELETE, not an empty save.
 */
export const evaluationSchema = z
  .object({
    score: z.coerce.number().int().min(0, 'Score cannot be below 0').max(100, 'Score is out of 100').nullable().optional(),
    feedback: z.string().trim().max(4000).or(z.literal('')).nullable().optional(),
  })
  .refine((input) => input.score != null || Boolean(input.feedback), {
    message: 'Give a score, written feedback, or both',
    path: ['feedback'],
  });
