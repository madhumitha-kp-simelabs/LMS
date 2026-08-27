import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, openProjectFile } from '../../lib/api';
import CourseNav from './CourseNav';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  Empty,
  Input,
  Textarea,
  formatBytes,
  toneForScore,
} from '../../components/ui';

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The three views of the list, and the counts that go beside them. */
const FILTERS = {
  awaiting: { label: 'Awaiting review', match: (row) => !row.evaluation.evaluatedAt },
  marked: { label: 'Marked', match: (row) => Boolean(row.evaluation.evaluatedAt) },
  all: { label: 'All', match: () => true },
};

/**
 * The work candidates have handed in on one course, and the lead's marks on it.
 *
 * A separate screen from Projects because the two answer different questions.
 * Projects asks "what has been set, and who holds it" — one row per project.
 * This asks "what is there to look at" — one row per piece of work, across the
 * whole course, oldest unmarked first, so nothing sits unnoticed at the bottom
 * of a project nobody has expanded.
 */
export default function CourseSubmissions() {
  const { courseId } = useParams();
  const [course, setCourse] = useState(null);
  const [submissions, setSubmissions] = useState(null);
  const [filter, setFilter] = useState('awaiting');
  const [error, setError] = useState(null);

  const load = useCallback(
    () =>
      Promise.all([api(`/projects/courses/${courseId}/submissions`), api(`/courses/${courseId}`)])
        .then(([{ submissions }, { course }]) => {
          setSubmissions(submissions);
          setCourse(course);
        })
        .catch((err) => setError(err.message)),
    [courseId],
  );

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const rows = submissions ?? [];
    return Object.fromEntries(
      Object.entries(FILTERS).map(([key, { match }]) => [key, rows.filter(match).length]),
    );
  }, [submissions]);

  if (!submissions && !error) return <p className="text-sm text-slate-500">Loading work…</p>;

  // Marking is the lead's, by the same split that makes writing the brief
  // theirs. An admin and the team read this page; only the lead changes it.
  const isLead = course?.viewer?.relation === 'lead';

  const shown = (submissions ?? []).filter(FILTERS[filter].match);

  return (
    <div className="max-w-4xl">
      <CourseNav courseId={courseId} work={course?.work} />

      <div className="mt-5 flex flex-wrap items-baseline gap-x-3">
        <span className="text-sm font-semibold tracking-wide text-indigo-600">{course?.code}</span>
        <h1 className="text-2xl font-semibold text-slate-900">Work handed in</h1>
        {submissions?.length > 0 && (
          <span className="text-sm text-slate-500">
            {plural(submissions.length, 'submission')}
            {counts.awaiting > 0 && (
              <span className="text-amber-700"> · {counts.awaiting} to review</span>
            )}
          </span>
        )}
      </div>

      <p className="mt-3 max-w-2xl text-sm text-slate-500">
        {isLead
          ? 'What candidates have produced for this course’s projects. Give a score, written feedback, or both — they see it on their own projects page.'
          : 'What candidates have produced for this course’s projects, and the lead’s marks on it.'}
      </p>

      <div className="mt-5 space-y-4">
        <Alert>{error}</Alert>

        {submissions?.length === 0 ? (
          <Empty>
            Nothing has been handed in yet. Work shows up here as candidates attach links and files
            to the projects they hold.
          </Empty>
        ) : (
          <>
            {/* A filter row rather than tabs: these are three views of one
                list, and the counts are half the information. */}
            <div className="flex flex-wrap gap-2">
              {Object.entries(FILTERS).map(([key, { label }]) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition ${
                    filter === key
                      ? 'bg-indigo-600 text-white ring-indigo-600'
                      : 'bg-white text-slate-600 ring-slate-200 hover:text-slate-900'
                  }`}
                >
                  {label} ({counts[key]})
                </button>
              ))}
            </div>

            {shown.length === 0 ? (
              <Empty>
                {filter === 'awaiting'
                  ? 'Nothing is waiting — every submission on this course has been marked.'
                  : 'Nothing marked yet.'}
              </Empty>
            ) : (
              shown.map((row) => (
                <SubmissionCard
                  key={`${row.projectId}:${row.candidate.id}`}
                  row={row}
                  isLead={isLead}
                  onChanged={load}
                  onError={setError}
                />
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** One candidate's work on one project, with whatever mark it carries. */
function SubmissionCard({ row, isLead, onChanged, onError }) {
  const [marking, setMarking] = useState(false);
  const { submission, evaluation, candidate, project } = row;
  const marked = Boolean(evaluation.evaluatedAt);

  return (
    <Card flush accent={marked ? 'emerald' : 'amber'}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-5 py-4">
        <div className="flex min-w-0 gap-3">
          <Avatar name={candidate.fullName} tone={marked ? 'slate' : 'indigo'} />
          <div className="min-w-0">
            <p className="font-semibold text-slate-900">{candidate.fullName}</p>
            <p className="truncate text-xs text-slate-500">{candidate.email}</p>
            <p className="mt-1 text-sm text-slate-700">
              <span className="text-slate-400">#{project.position}</span> {project.title}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {row.late && <Badge tone="rose">Late</Badge>}
          {row.completedAt && <Badge tone="green">They marked it done</Badge>}
          {marked ? (
            evaluation.score != null ? (
              <Badge tone={toneForScore(evaluation.score)}>{evaluation.score}/100</Badge>
            ) : (
              <Badge tone="green">Reviewed</Badge>
            )
          ) : (
            <Badge tone="amber">Awaiting review</Badge>
          )}
        </div>
      </div>

      <div className="border-t border-slate-100 px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Handed in {formatDate(submission.submittedAt)}
        </p>

        <div className="mt-2 space-y-1.5 text-sm">
          {submission.url && (
            <p className="truncate">
              <a
                href={submission.url}
                target="_blank"
                rel="noreferrer noopener"
                className="text-indigo-600 underline hover:text-indigo-700"
              >
                {submission.url}
              </a>
            </p>
          )}

          {submission.filename && (
            <p className="flex flex-wrap items-center gap-2">
              <button
                onClick={() =>
                  openProjectFile(row.projectId, candidate.id).catch((err) => onError(err.message))
                }
                className="text-indigo-600 underline hover:text-indigo-700"
              >
                {submission.filename}
              </button>
              <span className="text-xs text-slate-500">
                {formatBytes(Number(submission.fileSizeBytes))}
              </span>
            </p>
          )}

          {submission.note && <p className="leading-relaxed text-slate-600">{submission.note}</p>}
        </div>
      </div>

      <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-4">
        {marking ? (
          <EvaluationForm
            row={row}
            onDone={() => setMarking(false)}
            onChanged={onChanged}
            onError={onError}
          />
        ) : (
          <Evaluation
            row={row}
            isLead={isLead}
            onEdit={() => setMarking(true)}
            onChanged={onChanged}
            onError={onError}
          />
        )}
      </div>
    </Card>
  );
}

/** The standing mark, read-only, with the lead's way in to changing it. */
function Evaluation({ row, isLead, onEdit, onChanged, onError }) {
  const [busy, setBusy] = useState(false);
  const { evaluation } = row;
  const marked = Boolean(evaluation.evaluatedAt);

  async function clear() {
    setBusy(true);
    try {
      await api(`/projects/${row.projectId}/work/${row.candidate.id}/evaluation`, {
        method: 'DELETE',
      });
      await onChanged();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Evaluation</p>

        {isLead && (
          <span className="flex gap-3">
            <button
              disabled={busy}
              onClick={onEdit}
              className="text-xs text-indigo-600 underline hover:text-indigo-700 disabled:opacity-50"
            >
              {marked ? 'Change mark' : 'Evaluate'}
            </button>
            {marked && (
              <button
                disabled={busy}
                onClick={clear}
                className="text-xs text-rose-600 underline hover:text-rose-700 disabled:opacity-50"
              >
                Clear
              </button>
            )}
          </span>
        )}
      </div>

      {!marked ? (
        <p className="mt-1 text-sm text-slate-500">
          {isLead
            ? 'Not reviewed yet. Give a score out of 100, feedback, or both.'
            : 'Not reviewed yet — the course lead marks this work.'}
        </p>
      ) : (
        <div className="mt-2 space-y-1.5">
          {evaluation.feedback && (
            <p className="text-sm leading-relaxed text-slate-700">{evaluation.feedback}</p>
          )}
          <p className="text-xs text-slate-500">
            {evaluation.evaluatedBy?.fullName ?? 'The course lead'} ·{' '}
            {formatDate(evaluation.evaluatedAt)}
          </p>
        </div>
      )}
    </div>
  );
}

/** Score and feedback. Either alone counts as a mark; both empty does not. */
function EvaluationForm({ row, onDone, onChanged, onError }) {
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    score: row.evaluation.score == null ? '' : String(row.evaluation.score),
    feedback: row.evaluation.feedback ?? '',
  });

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await api(`/projects/${row.projectId}/work/${row.candidate.id}/evaluation`, {
        method: 'PUT',
        // An empty box is no score, not a zero — the two mean opposite things.
        body: { score: form.score === '' ? null : form.score, feedback: form.feedback.trim() },
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
    <form onSubmit={submit} className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Evaluation</p>

      <div className="w-32">
        <Input
          label="Score out of 100"
          type="number"
          min={0}
          max={100}
          autoFocus
          placeholder="—"
          value={form.score}
          onChange={(event) => setForm({ ...form, score: event.target.value })}
        />
      </div>

      <Textarea
        label="Feedback for the candidate"
        rows={4}
        placeholder="What worked, and what to do differently next time."
        value={form.feedback}
        onChange={(event) => setForm({ ...form, feedback: event.target.value })}
      />

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? 'Saving…' : 'Save evaluation'}
        </Button>
        <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
