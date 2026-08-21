import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middleware/error.js';


/**
 * How `user` stands in relation to a course — the one place these rules live.
 *
 *   'admin'   — an administrator; everything, on every course
 *   'lead'    — the trainer the course is allotted to; runs it, publishes it
 *   'trainer' — on the course's team; builds the topics handed to them
 *   null      — no access at all
 *
 * An unallotted course has no lead, so only admins can reach it.
 */
export async function courseRelation(user, courseId) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: { team: { select: { userId: true } } },
  });
  if (!course) throw new AppError(404, 'Course not found');

  if (user.role === 'admin') return { course, relation: 'admin' };
  if (course.ownerId === user.id) return { course, relation: 'lead' };
  if (course.team.some((t) => t.userId === user.id)) return { course, relation: 'trainer' };

  return { course, relation: null };
}

const isLead = (relation) => relation === 'admin' || relation === 'lead';

/**
 * Read access: the lead, anyone on the team, or an admin. Enough to look at the
 * course, its progress and its feedback.
 */
export async function assertCourseRead(user, courseId) {
  const { course, relation } = await courseRelation(user, courseId);
  if (!relation) throw new AppError(403, 'You are not on that course');
  return course;
}

/**
 * Authority over the course itself: editing it, publishing it, creating and
 * handing out topics, and everything to do with candidates. The lead's job — a
 * team trainer builds content and nothing more.
 */
export async function assertCourseLead(user, courseId) {
  const { course, relation } = await courseRelation(user, courseId);

  if (!isLead(relation)) {
    throw new AppError(
      403,
      relation === 'trainer'
        ? 'Only the course lead can do that'
        : 'You are not on that course',
    );
  }
  return course;
}

/**
 * Nobody builds a course and sits in it as a learner.
 *
 * Someone on both sides would appear in their own candidate progress, be
 * allotted topics they wrote, and sit the quiz they set. The rule is enforced
 * from both ends: staff cannot be enrolled, and anyone enrolled cannot be made
 * staff — see assertNotEnrolled below for the other direction.
 */
export async function assertNotCourseStaff(courseId, userIds) {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return;

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      ownerId: true,
      owner: { select: { id: true, fullName: true } },
      team: { where: { userId: { in: ids } }, include: { user: { select: { fullName: true } } } },
    },
  });
  if (!course) throw new AppError(404, 'Course not found');

  if (course.ownerId && ids.includes(course.ownerId)) {
    throw new AppError(
      422,
      `${course.owner.fullName} leads this course, so they cannot also be a learner on it`,
    );
  }

  const [member] = course.team;
  if (member) {
    throw new AppError(
      422,
      `${member.user.fullName} is on this course’s team, so they cannot also be a learner on it`,
    );
  }
}

/**
 * The other direction: someone already learning a course cannot be put on its
 * staff. Take them off the course first — the same rule, read backwards.
 */
export async function assertNotEnrolled(courseId, userId, { as }) {
  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
    include: { user: { select: { fullName: true } } },
  });
  if (!enrollment) return;

  throw new AppError(
    409,
    `${enrollment.user.fullName} is enrolled on this course as a learner, so they cannot be its ${as}. Remove them from the course first.`,
  );
}

/**
 * Takes a candidate off a course entirely: their place on it and the topics
 * released to them. Their attempts are left alone — those are a record of what
 * happened, not an entitlement.
 */
export async function removeFromCourse(user, courseId, userId) {
  await assertCourseLead(user, courseId);

  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
  });
  if (!enrollment) throw new AppError(404, 'That person is not on this course');

  await prisma.$transaction([
    prisma.topicAssignment.deleteMany({ where: { userId, topic: { courseId } } }),
    prisma.enrollment.delete({ where: { id: enrollment.id } }),
  ]);
}

