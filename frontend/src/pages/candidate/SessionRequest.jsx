import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Alert, Badge, Button, Card, Textarea } from '../../components/ui';

const formatWhen = (value) =>
  value
    ? new Date(value).toLocaleString(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

/**
 * Asking the course's lead for a one-to-one.
 *
 * Sits above feedback on purpose: feedback is what you say once a course is
 * behind you, this is what you do while you are still stuck in it. Somebody
 * scrolling to complain is often somebody who would rather have been helped.
 *
 * The reason is required and has a floor of ten characters, because "help" in
 * an inbox tells a lead nothing they can prepare against — the whole value of
 * the request is that they arrive knowing what it is about.
 */
export default function SessionRequest({ courseId, courseTitle }) {
  const [sessions, setSessions] = useState(null);
  const [reason, setReason] = useState('');
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(
    () =>
      api('/sessions/mine')
        .then(({ sessions }) => setSessions(sessions.filter((s) => s.course.id === courseId)))
        .catch((err) => setError(err.message)),
    [courseId],
  );

  useEffect(() => {
    load();
  }, [load]);

  async function run(request) {
    setBusy(true);
    setError(null);
    try {
      await request();
      await load();
      return true;
    } catch (err) {
      setError(err.details?.length ? err.details.map((d) => d.message).join(' · ') : err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function ask(event) {
    event.preventDefault();
    const sent = await run(() =>
      api(`/sessions/courses/${courseId}`, { method: 'POST', body: { reason } }),
    );
    if (sent) {
      setReason('');
      setAsking(false);
    }
  }

  if (!sessions) return null;

  const open = sessions.find((s) => s.status === 'requested');
  // Only sessions still to come are worth a banner; past ones are history and
  // live in the list below with everything else.
  const upcoming = sessions.find(
    (s) => s.status === 'scheduled' && new Date(s.scheduledAt) >= new Date(),
  );
  const past = sessions.filter((s) => s !== open && s !== upcoming);

  return (
    <Card accent="violet" className="mt-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">One-to-one session</h3>
          <p className="mt-1 text-sm text-slate-500">
            Stuck on something in {courseTitle}? Ask its lead for time and they will send you a
            slot.
          </p>
        </div>

        {!open && !asking && (
          <Button size="sm" onClick={() => setAsking(true)}>
            Request a session
          </Button>
        )}
      </div>

      <div className="mt-4 space-y-3">
        <Alert>{error}</Alert>

        {upcoming && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="green">Booked</Badge>
              <span className="text-sm font-semibold text-emerald-900">
                {formatWhen(upcoming.scheduledAt)}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-600">
              with {upcoming.decidedBy?.fullName ?? 'your course lead'}
            </p>
            {upcoming.response && (
              <p className="mt-1.5 whitespace-pre-line text-sm text-slate-700">
                {upcoming.response}
              </p>
            )}
          </div>
        )}

        {open && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <Badge tone="amber">Waiting</Badge>
                <span className="text-xs text-slate-600">
                  asked {formatDate(open.createdAt)}
                </span>
              </span>
              <button
                disabled={busy}
                onClick={() => run(() => api(`/sessions/${open.id}`, { method: 'DELETE' }))}
                className="text-xs text-rose-600 underline hover:text-rose-700 disabled:opacity-50"
              >
                Withdraw
              </button>
            </div>
            <p className="mt-1.5 whitespace-pre-line text-sm text-slate-700">“{open.reason}”</p>
          </div>
        )}

        {asking && (
          <form onSubmit={ask} className="space-y-3">
            <Textarea
              label="What would you like to go over?"
              rows={3}
              autoFocus
              maxLength={1000}
              placeholder="I keep getting the risk register questions wrong and I am not sure what I am missing."
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" size="sm" disabled={busy || reason.trim().length < 10}>
                {busy ? 'Sending…' : 'Send request'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => setAsking(false)}
              >
                Cancel
              </Button>
              <p className="text-xs text-slate-500">
                A sentence is plenty — it just helps them prepare.
              </p>
            </div>
          </form>
        )}

        {!open && !upcoming && !asking && sessions.length === 0 && (
          <p className="text-sm text-slate-500">
            You have not asked for a session on this course.
          </p>
        )}

        {past.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-700">
              Earlier requests ({past.length})
            </summary>
            <ul className="mt-2 space-y-2">
              {past.map((session) => (
                <li key={session.id} className="rounded-lg border border-slate-200 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {session.status === 'declined' ? (
                      <Badge tone="rose">Declined</Badge>
                    ) : (
                      <Badge tone="slate">{formatWhen(session.scheduledAt)}</Badge>
                    )}
                    <span className="text-xs text-slate-500">
                      asked {formatDate(session.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">“{session.reason}”</p>
                  {session.response && (
                    <p className="mt-1 whitespace-pre-line text-sm text-slate-700">
                      {session.decidedBy?.fullName ?? 'Lead'}: {session.response}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </Card>
  );
}
