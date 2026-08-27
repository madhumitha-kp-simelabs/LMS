import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { AppError } from '../../middleware/error.js';

const router = Router();
const handle = (fn) => (req, res, next) => fn(req, res, next).catch(next);

/**
 * Candidate teams: the discipline someone is being trained in — MERN, Python,
 * Project Management.
 *
 * Deliberately the same shape as categories, because it is the same idea
 * applied to people rather than courses. Reading is open to any staff account —
 * a lead looking at a candidate wants to know what they are being trained as —
 * while changing the list is an administrator's, since it describes how the
 * organisation is arranged rather than anything about one course.
 */
router.use(requireAuth, requireRole('trainer', 'lead', 'admin'));

const nameSchema = z.object({
  name: z.string().trim().min(2, 'Give the team a name').max(60),
});

const updateSchema = z.object({
  name: z.string().trim().min(2, 'Give the team a name').max(60).optional(),
  position: z.number().int().min(1).max(999).optional(),
});

/** Moving people in and out. An empty array is a legitimate "take them all out". */
const membersSchema = z.object({
  userIds: z.array(z.string().uuid()),
});

const slugify = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Case-insensitive, since two teams differing only in case is a bug nobody sees. */
async function assertNameFree(name, exceptId) {
  const clash = await prisma.team.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
  });
  if (clash && clash.id !== exceptId) {
    throw new AppError(409, `There is already a team called “${clash.name}”`);
  }
}

router.get(
  '/',
  handle(async (req, res) => {
    const teams = await prisma.team.findMany({
      orderBy: { position: 'asc' },
      include: { _count: { select: { members: true } } },
    });

    res.json({
      teams: teams.map(({ _count, ...team }) => ({ ...team, members: _count.members })),
    });
  }),
);

const adminOnly = requireRole('admin');

router.post(
  '/',
  adminOnly,
  handle(async (req, res) => {
    const { name } = nameSchema.parse(req.body);
    await assertNameFree(name);

    const last = await prisma.team.findFirst({
      orderBy: { position: 'desc' },
      select: { position: true },
    });

    const team = await prisma.team.create({
      data: { name, slug: slugify(name), position: (last?.position ?? 0) + 1 },
    });
    res.status(201).json({ team });
  }),
);

router.patch(
  '/:teamId',
  adminOnly,
  handle(async (req, res) => {
    const { name, position } = updateSchema.parse(req.body);

    const team = await prisma.team.findUnique({ where: { id: req.params.teamId } });
    if (!team) throw new AppError(404, 'Team not found');
    if (name) await assertNameFree(name, team.id);

    res.json({
      team: await prisma.team.update({
        where: { id: team.id },
        // The slug follows the name, so a team renamed from a typo does not
        // keep the typo in its key for ever.
        data: { ...(name && { name, slug: slugify(name) }), ...(position != null && { position }) },
      }),
    });
  }),
);

/** Removing a team leaves its members in place, unassigned. */
router.delete(
  '/:teamId',
  adminOnly,
  handle(async (req, res) => {
    const team = await prisma.team.findUnique({
      where: { id: req.params.teamId },
      include: { _count: { select: { members: true } } },
    });
    if (!team) throw new AppError(404, 'Team not found');

    await prisma.team.delete({ where: { id: team.id } });
    res.json({ unassigned: team._count.members });
  }),
);

/**
 * Putting people on a team, several at a time — the normal case, since teams
 * are filled in a sitting rather than one person at a time.
 *
 * Anyone already on another team simply moves: a person is being trained as one
 * thing, so this is an assignment rather than a membership list, and refusing
 * the move would make an administrator remove before adding for no reason.
 */
router.post(
  '/:teamId/members',
  adminOnly,
  handle(async (req, res) => {
    const { userIds } = membersSchema.parse(req.body);

    const team = await prisma.team.findUnique({ where: { id: req.params.teamId } });
    if (!team) throw new AppError(404, 'Team not found');

    const people = await prisma.user.findMany({
      where: { id: { in: userIds }, role: 'candidate' },
      select: { id: true },
    });
    if (people.length !== new Set(userIds).size) {
      throw new AppError(422, 'Teams are for candidates — one or more of those accounts is not one');
    }

    const { count } = await prisma.user.updateMany({
      where: { id: { in: people.map((p) => p.id) } },
      data: { teamId: team.id },
    });

    res.json({ moved: count });
  }),
);

/** Taking one person off, without touching anything else about them. */
router.delete(
  '/:teamId/members/:userId',
  adminOnly,
  handle(async (req, res) => {
    const { count } = await prisma.user.updateMany({
      where: { id: req.params.userId, teamId: req.params.teamId },
      data: { teamId: null },
    });
    if (count === 0) throw new AppError(404, 'That person is not on this team');

    res.status(204).end();
  }),
);

export default router;