export async function listCourses(user) {
  // Admins see everything. A trainer sees the courses they lead and the ones
  // they are on the team of — both are "my courses" from where they sit.
  const where =
    user.role === 'admin'
      ? {}
      : { OR: [{ ownerId: user.id }, { team: { some: { userId: user.id } } }] };

  const courses = await prisma.course.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      owner: { select: { id: true, fullName: true } },
      _count: { select: { topics: true, enrollments: true, team: true } },
      // Which of this course's topics are the viewer's duty, so the list can say
      // so without a request per course.
      topics: {
        where: { OR: [{ materialTrainerId: user.id }, { quizTrainerId: user.id }] },
        select: { id: true },
      },
    },
  });

  return courses.map(({ topics, ...course }) => ({
    ...course,
    // 'admin' is not used here: an admin looking at the list is a bystander to
    // every course, and the label would be noise on all of them.
    relation: course.ownerId === user.id ? 'lead' : user.role === 'admin' ? null : 'trainer',
    myTopics: topics.length,
  }));
}

export async function getCourse(user, courseId) {
  const { relation } = await courseRelation(user, courseId);
  if (!relation) throw new AppError(403, 'You are not on that course');

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      owner: { select: { id: true, fullName: true } },
      team: {
        orderBy: { addedAt: 'asc' },
        include: { user: { select: { id: true, fullName: true, email: true, isActive: true } } },
      },
      topics: {
        orderBy: { position: 'asc' },
        include: {
          materialTrainer: { select: { id: true, fullName: true } },
          quizTrainer: { select: { id: true, fullName: true } },
          materials: { orderBy: { position: 'asc' } },
          quiz: {
            select: {
              id: true,
              title: true,
              isPublished: true,
              _count: { select: { questions: true } },
            },
          },
          _count: { select: { assignments: true } },
        },
      },
    },
  });

  return {
    ...course,
    team: course.team.map((row) => row.user),
    // The screen gates its own buttons on this rather than re-deriving the rules.
    viewer: { relation, canPublish: relation === 'admin' || relation === 'lead' },
  };
}

/**
 * Codes are unique; report the clash rather than letting the constraint surface
 * as an opaque 500. `exceptId` lets an update keep its own code.
 */
async function assertCodeFree(code, exceptId, client = prisma) {
  const clash = await client.course.findUnique({ where: { code } });
  if (clash && clash.id !== exceptId) {
    throw new AppError(409, `Course code "${code}" is already in use`);
  }
}

/**
 * Creates a course under a lead, or under nobody yet when ownerId is null.
 * Callers are responsible for checking that ownerId really is a lead.
 *
 * `client` takes a transaction when the caller is also promoting the owner, so
 * the promotion and the course appear together or not at all.
 */
export async function createCourseForLead(ownerId, data, client = prisma) {
  await assertCodeFree(data.code, undefined, client);

  return client.course.create({
    data: { ...data, ownerId },
    include: { owner: { select: { id: true, fullName: true } } },
  });
}

export async function updateCourse(user, courseId, data) {
  // The whole of a course's own record — code, title, duration, publish state —
  // is the lead's to change.
  await assertCourseLead(user, courseId);
  if (data.code) await assertCodeFree(data.code, courseId);

  return prisma.course.update({ where: { id: courseId }, data });
}

export async function deleteCourse(user, courseId) {
  await assertCourseLead(user, courseId);
  await prisma.course.delete({ where: { id: courseId } });
}

// ------------------------------------------------------------------ topics

export async function createTopic(user, courseId, data) {
  // Structuring the course is the lead's job; the team fills the structure in.
  await assertCourseLead(user, courseId);

  // Append to the end of the sidebar rather than making the caller work out
  // the next position.
  const last = await prisma.topic.findFirst({
    where: { courseId },
    orderBy: { position: 'desc' },
    select: { position: true },
  });

  return prisma.topic.create({
    data: { ...data, courseId, position: (last?.position ?? 0) + 1 },
  });
}

/**
 * As courseRelation, for a topic, plus which halves of it are this user's duty.
 * A topic is two jobs — writing the material and setting the quiz — and the
 * lead may have given them to different people.
 */
export async function topicRelation(user, topicId) {
  const topic = await prisma.topic.findUnique({
    where: { id: topicId },
    include: { course: { include: { team: { select: { userId: true } } } } },
  });
  if (!topic) throw new AppError(404, 'Topic not found');

  const { course } = topic;
  let relation = null;
  if (user.role === 'admin') relation = 'admin';
  else if (course.ownerId === user.id) relation = 'lead';
  else if (course.team.some((t) => t.userId === user.id)) relation = 'trainer';

  return {
    topic,
    relation,
    onMaterialDuty: topic.materialTrainerId === user.id,
    onQuizDuty: topic.quizTrainerId === user.id,
  };
}

