import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { Alert, Badge, Button, Card, Empty } from '../../components/ui';

const formatDate = (value) =>
  new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** Every candidate waiting to be let into one of the trainer's courses. */
export default function Inbox() {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyKey, setBusyKey] = useState(null);

  const load = useCallback(async () => {
    try {
      const { requests } = await api('/allot/requests');
      setRequests(requests);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(courseId, userId, approve) {
    const key = `${courseId}:${userId}`;
    setBusyKey(key);
    setError(null);
    try {
      if (approve) {
        await api(`/allot/courses/${courseId}/requests/${userId}/approve`, {
          method: 'POST',
          body: { allotAllTopics: true },
        });
      } else {
        await api(`/allot/courses/${courseId}/requests/${userId}`, { method: 'DELETE' });
      }
      await load();
      // Tell the navbar its badge is stale.
      window.dispatchEvent(new Event('inbox-changed'));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyKey(null);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading requests…</p>;

  // Group by course so a trainer decides one course at a time.
  const byCourse = new Map();
  for (const request of requests) {
    if (!byCourse.has(request.course.id)) {
      byCourse.set(request.course.id, { course: request.course, people: [] });
    }
    byCourse.get(request.course.id).people.push(request);
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Inbox</h1>
        {requests.length > 0 && <Badge tone="amber">{requests.length} waiting</Badge>}
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Candidates asking to join {user.role === 'admin' ? 'any course' : 'your courses'}.
        Approving gives access to every topic in the course.
      </p>

      <div className="mt-4">
        <Alert>{error}</Alert>
      </div>

      {requests.length === 0 ? (
        <div className="mt-6">
          <Empty>Nothing waiting. New requests to join a course will appear here.</Empty>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {[...byCourse.values()].map(({ course, people }) => (
            <Card key={course.id} accent="amber">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="text-base font-semibold tracking-wide text-indigo-600">
                    {course.code}
                  </p>
                  <h2 className="font-semibold text-slate-900">{course.title}</h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {course._count.topics} topic{course._count.topics === 1 ? '' : 's'}
                    {user.role === 'admin' && ` · owned by ${course.owner.fullName}`}
                  </p>
                </div>
                <Link
                  to={`/trainer/courses/${course.id}`}
                  className="text-sm text-indigo-600 hover:text-indigo-700"
                >
                  Open course
                </Link>
              </div>

              <ul className="mt-3 space-y-2">
                {people.map((request) => {
                  const busy = busyKey === `${course.id}:${request.user.id}`;
                  return (
                    <li
                      key={request.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2"
                    >
                      <span>
                        <span className="block text-sm font-medium text-slate-900">
                          {request.user.fullName}
                        </span>
                        <span className="text-xs text-slate-500">
                          {request.user.email} · asked {formatDate(request.enrolledAt)}
                        </span>
                      </span>
                      <span className="flex gap-2">
                        <Button
                          onClick={() => decide(course.id, request.user.id, true)}
                          disabled={busy}
                        >
                          {busy ? '…' : 'Approve'}
                        </Button>
                        <Button
                          variant="danger"
                          onClick={() => decide(course.id, request.user.id, false)}
                          disabled={busy}
                        >
                          Decline
                        </Button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
