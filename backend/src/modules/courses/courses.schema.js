import { z } from 'zod';

export const createCourseSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(2)
    .max(20)
    .regex(/^[A-Z0-9-]+$/, 'Use letters, numbers and hyphens only'),
  title: z.string().trim().min(3).max(200),
  // Nullable, not merely optional: an emptied box has to be able to clear the
  // field, while an omitted one means "leave it alone".
  description: z.string().trim().max(2000).nullable().optional(),
  // Nullable so a trainer can clear it again, not just set it.
  durationWeeks: z.number().int().min(1).max(104).nullable().optional(),
  // What the course is about. Nullable on the same rule: an emptied picker
  // takes the course out of its category rather than being ignored.
  categoryId: z.string().uuid().nullable().optional(),
  isPublished: z.boolean().optional(),
});

// Trainers may not rename a course's code — it identifies the course to
// everyone and is referenced outside the system.
export const updateCourseSchema = createCourseSchema.partial().omit({ code: true });

/** Admins may additionally change the code. */
export const updateCourseAdminSchema = createCourseSchema.partial();

export const createTopicSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(2000).optional(),
  isPublished: z.boolean().optional(),
});

export const updateTopicSchema = createTopicSchema.partial();

/**
 * Handing out a topic's two jobs. Each key is optional so one half can be
 * changed without touching the other, but nullable rather than merely absent:
 * clearing a duty is an explicit `null`, and omitting it means "leave it alone".
 */
export const assignDutySchema = z
  .object({
    material: z.string().uuid().nullable().optional(),
    quiz: z.string().uuid().nullable().optional(),
  })
  .refine((d) => 'material' in d || 'quiz' in d, {
    message: 'Name at least one of material or quiz',
  });
