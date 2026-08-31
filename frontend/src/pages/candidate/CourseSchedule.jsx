import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Alert, Badge, Button, Card, Input, Textarea } from '../../components/ui';

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const asDateInput = (value) => (value ? new Date(value).toISOString().slice(0, 10) : '');

/** The day after a date, as the earliest an extension could sensibly ask for. */
const dayAfter = (value) =>
  asDateInput(new Date(new Date(value).getTime() + 86400000));

/** Whole days from now until then; negative once it is behind you. */
const daysUntil = (value) =>
  Math.ceil((new Date(value).getTime() - Date.now()) / 86400000);

/**
 * A candidate's own schedule on one course: when it is due, pausing it, and
 * asking for longer.
 *
 * The deadline is theirs rather than the course's — two people who started a
 * five-week course a fortnight apart are due a fortnight apart — which is why
 * everything here reads off their enrolment and not off the course.
 *
 * `compact` drops the card and the heading for the version that sits beside the
 * course in the sidebar. Same component either way, because the rules about
 * when you may pause, extend, or neither are fiddly enough that having them
 * written twice would guarantee the two disagreeing.
 */
export default function CourseSchedule({ course, onChanged, compact = false }) {
  const [extensions, setExtensions] = useState([]);
  const [asking, setAsking] = useState(false);
  // Seeded a week past the current deadline: a starting point to adjust beats
  // an empty box, and a week is the commonest ask.
  const [form, setForm] = useState({ until: '', reason: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(
    () =>
      api('/extensions/mine')
        .then(({ extensions }) => setExtensions(extensions.filter((e) => e.course.id === course.id)))
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

  async function ask(event) {
    event.preventDefault();
    const sent = await run(() =>
      api(`/extensions/courses/${course.id}`, {
        method: 'POST',
        body: { requestedUntil: form.until, reason: form.reason },
      }),
    );
    if (sent) {
      setForm({ until: '', reason: '' });
      setAsking(false);
    }
  }

  // No deadline is a legitimate state — a course with no duration set — and
  // there is nothing here to show for it.
  if (!course.dueAt) return null;

  const open = extensions.find((e) => e.status === 'requested');
  const paused = Boolean(course.pausedAt);
  const finished = Boolean(course.completedAt);
  const left = daysUntil(course.dueAt);

  const standing = finished
    ? { tone: 'green', text: `Finished ${formatDate(course.completedAt)}` }
    : paused
      ? { tone: 'slate', text: `Paused since ${formatDate(course.pausedAt)}` }
      : left < 0
        ? { tone: 'rose', text: `${plural(-left, 'day')} overdue` }
        : left <= 7
          ? { tone: 'amber', text: left === 0 ? 'Due today' : `${plural(left, 'day')} left` }
          : { tone: 'indigo', text: `${plural(left, 'day')} left` };

  const Shell = compact ? 'div' : Card;
  const shellProps = compact
    ? { className: 'mt-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5' }
    : { accent: standing.tone === 'rose' ? 'rose' : 'sky', className: 'mt-4' };

  return (
    <Shell {...shellProps}>
      <div
        className={
          compact
            ? 'space-y-2'
            : 'flex flex-wrap items-start justify-between gap-x-4 gap-y-2'
        }
      >
        <div>
          {!compact && <h3 className="text-lg font-semibold text-slate-900">Your schedule</h3>}
          <p
            className={`flex flex-wrap items-center gap-2 ${
              compact ? 'text-xs text-slate-500' : 'mt-1 text-sm text-slate-500'
            }`}
          >
            <span>Due {formatDate(course.dueAt)}</span>
            <Badge tone={standing.tone}>{standing.text}</Badge>
          </p>
          {course.pausedDays > 0 && (
            <p className="mt-1 text-xs text-slate-500">
              {plural(course.pausedDays, 'day')} paused so far, already added to your deadline.
            </p>
          )}
        </div>

        {!finished && (
          <div className="flex flex-wrap gap-2">
            {paused ? (
              <Button
                size="sm"
                disabled={busy}
                onClick={() => run(() => api(`/learn/courses/${course.id}/resume`, { method: 'POST' }))}
              >
                {busy ? 'Resuming…' : 'Resume course'}
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => run(() => api(`/learn/courses/${course.id}/pause`, { method: 'POST' }))}
                title="Pulled onto something urgent? Your deadline moves by the days you lose."
              >
                Pause
              </Button>
            )}

            {!open && !asking && !paused && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setForm({
                    until: asDateInput(new Date(new Date(course.dueAt).getTime() + 7 * 86400000)),
                    reason: '',
                  });
                  setAsking(true);
                }}
              >
                Ask for more time
              </Button>
            )}
          </div>
        )}
      </div>

      <div className={compact ? 'mt-2 space-y-2' : 'mt-3 space-y-3'}>
        <Alert>{error}</Alert>

        {paused && (
          <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            Your deadline is on hold. Every day paused is added back when you resume, so this costs
            you nothing — but the course does not move while you are away.
          </p>
        )}

        {open && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <Badge tone="amber">Waiting</Badge>
                <span className="text-sm text-slate-700">
                  asked until {formatDate(open.requestedUntil)} on {formatDate(open.createdAt)}
                </span>
              </span>
              <button
                disabled={busy}
                onClick={() => run(() => api(`/extensions/${open.id}`, { method: 'DELETE' }))}
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
            <div className="w-52">
              <Input
                label="I need until"
                type="date"
                autoFocus
                // Anything on or before the current deadline would shorten the
                // course, not extend it; the server refuses it either way.
                min={dayAfter(course.dueAt)}
                value={form.until}
                onChange={(event) => setForm({ ...form, until: event.target.value })}
              />
            </div>

            <Textarea
              label="Why do you need the time?"
              rows={2}
              maxLength={1000}
              placeholder="I have been pulled onto a release for the next fortnight."
              value={form.reason}
              onChange={(event) => setForm({ ...form, reason: event.target.value })}
            />

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="submit"
                size="sm"
                disabled={busy || !form.until || form.reason.trim().length < 10}
              >
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
              <p className="text-xs text-slate-500">Your course lead decides.</p>
            </div>
          </form>
        )}

        {/* Answered requests, so an approval is visible as more than a moved date. */}
        {extensions.filter((e) => e.status !== 'requested').length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-700">
              Earlier requests ({extensions.filter((e) => e.status !== 'requested').length})
            </summary>
            <ul className="mt-2 space-y-2">
              {extensions
                .filter((e) => e.status !== 'requested')
                .map((extension) => (
                  <li key={extension.id} className="rounded-lg border border-slate-200 px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {extension.status === 'approved' ? (
                        <Badge tone="green">
                          Until {formatDate(extension.grantedUntil)}
                        </Badge>
                      ) : (
                        <Badge tone="rose">Declined</Badge>
                      )}
                      {/* Said only when the lead gave a different date from the
                          one asked for — otherwise it is noise. */}
                      {extension.status === 'approved' &&
                        extension.grantedUntil !== extension.requestedUntil && (
                          <span className="text-xs text-slate-500">
                            asked until {formatDate(extension.requestedUntil)}
                          </span>
                        )}
                      <span className="text-xs text-slate-500">
                        {formatDate(extension.decidedAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">“{extension.reason}”</p>
                    {extension.response && (
                      <p className="mt-1 whitespace-pre-line text-sm text-slate-700">
                        {extension.decidedBy?.fullName ?? 'Lead'}: {extension.response}
                      </p>
                    )}
                  </li>
                ))}
            </ul>
          </details>
        )}
      </div>
    </Shell>
  );
}