/** Read a topic: the lead, anyone on the team, or an admin. */
export async function assertTopicRead(user, topicId) {
  const { topic, relation } = await topicRelation(user, topicId);
  if (!relation) throw new AppError(403, 'You are not on that course');
  return topic;
}

const DUTY = {
  material: { on: 'onMaterialDuty', noun: 'material' },
  quiz: { on: 'onQuizDuty', noun: 'quiz' },
};

/**
 * Write one half of a topic — its material, or its quiz.
 *
 * Open to the lead, and to the trainer holding *that* duty. Holding the other
 * half is not enough: the point of splitting the job in two is that each half
 * has exactly one author.
 */
function assertDuty(kind) {
  const { on, noun } = DUTY[kind];

  return async (user, topicId) => {
    const state = await topicRelation(user, topicId);
    const { topic, relation } = state;

    if (isLead(relation)) return topic;
    if (relation === 'trainer' && state[on]) return topic;

    if (relation === 'trainer') {
      throw new AppError(403, `Setting this topic’s ${noun} is another trainer’s duty`);
    }
    throw new AppError(403, 'You are not on that course');
  };
}

/** Uploading, renaming or removing this topic's material. */
export const assertMaterialWrite = assertDuty('material');

/** Creating the quiz, and writing or changing its questions. */
export const assertQuizWrite = assertDuty('quiz');

/**
 * Publishing, deleting, or handing out a topic — the lead's call, never a team
 * trainer's, however much of the topic they wrote.
 */
export async function assertTopicLead(user, topicId) {
  const { topic, relation } = await topicRelation(user, topicId);

  if (!isLead(relation)) {
    throw new AppError(
      403,
      relation === 'trainer'
        ? 'Only the course lead can do that'
        : 'You are not on that course',
    );
  }
  return topic;
}

/**
 * Publishing is gated separately from the rest of an update, so a trainer can
 * rename their topic but not release it. Callers check this before writing.
 */
export const changesPublishState = (data) => data.isPublished !== undefined;

export async function updateTopic(user, topicId, data) {
  // The topic's own record — title, blurb, publish state — is the lead's. Now
  // that the work is split in two, neither trainer owns the topic itself; they
  // own the material or the quiz hanging off it.
  await assertTopicLead(user, topicId);
  return prisma.topic.update({ where: { id: topicId }, data });
}

export async function deleteTopic(user, topicId) {
  await assertTopicLead(user, topicId);
  await prisma.topic.delete({ where: { id: topicId } });
}

/**
 * The lead handing out a topic's two jobs — writing the material, setting the
 * quiz — or clearing either with null.
 *
 * `duties` is a patch: only the keys present are changed, so giving the quiz to
 * somebody leaves the material where it is. Only trainers already on the team
 * can be named; the team is the admin's decision, dividing it up is the lead's.
 */
export async function assignTopicDuties(user, topicId, duties) {
  const topic = await assertTopicLead(user, topicId);

  const data = {};
  if ('material' in duties) data.materialTrainerId = duties.material;
  if ('quiz' in duties) data.quizTrainerId = duties.quiz;

  const named = [duties.material, duties.quiz].filter(Boolean);
  if (named.length > 0) {
    const onTeam = await prisma.courseTrainer.findMany({
      where: { courseId: topic.courseId, userId: { in: named } },
      include: { user: { select: { id: true, fullName: true, isActive: true } } },
    });

    for (const userId of new Set(named)) {
      const row = onTeam.find((t) => t.userId === userId);
      if (!row) throw new AppError(422, 'That trainer is not on this course’s team');
      if (!row.user.isActive) {
        throw new AppError(422, `${row.user.fullName}’s account is deactivated`);
      }
    }
  }

  return prisma.topic.update({
    where: { id: topicId },
    data,
    include: {
      materialTrainer: { select: { id: true, fullName: true } },
      quizTrainer: { select: { id: true, fullName: true } },
    },
  });
}
