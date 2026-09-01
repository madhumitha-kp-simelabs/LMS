import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { AppError } from '../../middleware/error.js';
import { scoreAttempt } from './scoring.js';
import { assertNotCourseStaff } from '../courses/courses.service.js';
import * as projects from '../projects/projects.service.js';
import { setDoneSchema, submissionSchema } from '../projects/projects.schema.js';
import { uploadSubmission } from '../../lib/storage.js';
import { buildAttemptReview } from '../quizzes/attempt-review.js';
import { shuffleQuizFor } from '../../lib/shuffle.js';
import { pauseEnrolment, resumeEnrolment } from '../courses/schedule.service.js';

const router = Router();
const handle = (fn) => (req, res, next) => fn(req, res, next).catch(next);

/**
 * The learner side, and who gets to be one.
 *
 * A lead runs courses, but running one does not stop them being taught another
 * — a React lead sitting a project-management course is the ordinary case, not
 * an edge one. So leads reach these routes too.
 *
 * Nothing else has to change to make that safe: every query below is anchored
 * on `req.user.id` through TopicAssignment or Enrollment, so a lead sees
 * exactly what has been allotted to them and nothing their staff role would
 * otherwise open. The rule that keeps the two apart is per course, not per
 * account, and lives in assertNotCourseStaff — you cannot learn a course you
 * run, but every other course is fair game.
 *
 * Trainers are deliberately left out for now: nobody has asked for it, and
 * adding a role here is one word when they do.
 */
router.use(requireAuth, requireRole('candidate', 'lead'));

/**
 * Stamps the day a candidate first opened anything in a course.
 *
 * Only ever set once — updateMany with a startedAt:null filter means a second
 * visit cannot overwrite the original date, and no read-then-write race can
 * either.
 */
async function markStarted(userId, courseId) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { durationWeeks: true },
  });

  const startedAt = new Date();

  await prisma.enrollment.updateMany({
    where: { userId, courseId, startedAt: null },
    data: {
      startedAt,
      // The deadline is set once, here, from the course's standard duration —
      // and then belongs to this candidate. Extensions and pauses move theirs
      // and nobody else's, which is why it is stored rather than recomputed.
      // A course with no duration gets no deadline, which is different from
      // getting one in the past.
      dueAt: course?.durationWeeks
        ? new Date(startedAt.getTime() + course.durationWeeks * 7 * 86400000)
        : null,
    },
  });
}

/** Whole days between two instants, rounded down — a pause of hours costs nothing. */
const daysBetween = (from, to) => Math.floor((to.getTime() - from.getTime()) / 86400000);

/**
 * Marks a course complete once every published quiz on the candidate's
 * allotted topics has at least one scored attempt.
 *
 * Recomputed after each submission rather than counted incrementally, so it
 * stays correct when a trainer allots a new topic or publishes another quiz —
 * which un-completes the course until that quiz is attempted too.
 */
async function refreshCompletion(userId, courseId) {
  const allotted = await prisma.topicAssignment.findMany({
    where: { userId, topic: { courseId } },
    select: { topic: { select: { quiz: { select: { id: true, isPublished: true } } } } },
  });

  const quizIds = allotted
    .map((a) => a.topic.quiz)
    .filter((q) => q?.isPublished)
    .map((q) => q.id);

  if (quizIds.length === 0) return;

  const attempted = await prisma.attempt.findMany({
    where: { candidateId: userId, quizId: { in: quizIds }, status: 'scored' },
    select: { quizId: true },
    distinct: ['quizId'],
  });

  const done = attempted.length === quizIds.length;

  if (done) {
    // Only stamp a course that isn't already complete — retaking a quiz later
    // must not move the original completion date forward.
    await prisma.enrollment.updateMany({
      where: { userId, courseId, completedAt: null },
      data: { completedAt: new Date() },
    });
  } else {
    // Allotting a new topic or publishing another quiz reopens the course.
    await prisma.enrollment.updateMany({
      where: { userId, courseId, completedAt: { not: null } },
      data: { completedAt: null },
    });
  }
}

/** Throws unless this topic has been allotted to the signed-in candidate. */
async function assertAllotted(userId, topicId) {
  const allotted = await prisma.topicAssignment.findUnique({
    where: { userId_topicId: { userId, topicId } },
  });
  // Same response whether the topic is missing or simply not theirs, so this
  // can't be used to discover which topics exist.
  if (!allotted) throw new AppError(404, 'Topic not found');
}

/**
 * The candidate's own view of their courses.
 *
 * Every query here is anchored on TopicAssignment rather than Course, so a
 * candidate can only ever see topics explicitly allotted to them — unallotted
 * topics in the same course are invisible, not merely locked.
 */

