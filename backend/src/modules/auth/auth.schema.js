import { z } from 'zod';

const email = z.string().trim().toLowerCase().email('Enter a valid email address');

// 8 chars is the floor, not the goal. Length beats character classes, so we
// require length and leave composition to the user.
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters');

const fullName = z.string().trim().min(2, 'Enter your full name').max(120);

export const registerSchema = z.object({ email, password, fullName });

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required'),
});

export const createUserSchema = z.object({
  email,
  password,
  fullName,
  role: z.enum(['candidate', 'trainer', 'admin']),
});
