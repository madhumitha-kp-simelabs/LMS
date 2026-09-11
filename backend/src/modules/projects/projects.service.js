import { prisma } from '../../lib/prisma.js';
import { deleteFile } from '../../lib/storage.js';
import { AppError } from '../../middleware/error.js';
import {
  assertCourseRead,
  assertNotCourseStaff,
  courseRelation,
} from '../courses/courses.service.js';

/**
 * Projects are course work: the lead sets them, an admin hands them out, and a
 * candidate marks their own copy finished.
 *
 * That split is why the checks differ from topics. A topic is written by a
 * trainer on duty; a project is written once by the lead and never handed to a
 * trainer, so there is no duty here — only "who may set it" and "who may give
 * it out".
 */

/** Loads a project along with the course it belongs to. */
async function load(projectId) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { course: { select: { id: true, code: true, title: true } } },
  });
  if (!project) throw new AppError(404, 'Project not found');
  return project;
}

/**
 * Writing a project is the lead's alone — an administrator cannot, even though
 * they can do most things on any course.
 *
 * This is deliberate and is why it does not use assertCourseLead, which admits
 * admins: the two halves of a project are meant to sit with different people.
 * The lead knows the subject and sets the work; the admin decides who does it.
 * An admin who could also write the brief would collapse that split.
 */
const NOT_YOURS_TO_WRITE =
  'Only a course’s lead writes its projects — you hand them out once they exist';

async function assertIsTheLead(user, courseId, adminMessage = NOT_YOURS_TO_WRITE) {
  const { course, relation } = await courseRelation(user, courseId);

  if (relation !== 'lead') {
    throw new AppError(
      403,
      relation === 'admin'
        ? adminMessage
        : relation === 'trainer'
          ? 'Only the course lead can do that'
          : 'You are not on that course',
    );
  }
  return course;
}

/** As above, reached through the project rather than the course. */
export async function assertProjectLead(user, projectId, adminMessage) {
  const project = await load(projectId);
  await assertIsTheLead(user, project.courseId, adminMessage);
  return project;
}

/** Everything a staff screen shows about one candidate on one project. */
const allotmentShape = {
  orderBy: { allottedAt: 'asc' },
  include: {
    user: { select: { id: true, fullName: true, email: true } },
    evaluator: { select: { id: true, fullName: true } },
  },
};

/**
 * The lead's mark on an allotment, shaped for the screens. Always an object, so
 * a screen can read `evaluation.score` without first testing for its existence;
 * `evaluatedAt` is the flag for whether anyone has looked yet.
 */
const evaluationOf = (row) => ({
  score: row.score,
  feedback: row.feedback,
  evaluatedAt: row.evaluatedAt,
  evaluatedBy: row.evaluator ? { id: row.evaluator.id, fullName: row.evaluator.fullName } : null,
});

/** The handed-in part of an allotment, shaped for the screens. */
const submissionOf = (row) => ({
  url: row.submissionUrl,
  note: row.submissionNote,
  filename: row.originalFilename,
  fileSizeBytes: row.fileSizeBytes,
  hasFile: Boolean(row.fileUrl),
  submittedAt: row.submittedAt,
});

/** Every project on a course, with who holds each and how far along they are. */
export async function listForCourse(user, courseId) {
  await assertCourseRead(user, courseId);

  const projects = await prisma.project.findMany({
    where: { courseId },
    orderBy: { position: 'asc' },
    include: { allotments: allotmentShape },
  });

  return projects.map(({ allotments, ...project }) => ({
    ...project,
    candidates: allotments.map((a) => ({
      id: a.user.id,
      fullName: a.user.fullName,
      email: a.user.email,
      allottedAt: a.allottedAt,
      completedAt: a.completedAt,
      submission: submissionOf(a),
      evaluation: evaluationOf(a),
    })),
    handedIn: allotments.filter((a) => a.submittedAt).length,
    allotted: allotments.length,
    completed: allotments.filter((a) => a.completedAt).length,
    evaluated: allotments.filter((a) => a.evaluatedAt).length,
    // What the lead's queue is: work sitting there that nobody has marked.
    awaitingReview: allotments.filter((a) => a.submittedAt && !a.evaluatedAt).length,
  }));
}

/**
 * The people a project on this course can be given to.
 *
 * Enrolled, still on this edition, and not staff on it — the same set the
 * allotment check will accept, worked out once so the screen offers only names
 * that will go through rather than letting a lead tick one and be refused.
 */
