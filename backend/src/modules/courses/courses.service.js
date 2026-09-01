import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middleware/error.js';
import { deleteFile } from '../../lib/storage.js';
import { announceNewVersion } from '../notifications/notify.js';


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
  //
  // A lead sees theirs and no more. What else the organisation teaches is a
  // question for Browse courses, which answers it for everyone at once rather
  // than turning this working list into a catalogue.
  const where =
    user.role === 'admin'
      ? {}
      : { OR: [{ ownerId: user.id }, { team: { some: { userId: user.id } } }] };

  const courses = await prisma.course.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      owner: { select: { id: true, fullName: true } },
      category: { select: { id: true, name: true, slug: true, position: true } },
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
      category: { select: { id: true, name: true, slug: true, position: true } },
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
              // Attempts are counted so the screen can say what deleting a
              // topic actually destroys — scored work, not just files.
              _count: { select: { questions: true, attempts: true } },
            },
          },
          _count: { select: { assignments: true } },
        },
      },
    },
  });

  // Counts for the course's tab row. Fetched here rather than by the nav
  // itself because every one of those screens already loads the course — three
  // cheap counts on a request that is happening anyway beats a second round
  // trip on every tab, and a tab that cannot say "1 waiting" is a tab nobody
  // clicks.
  const projectWhere = { project: { courseId } };
  const [projects, submissions, awaitingReview] = await Promise.all([
    prisma.project.count({ where: { courseId } }),
    prisma.projectAllotment.count({ where: { ...projectWhere, submittedAt: { not: null } } }),
    prisma.projectAllotment.count({
      where: { ...projectWhere, submittedAt: { not: null }, evaluatedAt: null },
    }),
  ]);

  return {
    ...course,
    team: course.team.map((row) => row.user),
    work: { projects, submissions, awaitingReview },
    // The screen gates its own buttons on this rather than re-deriving the rules.
    viewer: { relation, canPublish: relation === 'admin' || relation === 'lead' },
  };
}

/**
 * Codes are unique; report the clash rather than letting the constraint surface
 * as an opaque 500. `exceptId` lets an update keep its own code.
 */
