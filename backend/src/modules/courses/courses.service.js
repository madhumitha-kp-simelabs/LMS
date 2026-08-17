import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middleware/error.js';


/**
 * A trainer may only touch courses they own. An admin may touch any.
 * Returns the course so callers don't re-query it.
 */
export async function assertCourseAccess(user, courseId) {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) throw new AppError(404, 'Course not found');

  if (user.role !== 'admin' && course.ownerId !== user.id) {
    throw new AppError(403, 'That course belongs to another trainer');
  }
  return course;
}

export function listCourses(user) {
  // Admins see everything; trainers see only what they own.
  const where = user.role === 'admin' ? {} : { ownerId: user.id };

  return prisma.course.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      owner: { select: { id: true, fullName: true } },
      _count: { select: { topics: true, enrollments: true } },
    },
  });
}

export async function getCourse(user, courseId) {
  await assertCourseAccess(user, courseId);

  return prisma.course.findUnique({
    where: { id: courseId },
    include: {
      owner: { select: { id: true, fullName: true } },
      topics: {
        orderBy: { position: 'asc' },
        include: {
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
}

export async function createCourse(user, data) {
  const clash = await prisma.course.findUnique({ where: { code: data.code } });
  if (clash) throw new AppError(409, `Course code "${data.code}" is already in use`);

  return prisma.course.create({ data: { ...data, ownerId: user.id } });
}

export async function updateCourse(user, courseId, data) {
  await assertCourseAccess(user, courseId);

  // Codes are unique; report the clash rather than letting the constraint
  // surface as an opaque 500.
  if (data.code) {
    const clash = await prisma.course.findUnique({ where: { code: data.code } });
    if (clash && clash.id !== courseId) {
      throw new AppError(409, `Course code "${data.code}" is already used by another course`);
    }
  }

  return prisma.course.update({ where: { id: courseId }, data });
}

export async function deleteCourse(user, courseId) {
  await assertCourseAccess(user, courseId);
  await prisma.course.delete({ where: { id: courseId } });
}

// ------------------------------------------------------------------ topics

export async function createTopic(user, courseId, data) {
  await assertCourseAccess(user, courseId);

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

export async function assertTopicAccess(user, topicId) {
  const topic = await prisma.topic.findUnique({
    where: { id: topicId },
    include: { course: true },
  });
  if (!topic) throw new AppError(404, 'Topic not found');

  if (user.role !== 'admin' && topic.course.ownerId !== user.id) {
    throw new AppError(403, 'That topic belongs to another trainer’s course');
  }
  return topic;
}

export async function updateTopic(user, topicId, data) {
  await assertTopicAccess(user, topicId);
  return prisma.topic.update({ where: { id: topicId }, data });
}

export async function deleteTopic(user, topicId) {
  await assertTopicAccess(user, topicId);
  await prisma.topic.delete({ where: { id: topicId } });
}
