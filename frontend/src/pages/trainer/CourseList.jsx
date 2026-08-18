import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { Alert, Badge, Card, Empty } from '../../components/ui';

export default function CourseList() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
          <div className="grid gap-4 sm:grid-cols-2">
            {courses.map((course) => (
              <Link key={course.id} to={`/trainer/courses/${course.id}`}>
                <Card
                  accent="indigo"
                  className="h-full transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold tracking-wide text-indigo-600">
                        {course.code}
                      </p>
                      <h2 className="mt-0.5 font-semibold text-slate-900">{course.title}</h2>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <Badge tone={course.isPublished ? 'green' : 'amber'}>
                        {course.isPublished ? 'Published' : 'Draft'}
                      </Badge>
                      {/* Leading a course and assisting on one are different jobs. */}
                      {course.relation === 'lead' ? (
                        <Badge tone="indigo">You lead</Badge>
                      ) : (
                        course.relation === 'trainer' && <Badge tone="sky">On the team</Badge>
                      )}
                    </div>
                  </div>
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
      </div>
    </div>
  );
}