/**
 * The practical work set for this candidate. Outstanding first, since that is
 * what the page is for; finished ones stay listed as a record.
 */
router.get(
  '/projects',
  handle(async (req, res) => {
    res.json({ projects: await projects.listForCandidate(req.user.id) });
  }),
);

/**
 * Marking a project finished, or undoing it. Only the candidate holding it can
 * say so — finishing is a claim about your own work, not somebody else's
 * judgement of it.
 */
router.patch(
  '/projects/:projectId',
  handle(async (req, res) => {
    const { done } = setDoneSchema.parse(req.body);
    const allotment = await projects.setDone(req.user.id, req.params.projectId, done);
    res.json({ project: allotment.project, completedAt: allotment.completedAt });
  }),
);

/** Recording a link and a note for work handed in. */
router.patch(
  '/projects/:projectId/submission',
  handle(async (req, res) => {
    const input = submissionSchema.parse(req.body);
    await projects.saveSubmission(req.user.id, req.params.projectId, input);
    res.json({ saved: true });
  }),
);

/** Attaching a file to it. Replacing one removes the file it stood in for. */
router.post(
  '/projects/:projectId/file',
  (req, res, next) =>
    uploadSubmission(req, res, (err) => {
      if (err?.code === 'LIMIT_FILE_SIZE') {
        return next(new AppError(413, 'File is larger than the 50 MB limit'));
      }
      next(err);
    }),
  handle(async (req, res) => {
    if (!req.file) throw new AppError(400, 'No file was uploaded');
    await projects.attachFile(req.user.id, req.params.projectId, req.file);
    res.status(201).json({ attached: req.file.originalname });
  }),
);

router.delete(
  '/projects/:projectId/file',
  handle(async (req, res) => {
    await projects.removeFile(req.user.id, req.params.projectId);
    res.status(204).end();
  }),
);

router.get(
  '/my-courses',
  handle(async (req, res) => {
    const assignments = await prisma.topicAssignment.findMany({
      where: { userId: req.user.id },
      include: {
        topic: {
          include: {
            course: {
              select: {
                id: true,
                code: true,
                version: true,
                title: true,
                description: true,
                category: { select: { id: true, name: true, slug: true, position: true } },
              },
            },
            _count: { select: { materials: true } },
            quiz: { select: { id: true, isPublished: true } },
          },
        },
      },
    });

    // Latest scored attempt per quiz, for the sidebar badges.
    const attempts = await prisma.attempt.findMany({
      where: { candidateId: req.user.id, status: 'scored' },
      orderBy: { attemptNumber: 'desc' },
      select: { quizId: true, percentage: true, attemptNumber: true },
    });
    const latestByQuiz = new Map();
    for (const a of attempts) {
      if (!latestByQuiz.has(a.quizId)) latestByQuiz.set(a.quizId, a);
    }

    const byCourse = new Map();
    for (const { topic } of assignments) {
      if (!byCourse.has(topic.course.id)) {
        byCourse.set(topic.course.id, { ...topic.course, topics: [] });
      }

      const latest = topic.quiz ? latestByQuiz.get(topic.quiz.id) : null;

      byCourse.get(topic.course.id).topics.push({
        id: topic.id,
        title: topic.title,
        description: topic.description,
        position: topic.position,
        materialCount: topic._count.materials,
        hasQuiz: Boolean(topic.quiz?.isPublished),
        latestScore: latest ? Number(latest.percentage) : null,
      });
    }

    // Whether they have opened this course before, so the sidebar can say
    // "Start" the first time and "Continue" after. Derived from the enrolment
    // rather than from the topics, because opening material without taking a
    // quiz is still having started.
    const enrolments = await prisma.enrollment.findMany({
      where: { userId: req.user.id, courseId: { in: [...byCourse.keys()] } },
      select: {
        courseId: true,
        startedAt: true,
        completedAt: true,
        dueAt: true,
        pausedAt: true,
        pausedDays: true,
        supersededAt: true,
        discontinuedAt: true,
      },
    });
    const progressByCourse = new Map(enrolments.map((e) => [e.courseId, e]));

    const courses = [...byCourse.values()]
      /**
       * Editions they have moved off are not courses they are studying.
       *
       * This list is built from topic assignments, and moving to a later
       * version deliberately leaves the old ones in place so the results
       * earned against them survive. That makes the enrolment, not the
       * assignment, the thing that says whether a course is still theirs.
       */
      .filter((course) => {
        const enrolment = progressByCourse.get(course.id);
        // Moved off, or stopped. Both leave the enrolment in place so the marks
        // earned against it survive; neither is still something being studied.
        return !enrolment?.supersededAt && !enrolment?.discontinuedAt;
      })
      .map((course) => {
      const topics = course.topics.sort((a, b) => a.position - b.position);
      const enrolment = progressByCourse.get(course.id);

      return {
        ...course,
        topics,
        startedAt: enrolment?.startedAt ?? null,
        completedAt: enrolment?.completedAt ?? null,
        dueAt: enrolment?.dueAt ?? null,
        pausedAt: enrolment?.pausedAt ?? null,
        pausedDays: enrolment?.pausedDays ?? 0,
        // Overdue only while it is still outstanding. A course finished late is
        // finished, and nagging about it afterwards helps nobody — the same
        // rule the projects list already uses.
        overdue:
          !enrolment?.completedAt &&
          !enrolment?.pausedAt &&
          enrolment?.dueAt != null &&
          enrolment.dueAt < new Date(),
        // Only topics carrying a published quiz can be finished, so they are
        // the only ones the fraction counts. A topic that is material alone has
        // nothing to attempt and would otherwise sit permanently unfinished,
        // holding the course at 4/5 for ever.
        gradedTopics: topics.filter((t) => t.hasQuiz).length,
        doneTopics: topics.filter((t) => t.hasQuiz && t.latestScore !== null).length,
      };
    });

    res.json({ courses });
  }),
);