export async function allottableFor(user, courseId) {
  await assertCourseRead(user, courseId);

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { ownerId: true, team: { select: { userId: true } } },
  });
  if (!course) throw new AppError(404, 'Course not found');

  const staff = new Set([course.ownerId, ...course.team.map((t) => t.userId)]);

  const enrolments = await prisma.enrollment.findMany({
    where: {
      courseId,
      status: 'active',
      supersededAt: null,
      discontinuedAt: null,
      user: { isActive: true, role: { in: ['candidate', 'trainer', 'lead'] } },
    },
    orderBy: { user: { fullName: 'asc' } },
    select: { user: { select: { id: true, fullName: true, email: true } } },
  });

  return enrolments.map((e) => e.user).filter((u) => !staff.has(u.id));
}

export async function createProject(user, courseId, data) {
  await assertIsTheLead(user, courseId);

  // Append rather than making the caller work out the next position, the same
  // way topics are added.
  const last = await prisma.project.findFirst({
    where: { courseId },
    orderBy: { position: 'desc' },
    select: { position: true },
  });

  return prisma.project.create({
    data: { ...data, courseId, position: (last?.position ?? 0) + 1 },
  });
}

export async function updateProject(user, projectId, data) {
  await assertProjectLead(user, projectId);
  return prisma.project.update({ where: { id: projectId }, data });
}

/**
 * Removing a project, and the work handed in against it.
 *
 * The lead who wrote it, or an administrator. Writing a brief stays the lead's
 * alone, but clearing one out is housekeeping — an admin who cannot remove a
 * project created by mistake has to go and ask the person who made the mistake.
 *
 * Deleting cascades to the allotments, which is the whole risk: it destroys
 * every candidate's submission for this project, including files they uploaded.
 * The count goes back to the caller so the screen can say what it is about to
 * take with it, and the files are removed from storage rather than left behind
 * as rows nobody can reach any more.
 */
export async function deleteProject(user, projectId) {
  const project = await load(projectId);

  if (user.role !== 'admin') await assertIsTheLead(user, project.courseId);

  const allotments = await prisma.projectAllotment.findMany({
    where: { projectId },
    select: { fileUrl: true },
  });

  await prisma.project.delete({ where: { id: projectId } });

  // After the row is gone, so a storage failure cannot leave a project that
  // half-exists. An orphaned file is a tidiness problem; a project whose
  // deletion half-happened is a correctness one.
  for (const { fileUrl } of allotments) {
    if (fileUrl) await deleteFile(fileUrl).catch(() => {});
  }

  return { allotments: allotments.length };
}

/** What deleting would destroy, so a screen can warn before it asks. */
export async function deletionImpact(user, projectId) {
  const project = await load(projectId);
  if (user.role !== 'admin') await assertIsTheLead(user, project.courseId);

  const allotments = await prisma.projectAllotment.findMany({
    where: { projectId },
    select: { submittedAt: true },
  });

  return {
    allotted: allotments.length,
    handedIn: allotments.filter((a) => a.submittedAt).length,
  };
}

/**
 * Who may hand this project out, and to whom.
 *
 * An admin may give it to anybody eligible, on any course. A lead may give it
 * out on the course they run, but only to people already enrolled on it — they
 * set the work, so they are the one who knows a candidate is ready for it, and
 * waiting on an admin to relay that was a queue for no reason.
 *
 * The enrolment rule is what keeps a lead's reach to their own cohort: a lead
 * cannot pull in somebody who never signed up for the course. Enrolments that
 * ended are no good either — moved to a later version, stopped, or on a
 * different edition entirely — because setting work on a course somebody has
 * left is work nobody will ever see.
 */
async function assertMayAllot(user, project, candidateIds) {
  if (user.role === 'admin') return;

  await assertIsTheLead(
    user,
    project.courseId,
    'Only a course’s lead hands out its projects',
  );

  const enrolled = await prisma.enrollment.findMany({
    where: {
      courseId: project.courseId,
      userId: { in: candidateIds },
      status: 'active',
      supersededAt: null,
      discontinuedAt: null,
    },
    select: { userId: true },
  });

  const has = new Set(enrolled.map((e) => e.userId));
  const missing = [...new Set(candidateIds)].filter((id) => !has.has(id));
  if (missing.length === 0) return;

  // Named, not counted: "one of them is not enrolled" leaves the lead to work
  // out which, from a list they just ticked.
  const strangers = await prisma.user.findMany({
    where: { id: { in: missing } },
    select: { fullName: true },
  });
  const names = strangers.map((u) => u.fullName).join(', ');
  throw new AppError(
    422,
    strangers.length === 1
      ? `${names} is not enrolled on this course, so you cannot set them its work`
      : `${names} are not enrolled on this course, so you cannot set them its work`,
  );
}

