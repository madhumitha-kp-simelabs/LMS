import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { AppError } from '../../middleware/error.js';
// Imported by name, not as a namespace: the overview handler below has its own
// local `courses`, and shadowing the module would be a trap waiting to happen.
import { createCourseForTrainer } from '../courses/courses.service.js';
import {
  addTeamMemberSchema,
  createAllotmentSchema,
  createCourseSchemaAdmin,
  setUserRoleSchema,
} from './admin.schema.js';

const router = Router();
const handle = (fn) => (req, res, next) => fn(req, res, next).catch(next);

router.use(requireAuth, requireRole('admin'));

const round = (n, dp = 1) => Math.round(n * 10 ** dp) / 10 ** dp;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Resolves the person a course is being handed to, marking them a trainer if
 * they are still a candidate.
 *
 * Guards both paths that set an owner — creating a course and reallotting one.
 * The promotion is deliberately part of the same act: an admin picking a name
 * off the list means "this person runs this course", and doing it in two steps
 * would leave the course owned by someone who cannot open it. Takes a
 * transaction so the promotion and the allotment land together.
 */
async function takeOnAsTrainer(tx, userId) {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { id: true, fullName: true, role: true, isActive: true },
  });

  if (!user) throw new AppError(404, 'That person no longer exists');
  if (user.role === 'admin') {
    throw new AppError(400, `${user.fullName} is an administrator — courses are run by trainers`);
  }
  if (!user.isActive) {
    throw new AppError(400, `${user.fullName}’s account is deactivated`);
  }

  if (user.role === 'candidate') {
    await tx.user.update({ where: { id: user.id }, data: { role: 'trainer' } });
    return { ...user, role: 'trainer', promoted: true };
  }

  return { ...user, promoted: false };
}

/**
 * Organisation-wide overview: every course, trainer and candidate in one
 * payload, so the dashboard renders from a single request.
 *
 * Scores follow the same rule as everywhere else — the LATEST scored attempt
 * per quiz counts, not the best — and are marks-weighted so a 10-mark quiz
 * carries more than a 2-mark one.
 */
