import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Badge, Button, Card } from '../../components/ui';

/** Candidates asking to join this course, with approve/decline. */
export default function JoinRequests({ courseId, topicCount, onChanged, onError }) {
  const [requests, setRequests] = useState([]);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      const { requests } = await api(`/allot/courses/${courseId}/requests`);
      setRequests(requests);
    } catch (err) {
      onError(err.message);
    }
  }, [courseId, onError]);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(userId, approve) {
    setBusyId(userId);
    try {
      if (approve) {
        await api(`/allot/courses/${courseId}/requests/${userId}/approve`, {
          method: 'POST',
          body: { allotAllTopics: true },
        });
      } else {
        await api(`/allot/courses/${courseId}/requests/${userId}`, { method: 'DELETE' });
      }
      await Promise.all([load(), onChanged()]);
      // Keeps the navbar's inbox badge in step when deciding from the course page.
      window.dispatchEvent(new Event('inbox-changed'));
    } catch (err) {
      onError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  // Nothing pending is the normal state — don't take up space saying so.
  if (requests.length === 0) return null;

  return (
    <Card accent="amber" className="mb-4">
      <div className="flex items-center gap-2">
        <h3 className="font-semibold text-slate-900">Requests to join</h3>
        <Badge tone="amber">{requests.length}</Badge>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Approving gives access to all {topicCount} topic{topicCount === 1 ? '' : 's'} in this
        course. You can adjust it per topic afterwards.
      </p>

      <ul className="mt-3 space-y-2">
        {requests.map(({ user }) => (
          <li
            key={user.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2"
          >
            <span>
              <span className="block text-sm font-medium text-slate-900">{user.fullName}</span>
              <span className="text-xs text-slate-500">{user.email}</span>
            </span>
            <span className="flex gap-2">
              <Button onClick={() => decide(user.id, true)} disabled={busyId === user.id}>
                {busyId === user.id ? '…' : 'Approve'}
              </Button>
              <Button
                variant="danger"
                onClick={() => decide(user.id, false)}
                disabled={busyId === user.id}
              >
                Decline
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
