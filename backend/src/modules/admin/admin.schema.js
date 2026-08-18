import { z } from 'zod';
import { createCourseSchema } from '../courses/courses.schema.js';

/**
 * Marking someone a trainer, or putting them back to a candidate.
 *
 * `admin` is deliberately absent: minting an administrator goes through
 * POST /auth/users, so it always comes with a deliberate account creation
 * rather than a dropdown change on a list of names.
 */
export const setUserRoleSchema = z.object({
  role: z.enum(['candidate', 'trainer']),
});

/**
 * Handing a course to someone. A course always has exactly one owner, so there
 * is no "unallot" — allot it to someone else instead.
 *
 * The person need not already be a trainer: picking a candidate here marks them
 * as one, which is the whole point of the allotment screen.
 */
export const createAllotmentSchema = z.object({
  courseId: z.string().uuid(),
  userId: z.string().uuid(),
});

/**
 * Putting a trainer on a course's team. As with allotting, naming a candidate
 * marks them a trainer — an admin picking someone off the list means "this
 * person works on this course".
 */
export const addTeamMemberSchema = z.object({
  userId: z.string().uuid(),
});

/**
 * Admin course creation: a code and a title, and nothing more is required.
 *
 * `trainerId` is optional because deciding who runs a course is a separate
 * step on the allotment screen — a course with no trainer yet is a normal
 * state, not an error. Naming someone here marks them a trainer, exactly as
 * allotting does.
 */
export const createCourseSchemaAdmin = createCourseSchema.extend({
  trainerId: z.string().uuid().optional(),
});