/**
 * Every published course, for browsing.
 *
 * Summary only — title, description and how big the course is. Topics,
 * material and questions are deliberately excluded: browsing is not a way to
 * read content you have not been allotted.
 */
router.get(
  '/catalogue',
  handle(async (req, res) => {
    const [courses, enrollments] = await Promise.all([
      prisma.course.findMany({
        // Everything published, the reader's own courses included. This once
        // filtered those out on the grounds that enrolling on them is refused
        // anyway — but that mistook the page for an enrolment form. It is the
        // organisation's catalogue, and a lead asking "what do we teach?"
        // should not get an answer with their own course missing from it.
        //
        // What changes for those rows is the button, not the listing: `staff`
        // below tells the screen to show where they stand instead.
        where: { isPublished: true },
        orderBy: { title: 'asc' },
        select: {
          id: true,
          code: true,
          version: true,
          title: true,
          description: true,
          durationWeeks: true,
          ownerId: true,
          owner: { select: { fullName: true } },
          category: { select: { id: true, name: true, slug: true, position: true } },
          team: { where: { userId: req.user.id }, select: { userId: true } },
          _count: { select: { topics: true } },
        },
      }),
      prisma.enrollment.findMany({
        where: { userId: req.user.id },
        select: {
          courseId: true,
          status: true,
          supersededAt: true,
          discontinuedAt: true,
        },
      }),
    ]);

    /**
     * Where the reader stands on each course.
     *
     * `status` alone is not enough: it stays 'active' on an enrolment somebody
     * has moved off or stopped, so the catalogue was telling them they were
     * enrolled on a course they had left, and offering to open topics that no
     * longer appear under My learning.
     *
     * 'moved' and 'stopped' are their own answers rather than being folded into
     * 'none'. They are not people who have never been on the course, and a card
     * that said "Ask to join" would invite them to undo a decision somebody
     * already made deliberately.
     */
    const standingOf = (enrolment) => {
      if (enrolment.supersededAt) return 'moved';
      if (enrolment.discontinuedAt) return 'stopped';
      return enrolment.status;
    };

    const statusByCourse = new Map(enrollments.map((e) => [e.courseId, standingOf(e)]));

    /**
     * The newest published edition of each subject.
     *
     * Somebody who is not on any version of a course has no reason to join an
     * old one — the current material is the point. So the catalogue says which
     * edition is current, and the card offers to join that one only.
     *
     * Presentation and a guard, not a retirement: the older edition stays
     * published and stays listed, because the people part-way through it are
     * still on it and it is still where their work lives. What changes is only
     * what a newcomer is offered.
     */
    const newest = new Map();
    for (const course of courses) {
      const seen = newest.get(course.code) ?? 0;
      if (course.version > seen) newest.set(course.code, course.version);
    }

    // How many topics the candidate can actually open, so an approved course
    // that has not been allotted yet is honest about showing nothing.
    const allotted = await prisma.topicAssignment.groupBy({
      by: ['topicId'],
      where: { userId: req.user.id },
    });
    const allottedTopicIds = new Set(allotted.map((a) => a.topicId));
    const topicsPerCourse = await prisma.topic.findMany({
      where: { id: { in: [...allottedTopicIds] } },
      select: { id: true, courseId: true },
    });
    const allottedCount = new Map();
    for (const topic of topicsPerCourse) {
      allottedCount.set(topic.courseId, (allottedCount.get(topic.courseId) ?? 0) + 1);
    }

    res.json({
      courses: courses.map((course) => ({
        id: course.id,
        code: course.code,
        version: course.version,
        title: course.title,
        description: course.description,
        durationWeeks: course.durationWeeks,
        // The response is an explicit shape rather than a spread, so anything
        // added to the select above has to be named here too or it is silently
        // dropped — which is exactly what happened to this line the first time.
        category: course.category,
        trainerName: course.owner?.fullName ?? null,
        topicCount: course._count.topics,
        // 'lead' | 'trainer' | null — where the reader stands on this course as
        // staff, which is a different axis from `subscription` below. Nobody is
        // ever both: you cannot be enrolled on a course you run.
        staff:
          course.ownerId === req.user.id ? 'lead' : course.team.length > 0 ? 'trainer' : null,
        // 'none' | 'pending' | 'active' | 'moved' | 'stopped'
        subscription: statusByCourse.get(course.id) ?? 'none',
        // The version that has replaced this one, or null when this is current.
        newerVersion:
          newest.get(course.code) > course.version ? newest.get(course.code) : null,
        allottedTopics: allottedCount.get(course.id) ?? 0,
      })),
    });
  }),
);

