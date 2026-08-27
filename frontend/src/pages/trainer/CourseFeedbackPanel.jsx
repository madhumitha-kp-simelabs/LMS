import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Badge, Card } from '../../components/ui';

const LABELS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

const formatDate = (value) =>
  new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

const Stars = ({ n }) => (
  <span className="text-amber-400" aria-label={`${n} out of 5`}>
    {'★'.repeat(n)}
    <span className="text-slate-300">{'★'.repeat(5 - n)}</span>
  </span>
);

/** What candidates think of this course — average, spread, and the comments. */
export default function CourseFeedbackPanel({ courseId, onError }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    api(`/courses/${courseId}/feedback`)
      .then(setData)
      .catch((err) => onError(err.message));
  }, [courseId, onError]);

  if (!data) return null;

  const { feedback, summary } = data;

  // No feedback yet is the normal early state — say nothing rather than take a
  // whole card to report emptiness, the same way the join-requests panel does.
  if (summary.count === 0) return null;

  const maxInBand = Math.max(...summary.distribution);

  return (
    <Card accent="amber">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900">Candidate feedback</h3>
          <p className="mt-1 text-sm text-slate-500">
            From {summary.count} candidate{summary.count === 1 ? '' : 's'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold text-slate-900">{summary.average}</p>
          <Stars n={Math.round(summary.average)} />
        </div>
      </div>

      {/* What the overall is made of. A course at 3.5 because the material is
          weak needs a different fix from one at 3.5 because it runs too long,
          and the single number cannot say which. */}
      {(summary.content || summary.duration) && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Dimension label="Content" stat={summary.content} />
          <Dimension label="Duration" stat={summary.duration} />
        </div>
      )}

      {/* Distribution, highest star first — shows whether an average hides a split. */}
      <div className="mt-4 space-y-1">
        {[5, 4, 3, 2, 1].map((star) => {
          const n = summary.distribution[star - 1];
          return (
            <div key={star} className="flex items-center gap-2 text-xs">
              <span className="w-3 text-right text-slate-500">{star}</span>
              <span className="text-amber-400" aria-hidden>
                ★
              </span>
              <span className="h-2 flex-1 overflow-hidden rounded-sm bg-slate-100">
                <span
                  className="block h-full rounded-sm bg-amber-400"
                  style={{ width: maxInBand === 0 ? 0 : `${(n / maxInBand) * 100}%` }}
                />
              </span>
              <span className="w-4 text-slate-500">{n}</span>
            </div>
          );
        })}
      </div>

      <ul className="mt-4 space-y-2">
        {feedback.map((entry) => (
          <li key={entry.id} className="rounded-lg border border-slate-200 px-3 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium text-slate-900">{entry.user.fullName}</span>
              <span className="flex items-center gap-2 text-xs text-slate-500">
                <Badge tone={entry.rating >= 4 ? 'green' : entry.rating >= 3 ? 'amber' : 'rose'}>
                  {LABELS[entry.rating]}
                </Badge>
                {formatDate(entry.updatedAt)}
              </span>
            </div>
            <div className="mt-1 text-sm">
              <Stars n={entry.rating} />
            </div>
            {entry.comment && (
              <p className="mt-1.5 whitespace-pre-line text-sm text-slate-700">{entry.comment}</p>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/**
 * One dimension's average. Absent rather than zero when nobody has rated it —
 * "no ratings yet" and "rated badly" must not look the same.
 */
function Dimension({ label, stat }) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      {stat ? (
        <p className="mt-1 flex items-baseline gap-2">
          <span className="text-lg font-semibold text-slate-900">{stat.average}</span>
          <Stars n={Math.round(stat.average)} />
          <span className="text-xs text-slate-500">
            from {stat.count} {stat.count === 1 ? 'person' : 'people'}
          </span>
        </p>
      ) : (
        <p className="mt-1 text-sm text-slate-400">Not rated yet</p>
      )}
    </div>
  );
}