router.get(
  '/overview',
  handle(async (req, res) => {
    const [courses, users, attempts] = await Promise.all([
      prisma.course.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          owner: { select: { id: true, fullName: true } },
          _count: { select: { topics: true } },
          enrollments: { select: { userId: true, status: true } },
          feedback: { select: { rating: true } },
          team: {
            orderBy: { addedAt: 'asc' },
            select: { user: { select: { id: true, fullName: true, isActive: true } } },
          },
          // Unclaimed topics tell the admin whether the lead has divided the
          // work up yet.
          topics: { select: { assignedTrainerId: true } },
        },
      }),
      prisma.user.findMany({
        orderBy: { fullName: 'asc' },
        include: {
          _count: {
            select: {
              coursesOwned: true,
              courseTeams: true,
              topicDuties: true,
              enrollments: true,
              topicAccess: true,
              attempts: true,
            },
          },
        },
      }),
      prisma.attempt.findMany({
        where: { status: 'scored' },
        orderBy: [{ quizId: 'asc' }, { attemptNumber: 'asc' }],
        select: {
          candidateId: true,
          quizId: true,
          totalScore: true,
          maxScore: true,
          submittedAt: true,
        },
      }),
    ]);

    // Latest attempt per candidate per quiz — later rows overwrite earlier ones
    // because the query is ordered by attemptNumber ascending.
    const latest = new Map();
    for (const attempt of attempts) {
      latest.set(`${attempt.candidateId}:${attempt.quizId}`, attempt);
    }

    const perCandidate = new Map();
    for (const attempt of latest.values()) {
      const entry = perCandidate.get(attempt.candidateId) ?? {
        earned: 0,
        possible: 0,
        quizzes: 0,
        lastActive: null,
      };
      entry.earned += attempt.totalScore;
      entry.possible += attempt.maxScore;
      entry.quizzes += 1;
      if (!entry.lastActive || attempt.submittedAt > entry.lastActive) {
        entry.lastActive = attempt.submittedAt;
      }
      perCandidate.set(attempt.candidateId, entry);
    }

    const courseRows = courses.map((course) => {
      const active = course.enrollments.filter((e) => e.status === 'active').length;
      const pending = course.enrollments.filter((e) => e.status === 'pending').length;
      const ratings = course.feedback.map((f) => f.rating);

      return {
        id: course.id,
        code: course.code,
        title: course.title,
        isPublished: course.isPublished,
        createdAt: course.createdAt,
        // `trainer` is the lead — the course's owner. `team` is everyone else
        // working on it.
        trainer: course.owner,
        team: course.team.map((row) => row.user),
        topics: course._count.topics,
        unassignedTopics: course.topics.filter((t) => !t.assignedTrainerId).length,
        candidates: active,
        pendingRequests: pending,
        feedbackCount: ratings.length,
        feedbackAverage:
          ratings.length === 0 ? null : round(ratings.reduce((a, b) => a + b, 0) / ratings.length),
      };
    });

    // How many distinct candidates each trainer reaches, across their courses.
    const reachByTrainer = new Map();
    for (const course of courses) {
      const set = reachByTrainer.get(course.ownerId) ?? new Set();
      for (const e of course.enrollments) {
        if (e.status === 'active') set.add(e.userId);
      }
      reachByTrainer.set(course.ownerId, set);
    }

    // Which courses each trainer runs — the names, not just the count, so the
    // admin can see what is allotted to whom without opening every course.
    // Rows with no trainer yet are skipped; they show up as unallotted instead.
    const coursesByTrainer = new Map();
    for (const row of courseRows) {
      if (!row.trainer) continue;

      const list = coursesByTrainer.get(row.trainer.id) ?? [];
      list.push({
        id: row.id,
        code: row.code,
        title: row.title,
        isPublished: row.isPublished,
        candidates: row.candidates,
      });
      coursesByTrainer.set(row.trainer.id, list);
    }

    // The other half of a trainer's workload: courses they assist on rather than
    // lead, and how many topics on those are their duty.
    const teamsByTrainer = new Map();
    for (const course of courses) {
      for (const row of course.team) {
        const list = teamsByTrainer.get(row.user.id) ?? [];
        list.push({ id: course.id, code: course.code, title: course.title });
        teamsByTrainer.set(row.user.id, list);
      }
    }

    const trainers = users
      .filter((u) => u.role === 'trainer')
      .map((u) => ({
        id: u.id,
        fullName: u.fullName,
        email: u.email,
        isActive: u.isActive,
        createdAt: u.createdAt,
        courses: u._count.coursesOwned,
        allotted: coursesByTrainer.get(u.id) ?? [],
        assisting: teamsByTrainer.get(u.id) ?? [],
        topicDuties: u._count.topicDuties,
        candidatesReached: reachByTrainer.get(u.id)?.size ?? 0,
      }));

    const candidates = users
      .filter((u) => u.role === 'candidate')
      .map((u) => {
        const s = perCandidate.get(u.id);
        return {
          id: u.id,
          fullName: u.fullName,
          email: u.email,
          isActive: u.isActive,
          createdAt: u.createdAt,
          courses: u._count.enrollments,
          topicsAllotted: u._count.topicAccess,
          attempts: u._count.attempts,
          quizzesDone: s?.quizzes ?? 0,
          averageScore: s && s.possible > 0 ? round((s.earned / s.possible) * 100) : null,
          lastActive: s?.lastActive ?? null,
        };
      });

    const admins = users
      .filter((u) => u.role === 'admin')
      .map((u) => ({
        id: u.id,
        fullName: u.fullName,
        email: u.email,
        isActive: u.isActive,
        createdAt: u.createdAt,
      }));

    const scored = candidates.filter((c) => c.averageScore !== null);

    res.json({
      stats: {
        courses: courseRows.length,
        publishedCourses: courseRows.filter((c) => c.isPublished).length,
        trainers: trainers.length,
        candidates: candidates.length,
        admins: admins.length,
        topics: courseRows.reduce((sum, c) => sum + c.topics, 0),
        attempts: attempts.length,
        unallottedCourses: courseRows.filter((c) => !c.trainer).length,
        pendingRequests: courseRows.reduce((sum, c) => sum + c.pendingRequests, 0),
        averageScore:
          scored.length === 0
            ? null
            : round(scored.reduce((sum, c) => sum + c.averageScore, 0) / scored.length),
      },
      courses: courseRows,
      trainers,
      candidates,
      admins,
    });
  }),
);

/**
 * Marks a candidate as a trainer, or puts a trainer back to a candidate.
 *
 * Administrators are out of reach from here in both directions — see
 * setUserRoleSchema. Nothing else moves: a promoted candidate keeps their
 * enrollments and attempt history, so demoting them again restores the view
 * they had.
 */
router.patch(
  '/users/:userId/role',
  handle(async (req, res) => {
    const { role } = setUserRoleSchema.parse(req.body);
    const { userId } = req.params;

    if (userId === req.user.id) {
      throw new AppError(400, 'You cannot change your own role');
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        role: true,
        _count: { select: { coursesOwned: true, courseTeams: true } },
      },
    });

    if (!user) throw new AppError(404, 'User not found');
    if (user.role === 'admin') {
      throw new AppError(403, 'Administrator accounts cannot be changed from here');
    }

    if (role === 'candidate') {
      // Course.ownerId is Restrict-deleted for a reason: a course with no lead
      // has nobody to run it. Allot the courses elsewhere first, then demote.
      if (user._count.coursesOwned > 0) {
        throw new AppError(
          409,
          `${user.fullName} still leads ${plural(user._count.coursesOwned, 'course')}. Allot them to another trainer first.`,
        );
      }
      if (user._count.courseTeams > 0) {
        throw new AppError(
          409,
          `${user.fullName} is on the team of ${plural(user._count.courseTeams, 'course')}. Take them off first.`,
        );
      }
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { role },
      select: { id: true, fullName: true, email: true, role: true },
    });

    res.json({ user: updated });
  }),
);