async function assertCodeFree(code, version, exceptId, client = prisma) {
  const clash = await client.course.findFirst({ where: { code, version } });
  if (clash && clash.id !== exceptId) {
    throw new AppError(
      409,
      `${code} version ${version} already exists — give this one a different version.`,
    );
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
  await assertCodeFree(data.code, data.version ?? 1, undefined, client);

  return client.course.create({
    data: { ...data, ownerId },
    include: {
      owner: { select: { id: true, fullName: true } },
      category: { select: { id: true, name: true, slug: true, position: true } },
    },
  });
}

export async function updateCourse(user, courseId, data) {
  // The whole of a course's own record — code, title, duration, publish state —
  // is the lead's to change.
  const course = await assertCourseLead(user, courseId);
  // Either half of the pair moving can collide, so check whenever either does,
  // against whatever the other half will be once this save lands.
  if (data.code || data.version) {
    await assertCodeFree(data.code ?? course.code, data.version ?? course.version, courseId);
  }

  const updated = await prisma.course.update({ where: { id: courseId }, data });

  /**
   * Giving a running course a duration gives its cohort deadlines.
   *
   * Without this, a lead who sets the length after people have started hands a
   * deadline to nobody already on it — the date is stamped when somebody starts,
   * and they already have. Only enrolments that started and have no deadline
   * are touched, so an extension somebody was granted is never overwritten.
   */
  if (data.durationWeeks != null && data.durationWeeks !== course.durationWeeks) {
    const waiting = await prisma.enrollment.findMany({
      where: { courseId, startedAt: { not: null }, dueAt: null },
      select: { id: true, startedAt: true },
    });

    for (const enrolment of waiting) {
      await prisma.enrollment.update({
        where: { id: enrolment.id },
        data: {
          dueAt: new Date(
            enrolment.startedAt.getTime() + data.durationWeeks * 7 * 86400000,
          ),
        },
      });
    }
  }

  /**
   * Publishing a later edition is what tells the cohort still on an earlier one.
   *
   * The publish, not the copy: a duplicated course is a draft with unrevised
   * material, and pointing candidates at it before anybody has finished the
   * revision would be worse than saying nothing. This is the moment there is
   * actually something to move to.
   *
   * Only on the transition into published, so a lead editing the title of an
   * already-live v2 does not re-announce it.
   */
  if (data.isPublished === true && !course.isPublished && updated.version > 1) {
    try {
      await announceNewVersion(updated);
    } catch {
      // The course is published either way; a missed notice is not worth
      // failing that, and the lead can republish to try again.
    }
  }

  return updated;
}

/**
 * What deleting a course would destroy.
 *
 * Deletion cascades all the way down — topics, material, quizzes, every
 * attempt, every project and everything handed in against it, enrolments and
 * feedback. That is a lot to take on the word of a button, so a screen can ask
 * for this first and say it out loud.
 */
export async function courseDeletionImpact(user, courseId) {
  await assertCourseLead(user, courseId);

  const [course, candidates, topics, materials, attempts, projects, submissions] =
    await Promise.all([
      prisma.course.findUnique({
        where: { id: courseId },
        select: { code: true, version: true, title: true },
      }),
      prisma.enrollment.count({ where: { courseId } }),
      prisma.topic.count({ where: { courseId } }),
      prisma.material.count({ where: { topic: { courseId } } }),
      prisma.attempt.count({ where: { quiz: { topic: { courseId } } } }),
      prisma.project.count({ where: { courseId } }),
      prisma.projectAllotment.count({
        where: { project: { courseId }, submittedAt: { not: null } },
      }),
    ]);

  if (!course) throw new AppError(404, 'Course not found');

  return { ...course, candidates, topics, materials, attempts, projects, submissions };
}

/**
 * Removing a course and everything under it.
 *
 * The database cascade handles the rows. It cannot handle the files, so the
 * storage keys are collected first and removed after — material PDFs and every
 * file a candidate uploaded against a project on this course. Without that,
 * deleting a course silently leaks every file it ever held.
 *
 * A material file shared with another version of the course is left alone; the
 * count of rows still pointing at it decides.
 */
export async function deleteCourse(user, courseId) {
  await assertCourseLead(user, courseId);

  const [materials, submissions] = await Promise.all([
    prisma.material.findMany({
      where: { topic: { courseId }, fileUrl: { not: null } },
      select: { fileUrl: true },
    }),
    prisma.projectAllotment.findMany({
      where: { project: { courseId }, fileUrl: { not: null } },
      select: { fileUrl: true },
    }),
  ]);

  await prisma.course.delete({ where: { id: courseId } });

  /**
   * After the row is gone: an orphaned file is untidy, a course whose deletion
   * half-happened is a correctness problem.
   *
   * deleteFile never rejects — it logs and moves on — so this counts what was
   * asked for rather than pretending to know what the disk did.
   */
  let removed = 0;

  for (const { fileUrl } of submissions) {
    await deleteFile(fileUrl);
    removed += 1;
  }

  for (const { fileUrl } of materials) {
    // Versioning copies material rows against one storage key, so a file is
    // only really gone once nothing else points at it.
    const stillUsed = await prisma.material.count({ where: { fileUrl } });
    if (stillUsed === 0) {
      await deleteFile(fileUrl);
      removed += 1;
    }
  }

  return { files: removed };
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
    const course = await prisma.course.findUnique({
      where: { id: topic.courseId },
      select: { ownerId: true },
    });

    const onTeam = await prisma.courseTrainer.findMany({
      where: { courseId: topic.courseId, userId: { in: named } },
      include: { user: { select: { id: true, fullName: true, isActive: true } } },
    });

    for (const userId of new Set(named)) {
      /**
       * The lead may take a topic themselves.
       *
       * Otherwise a course with no team yet is a dead end: the lead can write
       * topics and can see they need writing, but cannot record that they are
       * doing it — and has to wait on an administrator to add somebody before
       * the screen will let them say so. The handbook has the lead acting as
       * one of the trainers anyway.
       */
      if (userId === course?.ownerId) continue;

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

/**
 * Copying a course into its next version.
 *
 * The point of versioning by copy is that both editions run at once: the cohort
 * part-way through v1 keeps the material they started on, while v2 is revised
 * and taught alongside. So this brings across everything that describes the
 * course — topics, material, quizzes with their questions, project briefs —
 * and none of the people: no enrolments, no allotments, no attempts, no
 * feedback. Those belong to the edition they happened on.
 *
 * The copy starts as a draft whatever the original was. A new version appearing
 * in front of candidates the instant it is created, before anybody has revised
 * a word of it, is the opposite of what it is for.
 */
export async function duplicateCourse(user, courseId) {
  const source = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      topics: {
        orderBy: { position: 'asc' },
        include: {
          materials: { orderBy: { position: 'asc' } },
          quiz: { include: { questions: { include: { options: true } } } },
        },
      },
      projects: { orderBy: { position: 'asc' } },
    },
  });
  if (!source) throw new AppError(404, 'Course not found');

  // Anyone who may edit the course may version it — it is the same act of
  // authorship, and the copy is a draft nobody can see yet.
  await assertCourseLead(user, courseId);

  // Next after the highest that exists, not source.version + 1: v2 may already
  // have been made from v1, and the answer then is v3.
  const latest = await prisma.course.findFirst({
    where: { code: source.code },
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  const version = latest.version + 1;

  // One transaction: a course whose topics half-copied is worse than no copy,
  // because it looks finished.
  return prisma.$transaction(async (tx) => {
    const copy = await tx.course.create({
      data: {
        code: source.code,
        version,
        title: source.title,
        description: source.description,
        durationWeeks: source.durationWeeks,
        categoryId: source.categoryId,
        ownerId: source.ownerId,
        isPublished: false,
      },
    });

    for (const topic of source.topics) {
      const newTopic = await tx.topic.create({
        data: {
          courseId: copy.id,
          title: topic.title,
          description: topic.description,
          position: topic.position,
          isPublished: topic.isPublished,
          // Duties come across: the people who wrote v1's material are the
          // obvious people to revise it, and clearing them would make the lead
          // hand out the same work twice.
          materialTrainerId: topic.materialTrainerId,
          quizTrainerId: topic.quizTrainerId,
        },
      });

      if (topic.materials.length > 0) {
        await tx.material.createMany({
          data: topic.materials.map((material) => ({
            topicId: newTopic.id,
            type: material.type,
            title: material.title,
            body: material.body,
            // The same storage key, deliberately — copying the file itself
            // would double the storage for two identical PDFs. Deleting a
            // material now checks whether another still points at the file
            // before removing it; see materials.routes.
            fileUrl: material.fileUrl,
            originalFilename: material.originalFilename,
            mimeType: material.mimeType,
            fileSizeBytes: material.fileSizeBytes,
            position: material.position,
          })),
        });
      }

      if (topic.quiz) {
        const newQuiz = await tx.quiz.create({
          data: {
            topicId: newTopic.id,
            title: topic.quiz.title,
            maxAttempts: topic.quiz.maxAttempts,
            passPercentage: topic.quiz.passPercentage,
            questionsPerAttempt: topic.quiz.questionsPerAttempt,
            // Published separately, like the course: a copied quiz has not been
            // reviewed yet.
            isPublished: false,
          },
        });

        for (const question of topic.quiz.questions) {
          await tx.question.create({
            data: {
              quizId: newQuiz.id,
              type: question.type,
              prompt: question.prompt,
              marks: question.marks,
              position: question.position,
              options: {
                create: question.options.map((option) => ({
                  label: option.label,
                  isCorrect: option.isCorrect,
                  position: option.position,
                })),
              },
            },
          });
        }
      }
    }

    if (source.projects.length > 0) {
      await tx.project.createMany({
        data: source.projects.map((project) => ({
          courseId: copy.id,
          position: project.position,
          title: project.title,
          brief: project.brief,
          // Deadlines are per cohort, and this cohort has not started.
          dueAt: null,
        })),
      });
    }

    return {
      ...copy,
      copied: {
        topics: source.topics.length,
        materials: source.topics.reduce((n, t) => n + t.materials.length, 0),
        quizzes: source.topics.filter((t) => t.quiz).length,
        projects: source.projects.length,
      },
    };
  });
}
