import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { Badge, Card, toneForScore } from '../../components/ui';

const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : null;

/**
 * Who has finished this course, and when.
 *
 * A course is complete for a candidate once every quiz on their allotted
 * topics has been attempted — coverage, not a pass mark.
 */
/** Whole weeks between a date and now. */
const weeksSince = (date) => Math.floor((Date.now() - new Date(date)) / (7 * 24 * 60 * 60 * 1000));

export default function CompletionSummary({ courseId, durationWeeks, onError, progress, showLink = true }) {
  const [fetched, setFetched] = useState(null);

  // The progress page has already loaded this; asking again would be a second
  // round trip for the same rows.
  useEffect(() => {
    if (progress) return;
    api(`/courses/${courseId}/progress`)
      .then(setFetched)
      .catch((err) => onError(err.message));
  }, [courseId, onError, progress]);

  const data = progress ?? fetched;

  if (!data || data.candidates.length === 0) return null;

  const { candidates, summary } = data;

  const completed = candidates
    .filter((c) => c.completedAt)
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));

  const inProgress = candidates.filter((c) => c.startedAt && !c.completedAt);
  const notStarted = candidates.filter((c) => !c.startedAt);

  const pct = Math.round((summary.completed / summary.candidates) * 100);

  return (
    <Card accent="emerald">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Course completion</h3>
          <p className="mt-1 text-sm text-slate-500">
            {summary.completed} of {summary.candidates} candidate
            {summary.candidates === 1 ? '' : 's'} have finished every quiz allotted to them.
          </p>
        </div>
        {showLink && (
          <Link
            to={`/trainer/courses/${courseId}/progress`}
            className="text-sm text-indigo-600 hover:text-indigo-700"
          >
            Full progress →
          </Link>
        )}
      </div>

      <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-emerald-500 transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs">
        <span className="text-emerald-700">{completed.length} completed</span>
        <span className="text-indigo-700">{inProgress.length} in progress</span>
        <span className="text-slate-500">{notStarted.length} not started</span>
        {summary.averageScore !== null && (
          <span className="text-slate-500">Average {summary.averageScore}%</span>
        )}
      </div>

      <ul className="mt-5 space-y-2">
        {completed.map((candidate) => (
          <li
            key={candidate.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50/40 px-4 py-3"
          >
            <span className="min-w-0">
              <span className="block text-sm font-medium text-slate-900">{candidate.fullName}</span>
              <span className="text-xs text-slate-500">
                Started {formatDate(candidate.startedAt) ?? '—'} · Completed{' '}
                {formatDate(candidate.completedAt)}
              </span>
            </span>
            {candidate.overallPercentage !== null && (
              <Badge tone={toneForScore(candidate.overallPercentage)}>
                {candidate.overallPercentage}%
              </Badge>
            )}
          </li>
        ))}

        {inProgress.map((candidate) => {
          const elapsed = weeksSince(candidate.startedAt);
          const overdue = durationWeeks != null && elapsed > durationWeeks;

          return (
            <li
              key={candidate.id}
              className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 ${
                overdue ? 'border-amber-300 bg-amber-50/50' : 'border-slate-200'
              }`}
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium text-slate-900">
                  {candidate.fullName}
                </span>
                <span className="text-xs text-slate-500">
                  Started {formatDate(candidate.startedAt)} · {candidate.quizzesDone}/
                  {candidate.quizzesAvailable} quizzes done
                  {durationWeeks != null &&
                    ` · week ${elapsed + 1} of ${durationWeeks}`}
                </span>
              </span>
              <Badge tone={overdue ? 'amber' : 'indigo'}>
                {overdue ? `${elapsed - durationWeeks}w over` : 'In progress'}
              </Badge>
            </li>
          );
        })}

        {notStarted.map((candidate) => (
          <li
            key={candidate.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 px-4 py-3"
          >
            <span className="min-w-0">
              <span className="block text-sm font-medium text-slate-900">{candidate.fullName}</span>
              <span className="text-xs text-slate-500">
                Enrolled {formatDate(candidate.enrolledAt)} · hasn&apos;t opened the course
              </span>
            </span>
            <Badge tone="slate">Not started</Badge>
          </li>
        ))}
      </ul>
    </Card>
  );
}
