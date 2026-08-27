import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { createCategorySchema, updateCategorySchema } from './categories.schema.js';
import * as categories from './categories.service.js';

const router = Router();
const handle = (fn) => (req, res, next) => fn(req, res, next).catch(next);

router.use(requireAuth);

/** Everyone signed in reads the list — every course screen groups by it. */
router.get(
  '/',
  handle(async (req, res) => {
    res.json({ categories: await categories.list() });
  }),
);

/** Changing the list is an administrator's. */
const adminOnly = requireRole('admin');

router.post(
  '/',
  adminOnly,
  handle(async (req, res) => {
    const input = createCategorySchema.parse(req.body);
    res.status(201).json({ category: await categories.create(input) });
  }),
);

router.patch(
  '/:categoryId',
  adminOnly,
  handle(async (req, res) => {
    const input = updateCategorySchema.parse(req.body);
    res.json({ category: await categories.update(req.params.categoryId, input) });
  }),
);

/** The courses filed under it survive, uncategorised. */
router.delete(
  '/:categoryId',
  adminOnly,
  handle(async (req, res) => {
    res.json(await categories.remove(req.params.categoryId));
  }),
);

export default router;
