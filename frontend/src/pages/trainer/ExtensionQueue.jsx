import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { Badge, Button, Card, Input, Textarea } from '../../components/ui';

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const daysUntil = (value) => Math.ceil((new Date(value).getTime() - Date.now()) / 86400000);

const asDateInput = (value) => (value ? new Date(value).toISOString().slice(0, 10) : '');

/**
 * Candidates asking for more time.
 *
 * The lead needs three things to answer: the date they want, why, and what
 * their deadline is now — so the card carries all three rather than sending
 * anybody to another screen to look the last one up.
 */
export default function ExtensionQueue({ extensions, onChanged, onError }) {
  const [answering, setAnswering] = useState(null);

  if (extensions.length === 0) return null;

  return (
    <div className="mt-6 space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Asking for more time
      </h2>

      {extensions.map((request) => {
        const due = request.enrolment?.dueAt;
        const left = due ? daysUntil(due) : null;

        return (
          <Card key={request.id} accent="sky">
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <Link
                    to={`/trainer/courses/${request.course.id}`}
                    className="text-xs font-semibold tracking-wide text-indigo-600 hover:underline"
                  >
                    {request.course.code}
                  </Link>
                  <span className="text-xs text-slate-500">{request.course.title}</span>
                </div>
                <p className="mt-1 font-semibold text-slate-900">{request.candidate.fullName}</p>
                <p className="text-xs text-slate-500">{request.candidate.email}</p>
              </div>

              <div className="shrink-0 text-right">
                <Badge tone="sky">Until {formatDate(request.requestedUntil)}</Badge>
                {due && (
                  <p className="mt-1 text-xs text-slate-500">
                    Due {formatDate(due)}
                    {/* Already late is a different answer from nearly late. */}
                    <span className={left < 0 ? 'font-medium text-rose-700' : ''}>
                      {left < 0 ? ` · ${plural(-left, 'day')} overdue` : ` · ${plural(left, 'day')} left`}
                    </span>
                  </p>
                )}
                {request.enrolment?.pausedDays > 0 && (
                  <p className="text-xs text-slate-400">
                    {plural(request.enrolment.pausedDays, 'day')} already paused
                  </p>
                )}
              </div>
            </div>

            <p className="mt-3 whitespace-pre-line border-l-2 border-sky-200 pl-3 text-sm leading-relaxed text-slate-700">
              {request.reason}
            </p>

            {answering === request.id ? (
              <AnswerForm
                request={request}
                onDone={() => setAnswering(null)}
                onChanged={onChanged}
                onError={onError}
              />
            ) : (
              <div className="mt-3">
                <Button size="sm" onClick={() => setAnswering(request.id)}>
                  Answer this
                </Button>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

/**
 * Granting the date, or refusing it.
 *
 * The date box is pre-filled with the one asked for, because agreeing is the
 * common case; a lead who wants to give less adjusts it rather than working out
 * a date from scratch.
 */
function AnswerForm({ request, onDone, onChanged, onError }) {
  // Pre-filled with the date asked for: agreeing is the common case, and a lead
  // who wants to give less should change a date rather than find one.
  const [until, setUntil] = useState(asDateInput(request.requestedUntil));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(status) {
    setBusy(true);
    onError(null);
    try {
      await api(`/extensions/${request.id}`, {
        method: 'PATCH',
        body: {
          status,
          grantedUntil: status === 'approved' ? until : null,
          response: note.trim(),
        },
      });
      await onChanged();
      onDone();
    } catch (err) {
      onError(err.details?.length ? err.details.map((d) => d.message).join(' · ') : err.message);
    } finally {
      setBusy(false);
    }
  }

  // Giving an earlier date than asked for is a real answer, but one worth
  // explaining — so say so rather than letting it pass silently.
  const shorter = until && new Date(until) < new Date(request.requestedUntil);

  return (
    <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-52">
          <Input
            label="Give them until"
            type="date"
            autoFocus
            // Never earlier than the deadline they already have; that would be
            // shortening the course under the name of an extension.
            min={request.enrolment?.dueAt ? asDateInput(request.enrolment.dueAt) : undefined}
            value={until}
            onChange={(event) => setUntil(event.target.value)}
          />
        </div>
        {shorter && (
          <p className="pb-2 text-xs text-amber-700">
            Earlier than the {formatDate(request.requestedUntil)} asked for — worth saying why below.
          </p>
        )}
      </div>

      <Textarea
        label="Message"
        rows={2}
        maxLength={1000}
        placeholder="Anything they should know. If you are declining, say what to do instead."
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={busy || !until} onClick={() => submit('approved')}>
          {busy ? 'Saving…' : `Grant until ${until ? formatDate(until) : '…'}`}
        </Button>
        <Button
          variant="danger"
          size="sm"
          disabled={busy || !note.trim()}
          onClick={() => submit('declined')}
          title={note.trim() ? undefined : 'Say why first'}
        >
          Decline
        </Button>
        <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={onDone}>
          Cancel
        </Button>
        <p className="text-xs text-slate-500">
          Their deadline becomes this date exactly, whenever you answer.
        </p>
      </div>
    </div>
  );
}
