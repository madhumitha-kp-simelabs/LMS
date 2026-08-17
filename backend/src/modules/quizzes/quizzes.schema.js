import { z } from 'zod';

const optionSchema = z.object({
  label: z.string().trim().min(1, 'Option text is required').max(500),
  isCorrect: z.boolean(),
});

export const questionSchema = z
  .object({
    prompt: z.string().trim().min(3, 'Question text is required').max(2000),
    marks: z.number().int().min(1).max(100).default(1),
    options: z
      .array(optionSchema)
      .min(2, 'A question needs at least two options')
      .max(6, 'A question can have at most six options'),
  })
  .refine((q) => q.options.some((o) => o.isCorrect), {
    message: 'Mark at least one option as correct',
    path: ['options'],
  });

export const updateQuizSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  // null means unlimited retakes.
  maxAttempts: z.number().int().min(1).max(50).nullable().optional(),
  passPercentage: z.number().min(0).max(100).optional(),
  isPublished: z.boolean().optional(),
});