/**
 * Creates a course. This is the only way courses come into being — trainers add
 * topics, material and quizzes to courses they have been allotted, but the
 * course itself, and its code, is an admin's decision.
 *
 * A trainer is optional: leaving it out creates the course unallotted, waiting
 * on the allotment screen. Naming someone marks them a trainer on the way, so
 * both halves land in one transaction.
 */
router.post(
  '/courses',
  handle(async (req, res) => {
    const { trainerId, ...input } = createCourseSchemaAdmin.parse(req.body);

    const { course, promoted } = await prisma.$transaction(async (tx) => {
      const trainer = trainerId ? await takeOnAsTrainer(tx, trainerId) : null;
      const created = await createCourseForTrainer(trainer?.id ?? null, input, tx);
      return { course: created, promoted: trainer?.promoted ?? false };
    });

    const { owner, ...created } = course;
    res.status(201).json({ course: { ...created, trainer: owner }, promoted });
  }),
);

/**
 * Allots a course to someone — the admin equivalent of handing over a class.
 *
 * Ownership is what every other permission check reads (see
 * courses.service.assertCourseAccess), so this alone moves the course, its
 * topics, material and quizzes into the new trainer's hands. Naming a candidate
 * marks them a trainer on the way through; `promoted` says whether it happened,
 * so the screen can report both halves.
 */
router.post(
  '/allotments',
  handle(async (req, res) => {
    const { courseId, userId } = createAllotmentSchema.parse(req.body);

    const { course, trainer } = await prisma.$transaction(async (tx) => {
      const existing = await tx.course.findUnique({
        where: { id: courseId },
        select: { id: true },
      });
      if (!existing) throw new AppError(404, 'Course not found');

      const trainer = await takeOnAsTrainer(tx, userId);

      const updated = await tx.course.update({
        where: { id: existing.id },
        data: { ownerId: trainer.id },
        select: {
          id: true,
          code: true,
          title: true,
          owner: { select: { id: true, fullName: true } },
        },
      });

      return { course: updated, trainer };
    });

    const { owner, ...updated } = course;
    // `trainer` matches the shape /admin/overview returns for a course row.
    res.json({ course: { ...updated, trainer: owner }, promoted: trainer.promoted });
  }),
);

/**
 * Puts a trainer on a course's team — the three-or-so people who build it under
 * the lead. The lead then decides which topics each of them takes.
 *
 * The lead is not a team member: they are the course's owner, and adding them
 * here would give them a second, meaningless seat.
 */
router.post(
  '/courses/:courseId/team',
  handle(async (req, res) => {
    const { userId } = addTeamMemberSchema.parse(req.body);
    const { courseId } = req.params;

    const member = await prisma.$transaction(async (tx) => {
      const course = await tx.course.findUnique({
        where: { id: courseId },
        select: { id: true, ownerId: true },
      });
      if (!course) throw new AppError(404, 'Course not found');

      const trainer = await takeOnAsTrainer(tx, userId);

      if (course.ownerId === trainer.id) {
        throw new AppError(409, `${trainer.fullName} leads this course already`);
      }

      const existing = await tx.courseTrainer.findUnique({
        where: { courseId_userId: { courseId, userId: trainer.id } },
      });
      if (existing) {
        throw new AppError(409, `${trainer.fullName} is already on this team`);
      }

      await tx.courseTrainer.create({ data: { courseId, userId: trainer.id } });
      return trainer;
    });

    res.status(201).json({
      member: { id: member.id, fullName: member.fullName },
      promoted: member.promoted,
    });
  }),
);

/**
 * Takes a trainer off a course's team. Any topics that were their duty fall back
 * to nobody, so the lead can hand them out again rather than losing track.
 */
router.delete(
  '/courses/:courseId/team/:userId',
  handle(async (req, res) => {
    const { courseId, userId } = req.params;

    await prisma.$transaction(async (tx) => {
      const { count } = await tx.courseTrainer.deleteMany({ where: { courseId, userId } });
      if (count === 0) throw new AppError(404, 'That trainer is not on this team');

      await tx.topic.updateMany({
        where: { courseId, assignedTrainerId: userId },
        data: { assignedTrainerId: null },
      });
    });

    res.status(204).end();
  }),
);

export default router;
