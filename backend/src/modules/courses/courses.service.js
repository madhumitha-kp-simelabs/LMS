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
      topics: { where: { assignedTrainerId: user.id }, select: { id: true } },
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
          assignedTrainer: { select: { id: true, fullName: true } },
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
 * Creates a course under a trainer, or under nobody yet when ownerId is null.
 * Callers are responsible for checking that ownerId really is a trainer.
 *
 * `client` takes a transaction when the caller is also promoting the owner, so
 * the promotion and the course appear together or not at all.
 */
export async function createCourseForTrainer(ownerId, data, client = prisma) {
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

/** As courseRelation, for a topic, plus whether this topic is the user's duty. */
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

  return { topic, relation, onDuty: topic.assignedTrainerId === user.id };
}

/** Read a topic: the lead, anyone on the team, or an admin. */
export async function assertTopicRead(user, topicId) {
  const { topic, relation } = await topicRelation(user, topicId);
  if (!relation) throw new AppError(403, 'You are not on that course');
  return topic;
}

/**
 * Write a topic's contents — its material, its quiz, its own title and blurb.
 *
 * Open to the lead, and to the team trainer whose duty this topic is. A trainer
 * on the team but not on duty for this particular topic is deliberately shut
 * out: the point of handing topics out is that each has one owner.
 */
export async function assertTopicWrite(user, topicId) {
  const { topic, relation, onDuty } = await topicRelation(user, topicId);

  if (isLead(relation)) return topic;
  if (relation === 'trainer' && onDuty) return topic;

  if (relation === 'trainer') {
    throw new AppError(403, 'That topic is another trainer’s duty on this course');
  }
  throw new AppError(403, 'You are not on that course');
}

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
  if (changesPublishState(data)) await assertTopicLead(user, topicId);
  else await assertTopicWrite(user, topicId);

  return prisma.topic.update({ where: { id: topicId }, data });
}

export async function deleteTopic(user, topicId) {
  await assertTopicLead(user, topicId);
  await prisma.topic.delete({ where: { id: topicId } });
}

/**
 * The lead putting a team trainer on duty for a topic, or clearing it with null.
 * Only someone already on the team can be given a duty — the team is the admin's
 * decision, dividing it up is the lead's.
 */
export async function assignTopicDuty(user, topicId, trainerId) {
  const topic = await assertTopicLead(user, topicId);

  if (trainerId) {
    const onTeam = await prisma.courseTrainer.findUnique({
      where: { courseId_userId: { courseId: topic.courseId, userId: trainerId } },
      include: { user: { select: { fullName: true, isActive: true } } },
    });

    if (!onTeam) {
      throw new AppError(422, 'That trainer is not on this course’s team');
    }
    if (!onTeam.user.isActive) {
      throw new AppError(422, `${onTeam.user.fullName}’s account is deactivated`);
    }
  }

  return prisma.topic.update({
    where: { id: topicId },
    data: { assignedTrainerId: trainerId },
    include: { assignedTrainer: { select: { id: true, fullName: true } } },
  });
}
