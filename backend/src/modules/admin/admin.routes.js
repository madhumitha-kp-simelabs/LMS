import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { AppError } from '../../middleware/error.js';
// Imported by name, not as a namespace: the overview handler below has its own
// local `courses`, and shadowing the module would be a trap waiting to happen.
import { assertNotEnrolled, createCourseForLead } from '../courses/courses.service.js';
import * as projects from '../projects/projects.service.js';
import { allotProjectSchema } from '../projects/projects.schema.js';
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
 * Resolves the person a job is being handed to, giving a candidate the role
 * that job requires — `lead` for running a course, `trainer` for joining a team.
 *
 * The promotion is deliberately part of the same act: an admin picking a name
 * off the list means "this person does this work", and doing it in two steps
 * would leave a course owned by someone who cannot open it. Takes a transaction
 * so the promotion and the allotment land together.
 *
 * Someone who already holds the *other* role is refused rather than switched.
 * Moving between lead and trainer changes what a person may do everywhere, so
 * it is a deliberate act on the Administration page, not a side effect of
 * filling a slot.
 */
async function takeOn(tx, userId, wanted) {
  const other = wanted === 'lead' ? 'trainer' : 'lead';

  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { id: true, fullName: true, role: true, isActive: true },
  });

  if (!user) throw new AppError(404, 'That person no longer exists');
  if (user.role === 'admin') {
    throw new AppError(400, `${user.fullName} is an administrator — courses are staffed by leads and trainers`);
  }
  if (!user.isActive) {
    throw new AppError(400, `${user.fullName}’s account is deactivated`);
  }

  // Leads and trainers are different jobs, not ranks: a lead is never put on
  // someone else's team, and a trainer never takes a course of their own. The
  // way across is to change their role deliberately, on the Administration page.
  if (user.role === other) {
    throw new AppError(
      409,
      wanted === 'lead'
        ? `${user.fullName} is a trainer. Only leads can run a course — change their role first if that is what you want.`
        : `${user.fullName} is a lead. Leads run their own courses rather than joining someone else's team.`,
    );
  }

  if (user.role === 'candidate') {
    await tx.user.update({ where: { id: user.id }, data: { role: wanted } });
    return { ...user, role: wanted, promoted: true };
  }

  return { ...user, promoted: false };
}

/** Allotting a course, or creating one: the owner is always a lead. */
const takeOnAsLead = (tx, userId) => takeOn(tx, userId, 'lead');

