import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { Alert, Badge, Button, Card, Empty } from '../../components/ui';
import SessionQueue from './SessionQueue';
import ExtensionQueue from './ExtensionQueue';

const formatDate = (value) =>
  new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** Every candidate waiting to be let into one of the trainer's courses. */
export default function Inbox() {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [extensions, setExtensions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyKey, setBusyKey] = useState(null);

  const load = useCallback(async () => {
    try {
      const [joins, meetings, moreTime] = await Promise.all([
        api('/allot/requests'),
        // A trainer has no session or extension inbox; both endpoints answer
        // with an empty one rather than a 403, so this needs no role test.
        api('/sessions/inbox'),
        api('/extensions/inbox'),
      ]);
      setRequests(joins.requests);
      setSessions(meetings.sessions);
      setExtensions(moreTime.extensions);
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
        {requests.length + sessions.length + extensions.length > 0 && (
          <Badge tone="amber">
            {requests.length + sessions.length + extensions.length} waiting
          </Badge>
        )}
      </div>
      <p className="mt-1 max-w-2xl text-sm text-slate-500">
        Candidates asking to join {user.role === 'admin' ? 'any course' : 'your courses'}, and
        asking for time with you. Approving a join gives access to every topic in the course.
      </p>

      <div className="mt-4">
        <Alert>{error}</Alert>
      </div>

      {/* Session requests first. Someone already on a course and stuck is more
          urgent than someone waiting at the door — and the answer takes longer
          to write, so burying it under a list of Approve buttons gets it left. */}
      <SessionQueue
        sessions={sessions}
        onChanged={async () => {
          await load();
          window.dispatchEvent(new Event('inbox-changed'));
        }}
        onError={setError}
      />

      {/* After sessions, before joins. Somebody stuck needs you today; somebody
          asking for time needs you before their deadline; somebody at the door
          can wait a day without it costing them anything. */}
      <ExtensionQueue
        extensions={extensions}
        onChanged={async () => {
          await load();
          window.dispatchEvent(new Event('inbox-changed'));
        }}
        onError={setError}
      />

      {requests.length === 0 ? (
        sessions.length === 0 &&
        extensions.length === 0 && (
          <div className="mt-6">
            <Empty>
              Nothing waiting. Requests to join a course, for a session, or for more time appear
              here.
            </Empty>
          </div>
        )
      ) : (
        <div className="mt-6 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Asking to join
          </h2>
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
