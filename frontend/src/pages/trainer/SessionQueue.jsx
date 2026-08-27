import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { Badge, Button, Card, Input, Textarea } from '../../components/ui';

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

/** How many days ago, for the nudge on requests that have sat a while. */
const daysSince = (value) =>
  Math.floor((Date.now() - new Date(value).getTime()) / (1000 * 60 * 60 * 24));

/**
 * Candidates asking their lead for a one-to-one.
 *
 * Each request opens into a form rather than a pair of Approve/Decline buttons,
 * because the answer is not a yes or no — it is a time, or a reason. Answering
 * costs a sentence either way, which is why this sits at the top of the inbox
 * where it will not be skipped.
 */
export default function SessionQueue({ sessions, onChanged, onError }) {
  const [answering, setAnswering] = useState(null);

  if (sessions.length === 0) return null;

  return (
    <div className="mt-6 space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Asking for a session
      </h2>

      {sessions.map((session) => (
        <Card key={session.id} accent="violet">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <Link
                  to={`/trainer/courses/${session.course.id}`}
                  className="text-xs font-semibold tracking-wide text-indigo-600 hover:underline"
                >
                  {session.course.code}
                </Link>
                <span className="text-xs text-slate-500">{session.course.title}</span>
              </div>

              <p className="mt-1 font-semibold text-slate-900">{session.candidate.fullName}</p>
              <p className="text-xs text-slate-500">{session.candidate.email}</p>
            </div>

            <div className="shrink-0 text-right">
              {/* Only worth colouring once it has been sitting. A request from
                  this morning is not late; one from last week is. */}
              {daysSince(session.createdAt) >= 3 ? (
                <Badge tone="rose">Waiting {daysSince(session.createdAt)} days</Badge>
              ) : (
                <span className="text-xs text-slate-500">
                  asked {formatDate(session.createdAt)}
                </span>
              )}
            </div>
          </div>

          <p className="mt-3 whitespace-pre-line border-l-2 border-violet-200 pl-3 text-sm leading-relaxed text-slate-700">
            {session.reason}
          </p>

          {answering === session.id ? (
            <AnswerForm
              session={session}
              onDone={() => setAnswering(null)}
              onChanged={onChanged}
              onError={onError}
            />
          ) : (
            // One button, because both of these opened the same form — the
            // choice between scheduling and declining is made inside it, where
            // the time box and the reason box are.
            <div className="mt-3">
              <Button size="sm" onClick={() => setAnswering(session.id)}>
                Answer this
              </Button>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

/**
 * Giving it a time, or turning it down.
 *
 * Declining needs a reason and the API enforces it: "no" with no explanation
 * leaves a candidate worse off than a slow yes, because they still do not know
 * what to do instead.
 */
function AnswerForm({ session, onDone, onChanged, onError }) {
  const [when, setWhen] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(status) {
    setBusy(true);
    onError(null);
    try {
      await api(`/sessions/${session.id}`, {
        method: 'PATCH',
        body: {
          status,
          // datetime-local hands back a local wall-clock string; the Date the
          // API coerces it to carries this machine's offset, which is what both
          // ends should read it back in.
          scheduledAt: status === 'scheduled' && when ? new Date(when).toISOString() : null,
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

  return (
    <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-60">
          <Input
            label="Date and time"
            type="datetime-local"
            autoFocus
            value={when}
            onChange={(event) => setWhen(event.target.value)}
          />
        </div>
      </div>

      <Textarea
        label="Message"
        rows={2}
        maxLength={1000}
        placeholder="Meeting link, where to find you, or what to bring. If you are declining, say what to do instead."
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={busy || !when} onClick={() => submit('scheduled')}>
          {busy ? 'Saving…' : 'Confirm the time'}
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
        <p className="text-xs text-slate-500">They see this on their My progress page.</p>
      </div>
    </div>
  );
}