/**
 * Pausing a course, and picking it up again.
 *
 * The deadline moves by exactly the days lost, so a candidate pulled onto an
 * urgent project is not punished for it. The arithmetic lives in the schedule
 * service because a lead can do this on their behalf too, and the two must
 * never disagree about how many days a pause is worth.
 */
router.post(
  '/courses/:courseId/pause',
  handle(async (req, res) => {
    res.json(await pauseEnrolment(req.user.id, req.params.courseId));
  }),
);

router.post(
  '/courses/:courseId/resume',
  handle(async (req, res) => {
    res.json({ resumed: true, ...(await resumeEnrolment(req.user.id, req.params.courseId)) });
  }),
);

/**
 * Moving across to a later edition of a course already being taken.
 *
 * Not a join request. The candidate was admitted to this subject when they were
 * put on the earlier version, and asking a lead to re-approve somebody already
 * halfway through their course would make the notice an obstacle rather than an
 * offer. So the move is immediate.
 *
 * What it does: enrols them on the new edition, gives them its published
 * topics, and marks the old enrolment superseded. The old row stays — the
 * quizzes they sat happened on that version, and their marks belong to it.
 * Nothing is carried forward, because a revised topic is not the topic they
 * were scored on and pretending otherwise would overstate what they have done.
 */
router.post(
  '/courses/:courseId/move-here',
  handle(async (req, res) => {
    const target = await prisma.course.findFirst({
      where: { id: req.params.courseId, isPublished: true },
      select: { id: true, code: true, version: true, durationWeeks: true },
    });
    if (!target) throw new AppError(404, 'Course not found');

    // The edition they are leaving: active, unfinished, same subject, older.
    const from = await prisma.enrollment.findFirst({
      where: {
        userId: req.user.id,
        status: 'active',
        supersededAt: null,
        completedAt: null,
        course: { code: target.code, version: { lt: target.version } },
      },
      orderBy: { course: { version: 'desc' } },
      include: { course: { select: { id: true, version: true } } },
    });
    if (!from) {
      throw new AppError(409, 'You are not on an earlier version of that course');
    }

    const topics = await prisma.topic.findMany({
      where: { courseId: target.id, isPublished: true },
      select: { id: true },
    });

    // One transaction: half a move — enrolled on the new edition but still
    // counted on the old, or the reverse — is worse than not moving.
    await prisma.$transaction(async (tx) => {
      await tx.enrollment.update({
        where: { id: from.id },
        data: { supersededAt: new Date() },
      });

      /**
       * The new edition starts today and runs its own full duration.
       *
       * Not the remainder of the old deadline: they are starting the revised
       * material from the beginning, and inheriting a clock that was counting
       * down against different topics would punish them for moving.
       */
      const startedAt = new Date();
      const dueAt = target.durationWeeks
        ? new Date(startedAt.getTime() + target.durationWeeks * 7 * 86400000)
        : null;

      await tx.enrollment.upsert({
        where: { userId_courseId: { userId: req.user.id, courseId: target.id } },
        update: { status: 'active', supersededAt: null, startedAt, dueAt },
        create: { userId: req.user.id, courseId: target.id, status: 'active', startedAt, dueAt },
      });

      if (topics.length > 0) {
        await tx.topicAssignment.createMany({
          data: topics.map((topic) => ({
            userId: req.user.id,
            topicId: topic.id,
            // Their own move, so their own name against it.
            assignedBy: req.user.id,
          })),
          skipDuplicates: true,
        });
      }
    });

    res.json({
      moved: true,
      from: from.course.version,
      to: target.version,
      topics: topics.length,
    });
  }),
);

