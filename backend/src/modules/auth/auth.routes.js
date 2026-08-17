import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { registerSchema, loginSchema, createUserSchema } from './auth.schema.js';
import * as authService from './auth.service.js';

const router = Router();

// Wraps an async handler so rejected promises reach the error middleware.
const handle = (fn) => (req, res, next) => fn(req, res, next).catch(next);

router.post(
  '/register',
  handle(async (req, res) => {
    const input = registerSchema.parse(req.body);
    const result = await authService.register(input);
    res.status(201).json(result);
  }),
);

router.post(
  '/login',
  handle(async (req, res) => {
    const input = loginSchema.parse(req.body);
    const result = await authService.login(input);
    res.json(result);
  }),
);

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

router.post(
  '/users',
  requireAuth,
  requireRole('admin'),
  handle(async (req, res) => {
    const input = createUserSchema.parse(req.body);
    const user = await authService.createUser(input);
    res.status(201).json({ user });
  }),
);

export default router;
