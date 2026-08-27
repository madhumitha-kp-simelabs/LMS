import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { Alert, Badge, Card, Empty } from '../../components/ui';
import { groupByCategory, toneForCategory, useCollapsedCategories } from '../../lib/categories';
import CategoryHeading from '../../components/CategoryHeading';

/**
 * What a course is to the person looking at it. Leading one and working on
 * somebody else's are different jobs, so they get different colours — the card's
 * top edge carries it, which makes a grid of courses sortable at a glance.
 */
const MY_ROLE = {
  lead: {
    accent: 'indigo',
    label: 'You lead this course',
    text: 'text-indigo-700',
    dot: 'bg-indigo-500',
  },
  trainer: {
    accent: 'sky',
    label: 'You are on the team',
    text: 'text-sky-700',
    dot: 'bg-sky-500',
  },
};

function MyRole({ relation }) {
  // An admin browsing the list is a bystander on every course; a label on all of
  // them would be noise rather than information.
  const role = MY_ROLE[relation];
  if (!role) return null;

  return (
    <p className={`mt-2 flex items-center gap-1.5 text-xs font-medium ${role.text}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${role.dot}`} aria-hidden />
      {role.label}
    </p>
  );
}

export default function CourseList() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const folds = useCollapsedCategories('lt.courses.collapsed');

  async function load() {
    try {
      const { courses } = await api('/courses');
      setCourses(courses);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) return <p className="text-sm text-slate-500">Loading courses…</p>;

  return (
    <div>
      <div>
        <h1 className="text-xl font-semibold text-slate-900">My courses</h1>
        <p className="mt-1 text-sm text-slate-500">
          Open a course to add topics, upload material, build quizzes and allot candidates.
        </p>
      </div>

      <div className="mt-6 space-y-4">
        <Alert>{error}</Alert>

        {courses.length === 0 ? (
          <Empty>
            No courses allotted to you yet. An administrator adds courses and decides who runs
            them — once one is yours it appears here.
          </Empty>
        ) : (
          // Grouped even when there is one group: a lead running four Frontend
          // courses should see the same shape as one running four subjects,
          // rather than the page changing structure as the list grows.
          groupByCategory(courses).map((group) => (
            <section key={group.category.id ?? 'none'}>
              <CategoryHeading
                category={group.category}
                count={group.courses.length}
                open={folds.isOpen(group.category)}
                onToggle={() => folds.toggle(group.category)}
              />

              {folds.isOpen(group.category) && (
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                {group.courses.map((course) => (
              <Link key={course.id} to={`/trainer/courses/${course.id}`}>
                <Card
                  accent={MY_ROLE[course.relation]?.accent ?? 'indigo'}
                  className="h-full transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-base font-semibold tracking-wide text-indigo-600">
                        {course.code}
                      </p>
                      <h2 className="mt-0.5 font-semibold text-slate-900">{course.title}</h2>
                    </div>
                    {/* Only the course's own state belongs here. What the course
                        is to you is said once, below, in words. */}
                    <span className="flex shrink-0 flex-wrap justify-end gap-1.5">
                      {course.category && (
                        <Badge tone={toneForCategory(course.category)}>
                          {course.category.name}
                        </Badge>
                      )}
                      <Badge tone={course.isPublished ? 'green' : 'amber'}>
                        {course.isPublished ? 'Published' : 'Draft'}
                      </Badge>
                    </span>
                  </div>

                  <MyRole relation={course.relation} />

                  {course.description && (
                    <p className="mt-2 line-clamp-2 text-sm text-slate-600">{course.description}</p>
                  )}
                  <p className="mt-4 flex flex-wrap gap-x-3 text-xs">
                    <span className="text-violet-700">{course._count.topics} topics</span>
                    {course.relation === 'trainer' && (
                      <>
                        <span className="text-slate-300">·</span>
                        <span className={course.myTopics > 0 ? 'text-sky-700' : 'text-amber-700'}>
                          {course.myTopics > 0
                            ? `${course.myTopics} yours`
                            : 'none assigned to you'}
                        </span>
                      </>
                    )}
                    <span className="text-slate-300">·</span>
                    <span className="text-sky-700">{course._count.enrollments} candidates</span>
                    {course.durationWeeks && (
                      <>
                        <span className="text-slate-300">·</span>
                        <span className="text-amber-700">{course.durationWeeks} weeks</span>
                      </>
                    )}
                  </p>
                </Card>
              </Link>
                ))}
              </div>
              )}
            </section>
          ))
        )}
      </div>
    </div>
  );
}