/** Asks to join a course. Creates a pending request — never instant access. */
router.post(
  '/courses/:courseId/subscribe',
  handle(async (req, res) => {
    const course = await prisma.course.findFirst({
      where: { id: req.params.courseId, isPublished: true },
    });
    if (!course) throw new AppError(404, 'Course not found');

    // Says "you lead this" rather than letting the request sit in an inbox the
    // requester is the one who reads.
    await assertNotCourseStaff(course.id, [req.user.id]);

    /**
     * Joining a superseded edition is refused for somebody new.
     *
     * The UI does not offer it, but the endpoint is reachable, and a request
     * that would put a candidate onto material the lead has already replaced is
     * one nobody wants approved. Candidates already on the old edition are
     * untouched — this only governs joining it in the first place.
     */
    const newer = await prisma.course.findFirst({
      where: { code: course.code, version: { gt: course.version }, isPublished: true },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    if (newer) {
      throw new AppError(
        409,
        `${course.code} version ${newer.version} has replaced this one — ask to join that instead`,
      );
    }

    const existing = await prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: req.user.id, courseId: course.id } },
    });
    if (existing) {
      // The UI no longer offers to join a course somebody has left, but the
      // endpoint is still reachable — and "you are already enrolled" is the
      // wrong sentence for a course they moved off or stopped.
      throw new AppError(
        409,
        existing.supersededAt
          ? 'You moved to a later version of this course'
          : existing.discontinuedAt
            ? 'You stopped this course — ask an administrator to put you back on it'
            : existing.status === 'pending'
              ? 'You have already asked to join this course'
              : 'You are already enrolled in this course',
      );
    }

    const enrollment = await prisma.enrollment.create({
      data: { userId: req.user.id, courseId: course.id, status: 'pending' },
    });

    res.status(201).json({ subscription: enrollment.status });
  }),
);

/** Withdraws a request that has not been approved yet. */
router.delete(
  '/courses/:courseId/subscribe',
  handle(async (req, res) => {
    const existing = await prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: req.user.id, courseId: req.params.courseId } },
    });
    if (!existing) throw new AppError(404, 'You have not asked to join this course');

    // Cancelling an approved enrollment would strip access a trainer granted,
    // so only pending requests can be withdrawn here.
    if (existing.status !== 'pending') {
      throw new AppError(409, 'Your place on this course has been approved — ask your trainer to remove you');
    }

    await prisma.enrollment.delete({ where: { id: existing.id } });
    res.status(204).end();
  }),
);

const star = (what) =>
  z.number().int().min(1, `Give ${what} a rating from 1 to 5`).max(5);

const feedbackSchema = z.object({
  rating: star('the course'),
  // Nullable rather than merely optional, so a candidate revising their
  // feedback can take a rating back off as well as change it.
  contentRating: star('the material').nullable().optional(),
  durationRating: star('the length').nullable().optional(),
  comment: z.string().trim().max(2000).optional(),
});

/** Only an approved member of a course may comment on it. */
async function assertEnrolled(userId, courseId) {
  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
  });
  if (!enrollment || enrollment.status !== 'active') {
    throw new AppError(403, 'You can only give feedback on a course you are enrolled in');
  }
}

router.get(
  '/courses/:courseId/feedback',
  handle(async (req, res) => {
    const feedback = await prisma.courseFeedback.findUnique({
      where: { userId_courseId: { userId: req.user.id, courseId: req.params.courseId } },
      select: {
        rating: true,
        contentRating: true,
        durationRating: true,
        comment: true,
        updatedAt: true,
      },
    });
    res.json({ feedback });
  }),
);

