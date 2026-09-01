import { Link } from 'react-router-dom';
import { Badge, Button, Card } from '../../components/ui';
import PauseCandidate from '../../components/PauseCandidate';

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Candidates who have run past their deadline.
 *
 * Not a decision queue like the rest of the inbox — nobody is waiting on the
 * lead to answer. It is here because this is where a lead looks to find out
 * what needs them, and somebody three weeks over their date needs them more
 * than most of what is below it.
 *
 * Each row carries the two things that actually resolve it: pause the clock if
 * they have been pulled onto something, or open their progress to see whether
 * they are stuck rather than absent. Telling somebody they are late without
 * offering either would be a notification for its own sake.
 */
export default function OverdueQueue({ overdue, onChanged, onError }) {
  if (overdue.length === 0) return null;

  return (
    <div className="mt-6 space-y-4">
      <h2 className="flex flex-wrap items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Running late
        <Badge tone="rose">{overdue.length}</Badge>
      </h2>

      {overdue.map((row) => (
        <Card key={row.id} accent="rose">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <Link
                  to={`/trainer/courses/${row.course.id}/progress`}
                  className="text-xs font-semibold tracking-wide text-indigo-600 hover:underline"
                >
                  {row.course.code} v{row.course.version}
                </Link>
                <span className="text-xs text-slate-500">{row.course.title}</span>
              </div>
              <p className="mt-1 font-semibold text-slate-900">{row.candidate.fullName}</p>
              <p className="text-xs text-slate-500">{row.candidate.email}</p>
            </div>

            <div className="shrink-0 text-right">
              <Badge tone="rose">{plural(row.daysOver, 'day')} over</Badge>
              <p className="mt-1 text-xs text-slate-500">Was due {formatDate(row.dueAt)}</p>
              {/* Says they have already been given time, so a lead deciding
                  whether to give more knows what has gone before. */}
              {row.pausedDays > 0 && (
                <p className="text-xs text-slate-400">
                  {plural(row.pausedDays, 'day')} already paused
                </p>
              )}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
            {row.mine ? (
              <PauseCandidate
                courseId={row.course.id}
                candidate={{
                  id: row.candidate.id,
                  dueAt: row.dueAt,
                  pausedAt: null,
                  pausedDays: row.pausedDays,
                }}
                onChanged={onChanged}
                onError={onError}
              />
            ) : (
              // On a course somebody else leads, this is information, not a job.
              <span className="text-xs text-slate-500">Their lead can pause or extend it.</span>
            )}

            <Link to={`/trainer/courses/${row.course.id}/progress`}>
              <Button variant="secondary" size="sm">
                See where they are
              </Button>
            </Link>
          </div>
        </Card>
      ))}
    </div>
  );
}
