import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { Alert, Badge, Button, Card, Empty } from '../../components/ui';

/**
 * The course catalogue.
 *
 * Summary information only — a candidate can see that a course exists and ask
 * to join it, but cannot open its topics, material or quizzes until a trainer
 * allots them.
 */
export default function BrowseCourses() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  async function load() {
    try {
      const { courses } = await api('/learn/catalogue');
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

  async function subscribe(courseId) {
    setBusyId(courseId);
    setError(null);
    try {
      await api(`/learn/courses/${courseId}/subscribe`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function withdraw(courseId) {
    setBusyId(courseId);
    setError(null);
    try {
      await api(`/learn/courses/${courseId}/subscribe`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading courses…</p>;

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">Browse courses</h1>
      <p className="mt-1 text-sm text-slate-500">
        Everything on offer. Ask to join a course and your trainer will give you access.
      </p>

      <div className="mt-4">
        <Alert>{error}</Alert>
      </div>

      {courses.length === 0 ? (
        <div className="mt-6">
          <Empty>No courses have been published yet.</Empty>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {courses.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              busy={busyId === course.id}
              onSubscribe={() => subscribe(course.id)}
              onWithdraw={() => withdraw(course.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CourseCard({ course, busy, onSubscribe, onWithdraw }) {
  const { subscription, allottedTopics, topicCount } = course;

  const accent = { none: 'sky', pending: 'amber', active: 'emerald' }[subscription];

  return (
    <Card accent={accent} className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold tracking-wide text-indigo-600">{course.code}</p>
          <h2 className="mt-0.5 font-semibold text-slate-900">{course.title}</h2>
        </div>
        {subscription === 'active' && <Badge tone="green">Enrolled</Badge>}
        {subscription === 'pending' && <Badge tone="amber">Requested</Badge>}
      </div>

      {course.description && (
        <p className="mt-2 text-sm text-slate-600">{course.description}</p>
      )}

      <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
        <span className="text-violet-700">{topicCount} topics</span>
        {course.durationWeeks && (
          <>
            <span className="text-slate-300">·</span>
            <span className="text-amber-700">{course.durationWeeks} weeks</span>
          </>
        )}
        <span className="text-slate-300">·</span>
        <span>Trainer: {course.trainerName}</span>
      </p>

      <div className="mt-auto pt-4">
        {subscription === 'none' && (
          <Button onClick={onSubscribe} disabled={busy}>
            {busy ? 'Sending…' : 'Ask to join'}
          </Button>
        )}

        {subscription === 'pending' && (
          <div>
            <p className="mb-2 text-xs text-amber-700">
              Waiting for {course.trainerName} to approve your request.
            </p>
            <Button variant="secondary" onClick={onWithdraw} disabled={busy}>
              {busy ? 'Withdrawing…' : 'Withdraw request'}
            </Button>
          </div>
        )}

        {subscription === 'active' &&
          (allottedTopics > 0 ? (
            <Link to="/my-courses">
              <Button variant="subtle">
                Open {allottedTopics} of {topicCount} topics
              </Button>
            </Link>
          ) : (
            <p className="text-xs text-slate-500">
              You&apos;re enrolled. Your trainer hasn&apos;t shared any topics with you yet.
            </p>
          ))}
      </div>
    </Card>
  );
}
