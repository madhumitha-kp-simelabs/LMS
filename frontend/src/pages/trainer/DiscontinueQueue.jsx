import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { Badge, Button, Card, Textarea } from '../../components/ui';

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

/**
 * Candidates asking to stop a course, for an administrator to rule on.
 *
 * Not the course lead's decision, which is the point: a lead losing somebody
 * from their cohort has an interest in the answer. The lead sees the outcome —
 * the candidate drops out of their progress screens — but does not decide it.
 */
export default function DiscontinueQueue({ discontinuations, onChanged, onError }) {
  const [answering, setAnswering] = useState(null);

  if (discontinuations.length === 0) return null;

  return (
    <div className="mt-6 space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Asking to stop a course
      </h2>

      {discontinuations.map((request) => (
        <Card key={request.id} accent="rose">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <Link
                  to={`/trainer/courses/${request.course.id}`}
                  className="text-xs font-semibold tracking-wide text-indigo-600 hover:underline"
                >
                  {request.course.code} v{request.course.version}
                </Link>
                <span className="text-xs text-slate-500">{request.course.title}</span>
              </div>
              <p className="mt-1 font-semibold text-slate-900">{request.candidate.fullName}</p>
              <p className="text-xs text-slate-500">
                {request.candidate.email}
                {request.course.owner && ` · led by ${request.course.owner.fullName}`}
              </p>
            </div>

            <div className="shrink-0 text-right text-xs text-slate-500">
              <p>Asked {formatDate(request.createdAt)}</p>
              {/* Stopping something never started is a different conversation
                  from stopping four topics in. */}
              <p>
                {request.enrolment?.startedAt
                  ? `Started ${formatDate(request.enrolment.startedAt)}`
                  : 'Never started it'}
              </p>
            </div>
          </div>

          <p className="mt-3 whitespace-pre-line border-l-2 border-rose-200 pl-3 text-sm leading-relaxed text-slate-700">
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
      ))}
    </div>
  );
}

function AnswerForm({ request, onDone, onChanged, onError }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(status) {
    setBusy(true);
    onError(null);
    try {
      await api(`/discontinuations/${request.id}`, {
        method: 'PATCH',
        body: { status, response: note.trim() },
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
      <Textarea
        label="Message"
        rows={2}
        maxLength={1000}
        placeholder="Anything they should know. If you are turning it down, say what you expect instead."
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="danger" size="sm" disabled={busy} onClick={() => submit('approved')}>
          {busy ? 'Saving…' : 'Approve — they stop'}
        </Button>
        <Button
          variant="secondary"
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
          Approving takes the course off their list. Marks already earned stay on their record.
        </p>
      </div>
    </div>
  );
}