/** Joining a course team: team members are always trainers. */
const takeOnAsTrainer = (tx, userId) => takeOn(tx, userId, 'trainer');

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
          category: { select: { id: true, name: true, slug: true, position: true } },
          _count: { select: { topics: true } },
          enrollments: { select: { userId: true, status: true } },
          feedback: { select: { rating: true } },
          team: {
            orderBy: { addedAt: 'asc' },
            select: { user: { select: { id: true, fullName: true, isActive: true } } },
          },
          // Unclaimed halves tell the admin whether the lead has divided the
          // work up yet — a topic counts as outstanding if either its material
          // or its quiz has nobody on it.
          topics: { select: { materialTrainerId: true, quizTrainerId: true } },
        },
      }),
      prisma.user.findMany({
        orderBy: { fullName: 'asc' },
        include: {
          // What a candidate is being trained as, for the grouping on the
          // Candidates tab. Null until an administrator files them.
          team: { select: { id: true, name: true, slug: true, position: true } },
          _count: {
            select: {
              coursesOwned: true,
              courseTeams: true,
              materialDuties: true,
              quizDuties: true,
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
        version: course.version,
        title: course.title,
        category: course.category,
        isPublished: course.isPublished,
        createdAt: course.createdAt,
        // `trainer` is the lead — the course's owner. `team` is everyone else
        // working on it.
        trainer: course.owner,
        team: course.team.map((row) => row.user),
        topics: course._count.topics,
        unassignedTopics: course.topics.filter((t) => !t.materialTrainerId || !t.quizTrainerId)
          .length,
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

    // Leads and trainers are separate account types now, so they are separate
    // lists. The shape is shared: both answer "which courses is this person on".
    const staff = (role) =>
      users
        .filter((u) => u.role === role)
        .map((u) => ({
          id: u.id,
          fullName: u.fullName,
          email: u.email,
          role: u.role,
          isActive: u.isActive,
          createdAt: u.createdAt,
          courses: u._count.coursesOwned,
          allotted: coursesByTrainer.get(u.id) ?? [],
          assisting: teamsByTrainer.get(u.id) ?? [],
          topicDuties: u._count.materialDuties + u._count.quizDuties,
          candidatesReached: reachByTrainer.get(u.id)?.size ?? 0,
        }));

    const leads = staff('lead');
    const trainers = staff('trainer');

    // Which courses each candidate is on, and who leads them. Names rather than
    // a tally: the list is meant to answer "who is doing what", and the numbers
    // live on the candidate's own page.
    const coursesByCandidate = new Map();
    for (const course of courses) {
      for (const enrollment of course.enrollments) {
        const list = coursesByCandidate.get(enrollment.userId) ?? [];
        list.push({
          id: course.id,
          code: course.code,
          title: course.title,
          status: enrollment.status,
          trainer: course.owner,
        });
        coursesByCandidate.set(enrollment.userId, list);
      }
    }

    const candidates = users
      .filter((u) => u.role === 'candidate')
      .map((u) => {
        const s = perCandidate.get(u.id);
        return {
          id: u.id,
          fullName: u.fullName,
          email: u.email,
          team: u.team,
          enrolled: coursesByCandidate.get(u.id) ?? [],
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
        leads: leads.length,
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
      leads,
      trainers,
      candidates,
      admins,
    });
  }),
);

/**
 * Everything about one candidate, for their own page: the courses they are on,
 * how far through each they are, and every quiz attempt they have made.
 *
 * The overview deliberately carries none of this — it would multiply the
 * payload by the number of people on the books to show figures that only
 * matter once you are looking at somebody in particular.
 */
router.get(
  '/candidates/:userId',
  handle(async (req, res) => {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, fullName: true, email: true, role: true, isActive: true, createdAt: true },
    });
    if (!user) throw new AppError(404, 'That person no longer exists');

    const [enrollments, topicAccess, attempts] = await Promise.all([
      prisma.enrollment.findMany({
        where: { userId },
        orderBy: { enrolledAt: 'desc' },
        include: {
          course: {
            select: {
              id: true,
              code: true,
              version: true,
              title: true,
              isPublished: true,
              durationWeeks: true,
              owner: { select: { id: true, fullName: true } },
              _count: { select: { topics: true } },
            },
          },
        },
      }),
      prisma.topicAssignment.findMany({
        where: { userId },
        include: { topic: { select: { id: true, title: true, position: true, courseId: true } } },
      }),
      prisma.attempt.findMany({
        where: { candidateId: userId, status: 'scored' },
        orderBy: [{ quizId: 'asc' }, { attemptNumber: 'asc' }],
        include: {
          quiz: {
            select: {
              id: true,
              title: true,
              topic: { select: { id: true, title: true, courseId: true } },
            },
          },
        },
      }),
    ]);

    // The latest scored attempt per quiz is the one that counts — the same rule
    // the dashboard uses, so the two never disagree.
    const latest = new Map();
    for (const attempt of attempts) latest.set(attempt.quizId, attempt);
    const counted = [...latest.values()];

    const scoreOver = (rows) => {
      const possible = rows.reduce((sum, a) => sum + a.maxScore, 0);
      if (possible === 0) return null;
      return round((rows.reduce((sum, a) => sum + a.totalScore, 0) / possible) * 100);
    };

    const courses = enrollments.map(({ course, ...enrollment }) => {
      const mine = counted.filter((a) => a.quiz.topic.courseId === course.id);
      const allotted = topicAccess.filter((t) => t.topic.courseId === course.id);

      return {
        id: course.id,
        code: course.code,
        title: course.title,
        isPublished: course.isPublished,
        durationWeeks: course.durationWeeks,
        trainer: course.owner,
        status: enrollment.status,
        version: course.version,
        enrolledAt: enrollment.enrolledAt,
        startedAt: enrollment.startedAt,
        // When they are due to finish, and the three ways that can already have
        // happened. An administrator looking at somebody's record needs the
        // deadline as much as the start — "started 27 Aug" says nothing about
        // whether they are late.
        dueAt: enrollment.dueAt,
        completedAt: enrollment.completedAt,
        pausedAt: enrollment.pausedAt,
        pausedDays: enrollment.pausedDays,
        supersededAt: enrollment.supersededAt,
        discontinuedAt: enrollment.discontinuedAt,
        topics: course._count.topics,
        topicsAllotted: allotted.length,
        quizzesDone: mine.length,
        averageScore: scoreOver(mine),
      };
    });

    const byCourse = new Map(enrollments.map((e) => [e.courseId, e.course]));

    res.json({
      candidate: {
        ...user,
        // Every attempt, newest first — retakes included, since the point of
        // this page is the history the overview flattens away.
        attempts: attempts
          .map((a) => ({
            id: a.id,
            attemptNumber: a.attemptNumber,
            quizTitle: a.quiz.title,
            topicTitle: a.quiz.topic.title,
            courseCode: byCourse.get(a.quiz.topic.courseId)?.code ?? null,
            totalScore: a.totalScore,
            maxScore: a.maxScore,
            percentage: a.maxScore === 0 ? null : round((a.totalScore / a.maxScore) * 100),
            submittedAt: a.submittedAt,
            counts: latest.get(a.quizId)?.id === a.id,
          }))
          .reverse(),
        courses,
        summary: {
          courses: courses.length,
          topicsAllotted: topicAccess.length,
          quizzesDone: counted.length,
          attempts: attempts.length,
          averageScore: scoreOver(counted),
          lastActive: attempts.reduce(
            (latestAt, a) => (!latestAt || a.submittedAt > latestAt ? a.submittedAt : latestAt),
            null,
          ),
        },
      },
    });
  }),
);