/**
 * Handing a project to candidates.
 *
 * Anyone already holding it is skipped rather than treated as an error: the
 * point of the screen is "these people should have it", and re-sending a name
 * should not undo somebody's progress.
 */
export async function allot(user, projectId, candidateIds) {
  const project = await load(projectId);
  await assertMayAllot(user, project, candidateIds);

  // Leads count as learners on courses they do not run, the same as they do
  // for topics. assertNotCourseStaff below is what stops one being set work on
  // their own course.
  const candidates = await prisma.user.findMany({
    where: { id: { in: candidateIds }, role: { in: ['candidate', 'trainer', 'lead'] }, isActive: true },
    select: { id: true },
  });
  if (candidates.length !== new Set(candidateIds).size) {
    throw new AppError(422, 'One or more of those accounts cannot be given course work');
  }

  // The same rule as courses: nobody builds a course and is set its work.
  await assertNotCourseStaff(project.courseId, candidateIds);

  const { count } = await prisma.projectAllotment.createMany({
    data: candidates.map((c) => ({
      projectId,
      userId: c.id,
      allottedBy: user.id,
    })),
    skipDuplicates: true,
  });

  return { added: count, alreadyHad: candidates.length - count };
}

/**
 * Takes a project back off one candidate, losing their done mark with it.
 *
 * Same reach as handing it out: an admin anywhere, a lead on their own course.
 * Taking back is the more destructive half — it deletes whatever they handed
 * in — so it must not be the looser check of the two.
 */
export async function withdraw(user, projectId, userId) {
  const project = await load(projectId);
  if (user.role !== 'admin') {
    await assertIsTheLead(user, project.courseId, 'Only a course’s lead hands out its projects');
  }

  const { count } = await prisma.projectAllotment.deleteMany({
    where: { projectId, userId },
  });
  if (count === 0) throw new AppError(404, 'That candidate does not have this project');
}

// -------------------------------------------------- reviewing and marking

/**
 * Everything handed in on one course, flattened to one row per candidate per
 * project so the review screen can sort the whole course at once rather than
 * project by project.
 *
 * Allotments nobody has handed anything in for are left out: this is the list
 * of work to look at, and an empty allotment is not work yet. Who has not
 * handed in is a question the Projects page already answers.
 */
export async function listSubmissions(user, courseId) {
  await assertCourseRead(user, courseId);

  const rows = await prisma.projectAllotment.findMany({
    where: { project: { courseId }, submittedAt: { not: null } },
    // Unmarked first — the point of the screen is the queue, and Postgres
    // would otherwise sort those nulls last — then oldest submission first
    // within each half, so nobody's work waits indefinitely.
    orderBy: [{ evaluatedAt: { sort: 'asc', nulls: 'first' } }, { submittedAt: 'asc' }],
    include: {
      user: { select: { id: true, fullName: true, email: true } },
      evaluator: { select: { id: true, fullName: true } },
      project: { select: { id: true, title: true, position: true, dueAt: true } },
    },
  });

  return rows.map((row) => ({
    projectId: row.project.id,
    project: row.project,
    candidate: row.user,
    allottedAt: row.allottedAt,
    completedAt: row.completedAt,
    // Handed in after the deadline. Worth showing a marker even though the
    // candidate is no longer nagged about it — it is part of judging the work.
    late: row.project.dueAt != null && row.submittedAt > row.project.dueAt,
    submission: submissionOf(row),
    evaluation: evaluationOf(row),
  }));
}

const NOT_YOURS_TO_MARK =
  'Only a course’s lead marks its work — you decide who does it, they judge how it went';

/** The lead's copy of one candidate's allotment, or a 404 if there is none. */
async function allotmentFor(projectId, userId) {
  const allotment = await prisma.projectAllotment.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!allotment) throw new AppError(404, 'That candidate does not have this project');
  return allotment;
}

/**
 * The lead marking one candidate's work: a score out of 100, written feedback,
 * or both.
 *
 * Only the lead, by the same split that governs writing the brief — the person
 * who set the work is the one who knows what good looks like. An admin hands
 * projects out and reads the result; they do not grade it.
 *
 * Work that was never handed in can still be marked. That sounds odd until you
 * remember the artefact is optional: a project can be demonstrated in a room,
 * and refusing to record the outcome because no file was uploaded would make
 * the screen lie about what happened.
 */
