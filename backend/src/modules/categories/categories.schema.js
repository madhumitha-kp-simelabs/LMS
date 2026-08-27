import { z } from 'zod';

export const createCategorySchema = z.object({
  name: z.string().trim().min(2, 'Give the category a name').max(60),
});

export const updateCategorySchema = z.object({
  name: z.string().trim().min(2, 'Give the category a name').max(60).optional(),
  // Moving a category up or down the list. Absolute rather than "up"/"down" so
  // a screen that drags several at once sends one request per row and the
  // outcome does not depend on the order they arrive in.
  position: z.number().int().min(1).max(999).optional(),
});

/**
 * Filing a course under a category, or taking it out of one. Nullable rather
 * than merely optional, on the same rule as every other clearable field here:
 * `null` empties it, an absent key leaves it alone.
 */
export const courseCategorySchema = z.object({
  categoryId: z.string().uuid().nullable(),
});