/** Upsert, so editing feedback replaces it rather than adding a second entry. */
router.put(
  '/courses/:courseId/feedback',
  handle(async (req, res) => {
    await assertEnrolled(req.user.id, req.params.courseId);
    const input = feedbackSchema.parse(req.body);

    const feedback = await prisma.courseFeedback.upsert({
      where: { userId_courseId: { userId: req.user.id, courseId: req.params.courseId } },
      // Written out in full on both branches rather than spread: every value
      // is set every time, so revising feedback down to just an overall clears
      // the breakdown rather than leaving yesterday's numbers behind it.
      update: {
        rating: input.rating,
        contentRating: input.contentRating ?? null,
        durationRating: input.durationRating ?? null,
        comment: input.comment ?? null,
      },
      create: {
        userId: req.user.id,
        courseId: req.params.courseId,
        rating: input.rating,
        contentRating: input.contentRating ?? null,
        durationRating: input.durationRating ?? null,
        comment: input.comment ?? null,
      },
      select: {
        rating: true,
        contentRating: true,
        durationRating: true,
        comment: true,
        updatedAt: true,
      },
    });

    res.json({ feedback });
  }),
);

router.delete(
  '/courses/:courseId/feedback',
  handle(async (req, res) => {
    const { count } = await prisma.courseFeedback.deleteMany({
      where: { userId: req.user.id, courseId: req.params.courseId },
    });
    if (count === 0) throw new AppError(404, 'You have not left feedback on this course');
    res.status(204).end();
  }),
);

/**
 * Score analysis for the signed-in candidate.
 *
 * "Their score" is the LATEST scored attempt per quiz, not the best — retakes
 * are meant to reflect current understanding. Every attempt is still returned
 * so the trend over repeated tries is visible.
 */
router.get(
  '/progress',
  handle(async (req, res) => {
    const [assignments, enrollments] = await Promise.all([
      prisma.topicAssignment.findMany({
        where: { userId: req.user.id },
        include: {
          topic: {
            include: {
              course: { select: { id: true, code: true, version: true, title: true } },
              quiz: { select: { id: true, title: true, isPublished: true, passPercentage: true } },
            },
          },
        },
      }),
      prisma.enrollment.findMany({
        where: { userId: req.user.id },
        select: {
          courseId: true,
          enrolledAt: true,
          startedAt: true,
          completedAt: true,
          dueAt: true,
          pausedAt: true,
          pausedDays: true,
          supersededAt: true,
          discontinuedAt: true,
        },
      }),
    ]);

    const datesByCourse = new Map(enrollments.map((e) => [e.courseId, e]));

    const quizIds = assignments
      .map((a) => a.topic.quiz)
      .filter((q) => q?.isPublished)
      .map((q) => q.id);

    const attempts = await prisma.attempt.findMany({
      where: { candidateId: req.user.id, quizId: { in: quizIds }, status: 'scored' },
      orderBy: [{ quizId: 'asc' }, { attemptNumber: 'asc' }],
      select: {
        id: true,
        quizId: true,
        attemptNumber: true,
        totalScore: true,
        maxScore: true,
        percentage: true,
        submittedAt: true,
      },
    });

    const byQuiz = new Map();
    for (const attempt of attempts) {
      if (!byQuiz.has(attempt.quizId)) byQuiz.set(attempt.quizId, []);
      byQuiz.get(attempt.quizId).push({ ...attempt, percentage: Number(attempt.percentage) });
    }

    const byCourse = new Map();
    for (const { topic } of assignments) {
      if (!byCourse.has(topic.course.id)) {
        byCourse.set(topic.course.id, { ...topic.course, topics: [] });
      }

      const quiz = topic.quiz?.isPublished ? topic.quiz : null;
      const history = quiz ? (byQuiz.get(quiz.id) ?? []) : [];
      const latest = history.length > 0 ? history[history.length - 1] : null;
      const best = history.reduce(
        (top, a) => (top === null || a.percentage > top.percentage ? a : top),
        null,
      );

      byCourse.get(topic.course.id).topics.push({
        topicId: topic.id,
        title: topic.title,
        position: topic.position,
        hasQuiz: Boolean(quiz),
        passPercentage: quiz ? Number(quiz.passPercentage) : null,
        attemptCount: history.length,
        latest: latest && {
          percentage: latest.percentage,
          totalScore: latest.totalScore,
          maxScore: latest.maxScore,
          submittedAt: latest.submittedAt,
        },
        bestPercentage: best?.percentage ?? null,
        history: history.map((a) => ({
          attemptNumber: a.attemptNumber,
          percentage: a.percentage,
          submittedAt: a.submittedAt,
        })),
      });
    }

    const courses = [...byCourse.values()].map((course) => {
      const topics = course.topics.sort((a, b) => a.position - b.position);
      const withQuiz = topics.filter((t) => t.hasQuiz);
      const attempted = withQuiz.filter((t) => t.latest);

      // Marks-weighted, so a 10-mark quiz counts more than a 2-mark one.
      const earned = attempted.reduce((sum, t) => sum + t.latest.totalScore, 0);
      const possible = attempted.reduce((sum, t) => sum + t.latest.maxScore, 0);

      const dates = datesByCourse.get(course.id);

      return {
        ...course,
        topics,
        dates: {
          enrolledAt: dates?.enrolledAt ?? null,
          startedAt: dates?.startedAt ?? null,
          dueAt: dates?.dueAt ?? null,
          // Kept, not hidden: the quizzes they sat on this edition are theirs,
          // and a record that quietly drops what you did is worse than one that
          // says you have moved on — or stopped.
          supersededAt: dates?.supersededAt ?? null,
          discontinuedAt: dates?.discontinuedAt ?? null,
          pausedAt: dates?.pausedAt ?? null,
          pausedDays: dates?.pausedDays ?? 0,
          completedAt: dates?.completedAt ?? null,
        },
        summary: {
          quizzesAvailable: withQuiz.length,
          quizzesAttempted: attempted.length,
          marksEarned: earned,
          marksPossible: possible,
          overallPercentage: possible === 0 ? null : Math.round((earned / possible) * 1000) / 10,
        },
      };
    });

    res.json({ courses });
  }),
);

