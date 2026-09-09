import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Button, Textarea } from './ui';

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

/**
 * The lead's closing word on one candidate's course.
 *
 * Prose rather than a score, deliberately. A number would say somebody finished
 * at 62%, which the marks already say; what a manager reads six months later is
 * "strong on the practical work, needs another pass at hooks before a client
 * project", and no scale carries that.
 *
 * Written by the course's lead alone. Everyone else on the staff side — an
 * administrator included — reads it, which is why this renders as plain text
 * rather than an empty editor for them. An editor that can only ever 403 is
 * worse than no editor.
 *
 * The candidate never sees it, on any screen. It is an internal record for the
 * people who run the training, not a report card handed back.
 *
 * A first evaluation waits for them to finish — it is the closing word on a
 * course, and writing one halfway through is a verdict on work not yet done.
 * An existing one stays editable whatever happens to that flag afterwards.
 */
export default function FinalEvaluation({ courseId, candidate, canWrite, onError }) {
  const [draft, setDraft] = useState(candidate.evaluation ?? '');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  // Re-seeded when the row is refreshed underneath, so a save elsewhere does
  // not leave a stale draft sitting in the box.
  useEffect(() => {
    setDraft(candidate.evaluation ?? '');
  }, [candidate.evaluation]);

  const written = Boolean(candidate.evaluation);
  const finished = Boolean(candidate.completedAt);

  async function save(text) {
    setBusy(true);
    onError?.(null);
    try {
      await api(`/courses/${courseId}/candidates/${candidate.id}/evaluation`, {
        method: 'PUT',
        body: { evaluation: text },
      });
      setEditing(false);
    } catch (err) {
      onError?.(err.message);
    } finally {
      setBusy(false);
    }
  }

  // --- read-only: everyone who is not this course's lead -------------------
  if (!canWrite) {
    if (!written) return null;

    return (
      <section className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50/40 px-4 py-3">
        <Heading candidate={candidate} />
        <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
          {candidate.evaluation}
        </p>
      </section>
    );
  }

  // --- the lead's own view -------------------------------------------------
  if (editing) {
    return (
      <section className="mt-4 rounded-lg border border-indigo-200 bg-white px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Final evaluation
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          How they did, in your words. Administrators can read this; nobody else can change it.
        </p>

        <div className="mt-2">
          <Textarea
            rows={5}
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Strong on the practical work. Needs another pass at hooks before a client project."
          />
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={busy} onClick={() => save(draft)}>
            {busy ? 'Saving…' : 'Save evaluation'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => {
              setDraft(candidate.evaluation ?? '');
              setEditing(false);
            }}
          >
            Cancel
          </Button>

          {/* Clearing is the only way to withdraw one, so it is offered
              plainly rather than left to be discovered by emptying the box. */}
          {written && (
            <button
              disabled={busy}
              onClick={() => {
                if (window.confirm('Remove this evaluation? The text is not kept.')) save('');
              }}
              className="ml-auto text-xs text-rose-600 underline transition hover:text-rose-700 disabled:opacity-50"
            >
              Remove
            </button>
          )}
        </div>
      </section>
    );
  }

  if (!written) {
    // Said rather than hidden: a lead looking for the control should find out
    // why it is not there, not wonder whether the feature exists.
    if (!finished) {
      return (
        <p className="mt-4 text-xs text-slate-400">
          The final evaluation can be written once they finish the course.
        </p>
      );
    }

    return (
      <div className="mt-4">
        <button
          onClick={() => setEditing(true)}
          className="text-xs font-medium text-indigo-600 underline transition hover:text-indigo-700"
        >
          Write the final evaluation
        </button>
      </div>
    );
  }

  return (
    <section className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50/40 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Heading candidate={candidate} />
        <button
          onClick={() => setEditing(true)}
          className="text-xs font-medium text-indigo-600 underline transition hover:text-indigo-700"
        >
          Edit
        </button>
      </div>
      <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
        {candidate.evaluation}
      </p>
    </section>
  );
}

/** Who wrote it and when — a record with no author is hearsay. */
const Heading = ({ candidate }) => (
  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
    Final evaluation
    {candidate.evaluatedBy && (
      <span className="ml-2 font-normal normal-case tracking-normal text-slate-400">
        {candidate.evaluatedBy}
        {candidate.evaluatedAt && ` · ${formatDate(candidate.evaluatedAt)}`}
      </span>
    )}
  </p>
);
