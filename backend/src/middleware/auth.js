import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from './error.js';

/**
 * Verifies the bearer token and loads the current user onto req.user.
 *
 * The user is re-read from the database on every request rather than trusted
 * from the token body, so deactivating an account or changing someone's role
 * takes effect immediately instead of when their token expires.
 */
export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization ?? '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw new AppError(401, 'Missing or malformed Authorization header');
    }

    let payload;
    try {
      payload = jwt.verify(token, env.JWT_SECRET);
    } catch {
      throw new AppError(401, 'Invalid or expired token');
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, fullName: true, role: true, isActive: true },
    });

    if (!user) throw new AppError(401, 'Account no longer exists');
    if (!user.isActive) throw new AppError(403, 'This account has been deactivated');

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Restricts a route to the given roles. Must run after requireAuth.
 * `admin` is NOT implicitly allowed — list it explicitly where it applies,
 * so every route states its full audience in one place.
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(new AppError(401, 'Not authenticated'));
    if (!roles.includes(req.user.role)) {
      return next(new AppError(403, 'You do not have permission to do that'));
    }
    next();
  };
}
