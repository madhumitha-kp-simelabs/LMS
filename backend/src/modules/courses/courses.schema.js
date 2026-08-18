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
  description: z.string().trim().max(2000).optional(),
  // Nullable so a trainer can clear it again, not just set it.
  durationWeeks: z.number().int().min(1).max(104).nullable().optional(),
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
 * Putting a team trainer on duty for a topic. Nullable rather than optional:
 * clearing a duty is an explicit `null`, not an omitted field.
 */
export const assignDutySchema = z.object({
  trainerId: z.string().uuid().nullable(),
});