router.get(
  '/topics/:topicId',
  handle(async (req, res) => {
    await assertAllotted(req.user.id, req.params.topicId);

    const topic = await prisma.topic.findUnique({
      where: { id: req.params.topicId },
      include: {
        course: { select: { id: true, code: true, title: true } },
        materials: {
          orderBy: { position: 'asc' },
          select: {
            id: true,
            type: true,
            title: true,
            originalFilename: true,
            mimeType: true,
            fileSizeBytes: true,
          },
        },
      },
    });

    // Opening a topic is what "starting the course" means.
    await markStarted(req.user.id, topic.courseId);

    res.json({ topic });
  }),
);

/**
 * The quiz as the candidate sees it: questions and options, but never the
 * isCorrect flag. The answer key must not reach the browser, or it can be read
 * straight out of the network tab.
 */
router.get(
  '/topics/:topicId/quiz',
  handle(async (req, res) => {
    await assertAllotted(req.user.id, req.params.topicId);

    const quiz = await prisma.quiz.findUnique({
      where: { topicId: req.params.topicId },
      include: {
        questions: {
          orderBy: { position: 'asc' },
          select: {
            id: true,
            type: true,
            prompt: true,
            marks: true,
            position: true,
            options: {
              orderBy: { position: 'asc' },
              select: { id: true, label: true, position: true },
            },
          },
        },
      },
    });

    if (!quiz || !quiz.isPublished) throw new AppError(404, 'No quiz is available for this topic');

    const attempts = await prisma.attempt.findMany({
      where: { candidateId: req.user.id, quizId: quiz.id, status: 'scored' },
      orderBy: { attemptNumber: 'desc' },
      select: {
        id: true,
        attemptNumber: true,
        totalScore: true,
        maxScore: true,
        percentage: true,
        submittedAt: true,
      },
    });

    const attemptsLeft =
      quiz.maxAttempts == null ? null : Math.max(0, quiz.maxAttempts - attempts.length);

    // Ordered for this candidate's next sitting. The seed is the attempt they
    // are about to make — the same number the submit route works out for
    // itself — so the paper holds still across a refresh and comes back
    // differently on a retake.
    const paper = shuffleQuizFor(quiz, {
      userId: req.user.id,
      attemptNumber: attempts.length + 1,
      count: quiz.questionsPerAttempt,
    });

    res.json({
      quiz: {
        id: quiz.id,
        title: quiz.title,
        maxAttempts: quiz.maxAttempts,
        passPercentage: Number(quiz.passPercentage),
        questions: paper.questions,
        // The paper's marks, not the bank's. A 50-question bank drawn down to
        // 12 is a 12-question quiz as far as the candidate is concerned, and
        // showing the bank's total would promise a paper they never get.
        totalMarks: paper.questions.reduce((sum, q) => sum + q.marks, 0),
      },
      attempts,
      attemptsLeft,
      canAttempt: attemptsLeft === null || attemptsLeft > 0,
    });
  }),
);

/**
 * The answer key for one of the candidate's own submitted attempts.
 *
 * Deliberately a separate endpoint behind an explicit action, rather than part
 * of the submit response: it is the only place isCorrect is exposed to a
 * candidate, and it is reachable only for an attempt they have already sat.
 */
