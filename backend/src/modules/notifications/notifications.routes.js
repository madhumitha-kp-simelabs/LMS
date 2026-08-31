import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { requireAuth } from '../../middleware/auth.js';

const router = Router();
const handle = (fn) => (req, res, next) => fn(req, res, next).catch(next);

router.use(requireAuth);

/**
 * A person's own notifications. Every query is anchored on req.user.id, so
 * there is nothing to get wrong in a role check — you cannot read anyone
 * else's because the query cannot express it.
 */

const readSchema = z.object({
  // Absent means all of them, which is what "mark all read" sends.
  ids: z.array(z.string().uuid()).optional(),
});

router.get(
  '/',
  handle(async (req, res) => {
    const rows = await prisma.notification.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      // An inbox, not an audit log — nobody scrolls past a hundred notices
      // looking for the one that mattered.
      take: 100,
      include: {
        course: { select: { id: true, code: true, title: true, version: true } },
      },
    });

    /**
     * Which earlier edition each notice is asking them to leave.
     *
     * Fetched here rather than stored on the notice, because it is the one part
     * that can go stale: a candidate who has already moved should see the notice
     * as history, not as an offer to move again.
     */
    const versionNotices = rows.filter((r) => r.kind === 'new_version' && r.course);
    const holding = versionNotices.length
      ? await prisma.enrollment.findMany({
          where: {
            userId: req.user.id,
            status: 'active',
            supersededAt: null,
            course: { code: { in: versionNotices.map((r) => r.course.code) } },
          },
          select: {
            completedAt: true,
            course: { select: { id: true, code: true, version: true } },
          },
        })
      : [];
    const onNow = new Map(holding.map((e) => [e.course.code, e]));

    res.json({
      notifications: rows.map((row) => {
        const current = row.course ? onNow.get(row.course.code) : null;

        return {
          id: row.id,
          kind: row.kind,
          title: row.title,
          body: row.body,
          readAt: row.readAt,
          createdAt: row.createdAt,
          course: row.course,
          // The move is offered only while it is still available to them: they
          // are on an older edition of this subject and have not finished it.
          canMove:
            row.kind === 'new_version' &&
            Boolean(current) &&
            !current.completedAt &&
            current.course.version < row.course.version,
          currentVersion: current?.course.version ?? null,
        };
      }),
      unread: rows.filter((r) => !r.readAt).length,
    });
  }),
);

/** Just the count, for the navbar badge. */
router.get(
  '/count',
  handle(async (req, res) => {
    const count = await prisma.notification.count({
      where: { userId: req.user.id, readAt: null },
    });
    res.json({ count });
  }),
);

router.post(
  '/read',
  handle(async (req, res) => {
    const { ids } = readSchema.parse(req.body ?? {});

    const { count } = await prisma.notification.updateMany({
      // Scoped to the caller as well as the ids, so a stray id marks nothing.
      where: {
        userId: req.user.id,
        readAt: null,
        ...(ids?.length ? { id: { in: ids } } : {}),
      },
      data: { readAt: new Date() },
    });

    res.json({ read: count });
  }),
);

export default router;