/**
 * Every project across every course, with who holds each one — the list the
 * allotment screen works from.
 */
router.get(
  '/projects',
  handle(async (req, res) => {
    const rows = await prisma.project.findMany({
      orderBy: [{ course: { code: 'asc' } }, { position: 'asc' }],
      include: {
        course: { select: { id: true, code: true, title: true, isPublished: true } },
        allotments: {
          orderBy: { allottedAt: 'asc' },
          include: { user: { select: { id: true, fullName: true, email: true } } },
        },
      },
    });

    res.json({
      projects: rows.map(({ allotments, ...project }) => ({
        ...project,
        candidates: allotments.map((a) => ({
          id: a.user.id,
          fullName: a.user.fullName,
          email: a.user.email,
          allottedAt: a.allottedAt,
          completedAt: a.completedAt,
        })),
        allotted: allotments.length,
        completed: allotments.filter((a) => a.completedAt).length,
      })),
    });
  }),
);

/**
 * Hands a project to candidates. The lead writes the brief; who does it is the
 * admin's decision, which is why this lives here and not on /api/projects.
 */
router.post(
  '/projects/:projectId/allotments',
  handle(async (req, res) => {
    const { candidateIds } = allotProjectSchema.parse(req.body);
    const result = await projects.allot(req.user, req.params.projectId, candidateIds);
    res.status(201).json(result);
  }),
);

/** Takes it back off one candidate, losing their done mark with it. */
router.delete(
  '/projects/:projectId/allotments/:userId',
  handle(async (req, res) => {
    await projects.withdraw(req.params.projectId, req.params.userId);
    res.status(204).end();
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

    // Leaving a role means leaving the work that came with it, or the course is
    // left without someone who can publish it and the team without its writer.
    // Course.ownerId is Restrict-deleted for exactly this reason.
    if (role !== 'lead' && user._count.coursesOwned > 0) {
      throw new AppError(
        409,
        `${user.fullName} still leads ${plural(user._count.coursesOwned, 'course')}. Allot ${user._count.coursesOwned === 1 ? 'it' : 'them'} to another lead first.`,
      );
    }

    if (role !== 'trainer' && user._count.courseTeams > 0) {
      throw new AppError(
        409,
        `${user.fullName} is on the team of ${plural(user._count.courseTeams, 'course')}. Take them off first.`,
      );
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
      const trainer = trainerId ? await takeOnAsLead(tx, trainerId) : null;
      const created = await createCourseForLead(trainer?.id ?? null, input, tx);
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

      await assertNotEnrolled(existing.id, userId, { as: 'lead' });
      const trainer = await takeOnAsLead(tx, userId);

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

      await assertNotEnrolled(courseId, userId, { as: 'trainer' });
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
        where: { courseId, materialTrainerId: userId },
        data: { materialTrainerId: null },
      });
      await tx.topic.updateMany({
        where: { courseId, quizTrainerId: userId },
        data: { quizTrainerId: null },
      });
    });

    res.status(204).end();
  }),
);

export default router;
