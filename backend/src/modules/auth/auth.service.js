import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { AppError } from '../../middleware/error.js';

const SALT_ROUNDS = 12;

// Compared against when no user matches, so a wrong email and a wrong password
// take the same amount of time. Without this, response timing tells an attacker
// which emails are registered.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', SALT_ROUNDS);

const PUBLIC_FIELDS = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  isActive: true,
  createdAt: true,
};

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  });
}

/** Public sign-up. Always creates a candidate — never a trainer or admin. */
export async function register({ email, password, fullName }) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new AppError(409, 'An account with that email already exists');

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await prisma.user.create({
    data: { email, passwordHash, fullName, role: 'candidate' },
    select: PUBLIC_FIELDS,
  });

  return { user, token: signToken(user) };
}

export async function login({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH);
    throw new AppError(401, 'Invalid email or password');
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) throw new AppError(401, 'Invalid email or password');

  if (!user.isActive) throw new AppError(403, 'This account has been deactivated');

  const { passwordHash, ...safeUser } = user;
  return { user: safeUser, token: signToken(safeUser) };
}

/** Admin-only user creation — the only path that can mint trainers and admins. */
export async function createUser({ email, password, fullName, role }) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new AppError(409, 'An account with that email already exists');

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  return prisma.user.create({
    data: { email, passwordHash, fullName, role },
    select: PUBLIC_FIELDS,
  });
}
