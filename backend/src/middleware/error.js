import { ZodError } from 'zod';
import { env } from '../config/env.js';

export class AppError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function notFound(req, res) {
  res.status(404).json({ error: `No route for ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity.
export function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    return res.status(422).json({
      error: 'Validation failed',
      details: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
  }

  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }

  // Anything reaching here is unexpected: log it, but never leak internals.
  console.error(err);
  return res.status(500).json({
    error: 'Something went wrong',
    ...(env.NODE_ENV === 'development' ? { debug: err.message } : {}),
  });
}
