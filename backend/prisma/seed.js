import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Development logins only. Change these before anything is deployed anywhere
// other people can reach.
//
// The short emails are the accounts you actually log in as. Everyone below them
// is a name on a list — enough people for the admin screens to look like the
// real thing when marking trainers and allotting courses. Real staff will come
// from the office SAML directory, which will replace these rows entirely.
const SEED_USERS = [
  { email: 'admin@learningtracker.local', fullName: 'Super Admin', role: 'admin' },
  { email: 'trainer@learningtracker.local', fullName: 'Priya Menon', role: 'lead' },
  { email: 'candidate@learningtracker.local', fullName: 'Arun Kumar', role: 'candidate' },
  { email: 'candidate2@learningtracker.local', fullName: 'Divya Nair', role: 'candidate' },

  ...[
    'Sneha Pillai',
    'Vivek Sharma',
    'Anjali Thomas',
    'Karthik Raj',
    'Meera Krishnan',
    'Joseph Mathew',
    'Fathima Basheer',
    'Sandeep Gopal',
    'Lakshmi Iyer',
    'Nikhil Varma',
    'Aisha Rahman',
    'Rohit Deshpande',
    'Keerthi Suresh',
    'Manoj Pillai',
  ].map((fullName) => ({
    email: `${fullName.toLowerCase().replace(' ', '.')}@learningtracker.local`,
    fullName,
    role: 'candidate',
  })),
];

const PM_TOPICS = [
  {
    title: 'Project Initiation & the Project Charter',
    description:
      'What starts a project formally: business case, feasibility, and the charter that authorises the work.',
  },
  {
    title: 'Stakeholder Identification & Analysis',
    description:
      'Finding everyone affected by the project and deciding how much attention each one needs.',
  },
  {
    title: 'Scope Management & the WBS',
    description:
      'Defining what is and is not in the project, and decomposing it into a work breakdown structure.',
  },
  {
    title: 'Scheduling, Estimation & the Critical Path',
    description:
      'Sequencing activities, estimating durations, and identifying the path that determines the end date.',
  },
  {
    title: 'Risk Identification & the Risk Register',
    description:
      'Spotting what could go wrong, scoring probability against impact, and planning responses.',
  },
];

const SEED_PASSWORD = process.env.SEED_PASSWORD ?? 'Password123!';

async function main() {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);

  console.log('Users');
  const users = {};
  for (const user of SEED_USERS) {
    users[user.email] = await prisma.user.upsert({
      where: { email: user.email },
      // Role is set on create only. Re-running the seed must not demote
      // somebody an admin has since made a lead or put on a course team.
      update: { fullName: user.fullName },
      create: { ...user, passwordHash },
    });
    console.log(`  ${user.role.padEnd(9)} ${user.email}`);
  }

  const trainer = users['trainer@learningtracker.local'];
  const arun = users['candidate@learningtracker.local'];

  console.log('\nCourse');
  const course = await prisma.course.upsert({
    where: { code: 'PM-101' },
    update: {},
    create: {
      code: 'PM-101',
      title: 'Project Management Fundamentals',
      description:
        'A five-week introduction to planning, scheduling and controlling projects, ending with risk management.',
      isPublished: true,
      ownerId: trainer.id,
    },
  });
  console.log(`  ${course.code} — ${course.title} (owner: ${trainer.fullName})`);

  console.log('\nTopics');
  const topics = [];
  for (const [index, topic] of PM_TOPICS.entries()) {
    const position = index + 1;
    // Topics have no natural unique key beyond (courseId, position), which is
    // what makes re-running this script idempotent.
    const existing = await prisma.topic.findUnique({
      where: { courseId_position: { courseId: course.id, position } },
    });

    const record = existing
      ? await prisma.topic.update({ where: { id: existing.id }, data: { ...topic, isPublished: true } })
      : await prisma.topic.create({
          data: { ...topic, position, isPublished: true, courseId: course.id },
        });

    topics.push(record);
    console.log(`  ${position}. ${record.title}`);
  }

  // Arun is allotted the first three topics only — so the candidate view
  // visibly differs from the full course, which is the point of allotment.
  console.log('\nAllotment');
  await prisma.enrollment.createMany({
    data: [{ userId: arun.id, courseId: course.id }],
    skipDuplicates: true,
  });
  await prisma.topicAssignment.createMany({
    data: topics.slice(0, 3).map((t) => ({
      userId: arun.id,
      topicId: t.id,
      assignedBy: trainer.id,
    })),
    skipDuplicates: true,
  });
  console.log(`  ${arun.fullName} -> topics 1-3 of ${topics.length}`);

  console.log(`\nAll seed users share the password: ${SEED_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