router.get(
  '/attempts/:attemptId/review',
  handle(async (req, res) => {
    // Scoped to the caller — one candidate can never review another's attempt.
    // Staff reach the same shaping through /api/quizzes, gated on the course.
    res.json(await buildAttemptReview(req.params.attemptId, { candidateId: req.user.id }));
  }),
);

const submitSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().uuid(),
        optionIds: z.array(z.string().uuid()),
      }),
    )
    .min(1, 'Answer at least one question'),
});

router.post(
  '/topics/:topicId/quiz/attempts',
  handle(async (req, res) => {
    await assertAllotted(req.user.id, req.params.topicId);
    const { answers } = submitSchema.parse(req.body);

    const quiz = await prisma.quiz.findUnique({
      where: { topicId: req.params.topicId },
      include: { questions: { include: { options: true } } },
    });
    if (!quiz || !quiz.isPublished) throw new AppError(404, 'No quiz is available for this topic');
    if (quiz.questions.length === 0) throw new AppError(422, 'This quiz has no questions');

    const priorAttempts = await prisma.attempt.count({
      where: { candidateId: req.user.id, quizId: quiz.id, status: 'scored' },
    });
    if (quiz.maxAttempts != null && priorAttempts >= quiz.maxAttempts) {
      throw new AppError(409, `You have used all ${quiz.maxAttempts} attempts for this quiz`);
    }

    /**
     * The exact paper this candidate was served, rebuilt rather than trusted.
     *
     * Selection is deterministic on candidate, quiz and attempt number, and
     * `priorAttempts` here is the same count the GET used — so the server can
     * work out which twelve of fifty questions it handed over without having
     * stored anything, and without believing the browser about it.
     *
     * Scoring against this rather than the whole bank is what makes the draw
     * safe: score it against all fifty and every candidate fails by default,
     * marked absent on the thirty-eight they were never shown.
     */
    const paper = shuffleQuizFor(quiz, {
      userId: req.user.id,
      attemptNumber: priorAttempts + 1,
      count: quiz.questionsPerAttempt,
    });

    // Reject answers that reference another quiz's questions, or options that
    // don't belong to the question they were submitted under. Scoped to the
    // paper, so an answer to a question this candidate was not asked is
    // refused rather than quietly counted.
    const questionsById = new Map(paper.questions.map((q) => [q.id, q]));
    const answersByQuestionId = new Map();

    for (const answer of answers) {
      const question = questionsById.get(answer.questionId);
      if (!question) throw new AppError(422, 'An answer refers to a question outside this quiz');

      const validOptionIds = new Set(question.options.map((o) => o.id));
      for (const optionId of answer.optionIds) {
        if (!validOptionIds.has(optionId)) {
          throw new AppError(422, 'An answer refers to an option outside its question');
        }
      }
      answersByQuestionId.set(answer.questionId, [...new Set(answer.optionIds)]);
    }

    const { results, totalScore, maxScore, percentage } = scoreAttempt(
      paper.questions,
      answersByQuestionId,
    );

    // One transaction so a half-written attempt can never be left behind.
    const attempt = await prisma.$transaction(async (tx) => {
      const created = await tx.attempt.create({
        data: {
          candidateId: req.user.id,
          quizId: quiz.id,
          attemptNumber: priorAttempts + 1,
          status: 'scored',
          submittedAt: new Date(),
          totalScore,
          maxScore,
          percentage,
        },
      });

      for (const result of results) {
        await tx.answer.create({
          data: {
            attemptId: created.id,
            questionId: result.question.id,
            awardedMarks: result.awardedMarks,
            isCorrect: result.isCorrect,
            status: 'submitted',
            selectedOptions: {
              create: result.selected.map((optionId) => ({ optionId })),
            },
          },
        });
      }

      return created;
    });

    // Submitting counts as starting, in case they went straight to the quiz.
    const topic = await prisma.topic.findUnique({
      where: { id: req.params.topicId },
      select: { courseId: true },
    });
    await markStarted(req.user.id, topic.courseId);
    await refreshCompletion(req.user.id, topic.courseId);

    res.status(201).json({
      attempt: {
        id: attempt.id,
        attemptNumber: attempt.attemptNumber,
        totalScore,
        maxScore,
        percentage,
        passed: percentage >= Number(quiz.passPercentage),
      },
      // Which questions were right, but deliberately NOT which options were
      // correct — retakes are unlimited, so handing over the answer key would
      // make the next attempt meaningless.
      breakdown: results.map((r) => ({
        questionId: r.question.id,
        prompt: r.question.prompt,
        marks: r.question.marks,
        awardedMarks: r.awardedMarks,
        isCorrect: r.isCorrect,
      })),
    });
  }),
);

export default router;
