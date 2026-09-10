import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Alert, Badge, Button, Modal, Textarea } from '../../components/ui';

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

/**
 * Stopping a course.
 *
 * The button opens a dialog rather than acting, and the dialog is where the
 * cost is spelled out and the reason is taken. Two deliberate presses, with the
 * consequences in between — which is what stops "discontinue" being something
 * anybody does by accident on the way to pressing Continue.
 *
 * The reason is required because it is the half the organisation gets any use
 * from: a course people leave because they were moved onto a project is a
 * staffing problem, and one people leave because it is too hard is a course
 * problem. Those need telling apart afterwards.
 */
export default function DiscontinueCourse({ course, onChanged }) {
  const [requests, setRequests] = useState(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(
    () =>
      api('/discontinuations/mine')
        .then(({ discontinuations }) =>
          setRequests(discontinuations.filter((d) => d.course.id === course.id)),
        )
        .catch((err) => setError(err.message)),
    [course.id],
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
      await onChanged();
      return true;
    } catch (err) {
      setError(err.details?.length ? err.details.map((d) => d.message).join(' · ') : err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    const sent = await run(() =>
      api(`/discontinuations/courses/${course.id}`, { method: 'POST', body: { reason } }),
    );
    if (sent) {
      setReason('');
      setOpen(false);
    }
  }

  function close() {
    if (busy) return;
    setOpen(false);
    setReason('');
    setError(null);
  }

  if (!requests) return null;

  // Nothing to stop, and nothing to say about it.
  if (course.completedAt) return null;

  const pending = requests.find((r) => r.status === 'requested');
  const declined = requests.find((r) => r.status === 'declined');

  return (
    <div className="contents">
      {/* Errors from withdrawing show here; errors from the form show inside
          the dialog, where the person is actually looking. */}
      {!open && <Alert>{error}</Alert>}

      {pending ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone="amber">Stopping — awaiting approval</Badge>
            <span className="text-xs text-slate-500">asked {formatDate(pending.createdAt)}</span>
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => run(() => api(`/discontinuations/${pending.id}`, { method: 'DELETE' }))}
          >
            Never mind, carry on
          </Button>
        </div>
      ) : (
        <>
          {/* An icon, not a full-width danger button.
              Stopping a course is rare and irreversible-feeling, and a red bar
              across the bottom of every course card read as the main thing on
              offer. The dialog behind it still spells out the consequences, so
              nothing is lost by making the way in quiet — and the label stays
              on the tooltip and for screen readers, because an icon alone is
              not a name. */}
          <button
            type="button"
            onClick={() => setOpen(true)}
            title="Discontinue this course"
            aria-label="Discontinue this course"
            className="grid h-[26px] w-[26px] place-items-center rounded-lg border border-slate-200 text-slate-400 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
          >
            {/* A door with an arrow leaving it: the act is leaving the course,
                not deleting it. A bin would say the wrong thing. */}
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5"
              aria-hidden="true"
            >
              <path d="M12 3H5.5A1.5 1.5 0 0 0 4 4.5v11A1.5 1.5 0 0 0 5.5 17H12" />
              <path d="M14.5 7.5 17 10l-2.5 2.5" />
              <path d="M17 10H8.5" />
            </svg>
          </button>
          {declined && (
            <span className="text-xs text-slate-500">
              Last request was declined
              {declined.response ? ` — “${declined.response}”` : ''}
            </span>
          )}
        </>
      )}

      <Modal open={open} title={`Stop ${course.code}?`} onClose={close}>
        <form onSubmit={submit} className="space-y-4">
          <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-3">
            <p className="text-sm font-medium text-rose-900">{course.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-rose-800">
              An administrator has to approve this. If they do, the course leaves your list and
              your trainer stops expecting the work.
            </p>
            <p className="mt-1.5 text-sm text-rose-800">
              Quizzes you have already sat stay on your record.
            </p>
          </div>

          <Alert>{error}</Alert>

          <Textarea
            label="Why are you stopping?"
            rows={3}
            autoFocus
            maxLength={1000}
            placeholder="I have moved onto a different project and will not get back to this."
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">
            <Button type="button" variant="secondary" disabled={busy} onClick={close}>
              Cancel
            </Button>
            {/* Disabled until there is a reason worth reading — the request is
                useless to whoever answers it otherwise. */}
            <Button type="submit" variant="danger" disabled={busy || reason.trim().length < 10}>
              {busy ? 'Sending…' : 'Confirm'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