export async function evaluate(user, projectId, userId, { score, feedback }) {
  await assertProjectLead(user, projectId, NOT_YOURS_TO_MARK);
  const allotment = await allotmentFor(projectId, userId);

  return prisma.projectAllotment.update({
    where: { id: allotment.id },
    data: {
      score: score ?? null,
      feedback: feedback?.trim() || null,
      evaluatedBy: user.id,
      // Re-marking moves the date: it is when the standing judgement was made,
      // not when the first one was.
      evaluatedAt: new Date(),
    },
    include: { evaluator: { select: { id: true, fullName: true } } },
  });
}

/** Taking a mark back off, so the work reads as unreviewed again. */
export async function clearEvaluation(user, projectId, userId) {
  await assertProjectLead(user, projectId, NOT_YOURS_TO_MARK);
  const allotment = await allotmentFor(projectId, userId);
  if (!allotment.evaluatedAt) throw new AppError(404, 'That work has not been marked');

  return prisma.projectAllotment.update({
    where: { id: allotment.id },
    data: { score: null, feedback: null, evaluatedBy: null, evaluatedAt: null },
  });
}

// ------------------------------------------------------------- candidate side

/** The projects one candidate holds, newest course first. */
export async function listForCandidate(userId) {
  const rows = await prisma.projectAllotment.findMany({
    where: { userId },
    orderBy: [{ completedAt: 'asc' }, { allottedAt: 'desc' }],
    include: {
      project: {
        include: { course: { select: { id: true, code: true, title: true } } },
      },
      evaluator: { select: { id: true, fullName: true } },
    },
  });

  return rows.map((row) => ({
    id: row.project.id,
    title: row.project.title,
    brief: row.project.brief,
    dueAt: row.project.dueAt,
    course: row.project.course,
    allottedAt: row.allottedAt,
    completedAt: row.completedAt,
    submission: submissionOf(row),
    evaluation: evaluationOf(row),
    // Overdue only matters while it is still outstanding — a project finished
    // late is finished, and nagging about it afterwards helps nobody.
    overdue: !row.completedAt && row.project.dueAt != null && row.project.dueAt < new Date(),
  }));
}

/**
 * The candidate marking their own copy finished, or undoing that. Nobody else
 * can set it: finishing is a claim about your own work.
 */
export async function setDone(userId, projectId, done) {
  const allotment = await mine(userId, projectId);

  /**
   * Finishing is one-way.
   *
   * It is a claim the lead then evaluates, so a candidate taking it back after
   * a mark has been given would leave a score against work nobody is claiming
   * to have finished. Un-marking also removed the row from the lead's review
   * queue, which is a quiet way to withdraw something already being looked at.
   *
   * Marking again is not an error — the button is gone once it is done, so a
   * repeat is a double submit or a stale tab, and the first date is the one
   * that counts.
   */
  if (!done) {
    throw new AppError(
      409,
      'A project cannot be un-marked once finished — ask your course lead if it needs reopening',
    );
  }

  if (allotment.completedAt) return allotment;

  return prisma.projectAllotment.update({
    where: { id: allotment.id },
    data: { completedAt: new Date() },
    include: { project: { select: { id: true, title: true } } },
  });
}

/** The candidate's own copy of a project, or a 404 if it is not theirs. */
async function mine(userId, projectId) {
  const allotment = await prisma.projectAllotment.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!allotment) throw new AppError(404, 'That project has not been given to you');
  return allotment;
}

/**
 * Recording what the candidate produced: a link, a note, or both. Sending an
 * empty link clears it, so work can be withdrawn as well as handed in.
 *
 * `submittedAt` is stamped the first time anything is attached and cleared only
 * when nothing is left, so the staff list can say "handed in" without guessing.
 */
/**
 * A hand-in is final.
 *
 * Once work has been sent it is what the lead evaluates, and letting a
 * candidate swap it afterwards means a score can end up attached to something
 * other than the thing that earned it — including after it has been marked.
 * Adding to an empty hand-in is unaffected; this only refuses changing one
 * that already exists.
 */
function assertNotHandedIn(allotment) {
  if (allotment.submittedAt) {
    throw new AppError(
      409,
      'You have already handed this in — ask your course lead if it needs to change',
    );
  }
}

export async function saveSubmission(userId, projectId, { url, note }) {
  const allotment = await mine(userId, projectId);
  assertNotHandedIn(allotment);

  const submissionUrl = url?.trim() || null;
  const submissionNote = note?.trim() || null;
  const stillHasSomething = Boolean(submissionUrl || submissionNote || allotment.fileUrl);

  return prisma.projectAllotment.update({
    where: { id: allotment.id },
    data: {
      submissionUrl,
      submissionNote,
      submittedAt: stillHasSomething ? (allotment.submittedAt ?? new Date()) : null,
    },
  });
}

/** Attaching a file. Replacing one deletes the file it stood in for. */
export async function attachFile(userId, projectId, file) {
  const allotment = await mine(userId, projectId);
  assertNotHandedIn(allotment);
  const previous = allotment.fileUrl;

  const updated = await prisma.projectAllotment.update({
    where: { id: allotment.id },
    data: {
      fileUrl: file.filename,
      originalFilename: file.originalname,
      mimeType: file.mimetype,
      fileSizeBytes: BigInt(file.size),
      submittedAt: allotment.submittedAt ?? new Date(),
    },
  });

  if (previous) await deleteFile(previous);
  return updated;
}

/** Removing the file, leaving any link and note in place. */
export async function removeFile(userId, projectId) {
  const allotment = await mine(userId, projectId);
  assertNotHandedIn(allotment);
  if (!allotment.fileUrl) throw new AppError(404, 'You have not attached a file');

  const stillHasSomething = Boolean(allotment.submissionUrl || allotment.submissionNote);

  const updated = await prisma.projectAllotment.update({
    where: { id: allotment.id },
    data: {
      fileUrl: null,
      originalFilename: null,
      mimeType: null,
      fileSizeBytes: null,
      submittedAt: stillHasSomething ? allotment.submittedAt : null,
    },
  });

  await deleteFile(allotment.fileUrl);
  return updated;
}

/**
 * The file a candidate handed in, for staff to read. Anyone on the course may
 * open it — the whole team can see the work, as they can see the progress.
 * The candidate themselves can open their own.
 */
export async function fileFor(user, projectId, userId) {
  const allotment = await prisma.projectAllotment.findUnique({
    where: { projectId_userId: { projectId, userId } },
    include: { project: { select: { courseId: true } } },
  });
  if (!allotment?.fileUrl) throw new AppError(404, 'No file was handed in');

  if (user.id !== userId) await assertCourseRead(user, allotment.project.courseId);

  return allotment;
}

/**
 * Every project in the organisation, whichever course it sits on.
 *
 * For leads and admins. A lead runs one course but is answerable for how the
 * whole programme hangs together, and until now the only way to see what work
 * had been set elsewhere was to open each course in turn and count.
 *
 * Named candidates are left out on purpose, on every course including the
 * caller's own: this is the "what has been set across the organisation" view,
 * and the per-course Projects screen is where you look at who is doing it. That
 * keeps one rule for the whole endpoint instead of a payload whose shape
 * changes row by row depending on which courses the reader happens to be on.
 */
export async function listEverything(user) {
  if (user.role !== 'admin' && user.role !== 'lead') {
    throw new AppError(403, 'Only leads and administrators see across courses');
  }

  /**
   * A lead sees the work on their own courses; an administrator sees all of it.
   *
   * This used to hand every lead every project in the organisation, on the
   * argument that knowing what else is being asked of the same candidates
   * stops two courses setting the same task. In practice it was a page of
   * other people's course design that the reader could not act on — no edit,
   * no allotment, nothing to do but read it. Answering "what is the whole
   * programme asking of people" is an administrator's job, and they still get
   * that view.
   */
  const mine = user.role === 'admin' ? {} : { course: { ownerId: user.id } };

  const projects = await prisma.project.findMany({
    where: mine,
    orderBy: [{ course: { code: 'asc' } }, { course: { version: 'asc' } }, { position: 'asc' }],
    include: {
      course: {
        select: {
          id: true,
          code: true,
          // Two editions of one course share a code and a title, so without
          // the version their work is indistinguishable on this screen.
          version: true,
          title: true,
          isPublished: true,
          owner: { select: { id: true, fullName: true } },
          category: { select: { id: true, name: true, slug: true, position: true } },
        },
      },
      allotments: {
        select: { completedAt: true, submittedAt: true, evaluatedAt: true },
      },
    },
  });

  return projects.map(({ allotments, ...project }) => ({
    ...project,
    // Whose course this is, from where the reader sits — the screen greys out
    // the ones they cannot act on rather than hiding them.
    mine: project.course.owner?.id === user.id,
    allotted: allotments.length,
    completed: allotments.filter((a) => a.completedAt).length,
    handedIn: allotments.filter((a) => a.submittedAt).length,
    evaluated: allotments.filter((a) => a.evaluatedAt).length,
    awaitingReview: allotments.filter((a) => a.submittedAt && !a.evaluatedAt).length,
    overdue:
      project.dueAt != null &&
      project.dueAt < new Date() &&
      allotments.some((a) => !a.completedAt),
  }));
}
