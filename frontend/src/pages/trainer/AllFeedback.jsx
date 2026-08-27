import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { Alert, Badge, Button, Card, Empty, Input, Select } from '../../components/ui';

const LABELS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const toneFor = (rating) => (rating >= 4 ? 'green' : rating >= 3 ? 'amber' : 'rose');

const Stars = ({ n }) => (
  <span className="text-amber-400" aria-label={`${n} out of 5`}>
    {'★'.repeat(n)}
    <span className="text-slate-300">{'★'.repeat(5 - n)}</span>
  </span>
);

/**
 * What candidates have said, across every course you work on.
 *
 * The per-course panel answers "how is this course going", and only once you
 * are already inside the course — and it hides itself entirely when nothing has
 * been said, so a lead could work here for weeks without learning the feature
 * existed. This page asks the question the other way round: what are people
 * telling us, and which courses have told us nothing.
 */
export default function AllFeedback() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [courseId, setCourseId] = useState('');
  const [band, setBand] = useState('');

  useEffect(() => {
    api('/feedback')
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return (data?.feedback ?? []).filter((entry) => {
      if (courseId && entry.course.id !== courseId) return false;
      if (band === 'praise' && entry.rating < 4) return false;
      if (band === 'concern' && entry.rating > 2) return false;
      if (band === 'commented' && !entry.comment) return false;
      if (!needle) return true;

      return `${entry.comment ?? ''} ${entry.candidate.fullName} ${entry.course.code} ${entry.course.title}`
        .toLowerCase()
        .includes(needle);
    });
  }, [data, query, courseId, band]);

  if (!data && !error) return <p className="text-sm text-slate-500">Loading feedback…</p>;

  const { summary, courses = [] } = data ?? {};
  const filtering = Boolean(query.trim() || courseId || band);
  const unrated = courses.filter((course) => course.count === 0);

  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-semibold text-slate-900">Feedback</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-500">
        What candidates have said about the courses you work on. They rate a course from their own
        My progress page, and can change what they said at any time.
      </p>

      <div className="mt-6 space-y-5">
        <Alert>{error}</Alert>

        {summary?.count === 0 ? (
          <Empty>
            Nobody has rated your courses yet. Feedback appears here as candidates leave it —
            {courses.length > 0 && ` all ${plural(courses.length, 'course')} are waiting.`}
          </Empty>
        ) : (
          <>
            {/* The headline first: one number, and whether it hides a split. */}
            <Card accent="amber">
              <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Across {plural(courses.filter((c) => c.count > 0).length, 'course')}
                  </p>
                  <p className="mt-1 flex items-baseline gap-3">
                    <span className="text-3xl font-semibold text-slate-900">{summary.average}</span>
                    <Stars n={Math.round(summary.average)} />
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    from {plural(summary.count, 'candidate')}
                  </p>
                </div>

                <div className="flex flex-wrap gap-4">
                  {/* Beside the headline, because the headline is their sum. */}
                  <Part label="Content" value={summary.content} />
                  <Part label="Duration" value={summary.duration} />
                </div>

                <Distribution distribution={summary.distribution} />
              </div>
            </Card>

            {/* Per course, so an average of 4.1 cannot hide one course at 2. */}
            <div className="grid gap-3 sm:grid-cols-2">
              {courses.map((course) => (
                <CourseRow
                  key={course.id}
                  course={course}
                  active={courseId === course.id}
                  onPick={() => setCourseId((current) => (current === course.id ? '' : course.id))}
                />
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-[14rem] flex-1">
                <Input
                  type="search"
                  placeholder="Search comments, candidates or courses…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>

              <div className="w-52">
                <Select value={courseId} onChange={(event) => setCourseId(event.target.value)}>
                  <option value="">Every course</option>
                  {courses
                    .filter((course) => course.count > 0)
                    .map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.code} ({course.count})
                      </option>
                    ))}
                </Select>
              </div>

              <div className="w-48">
                <Select value={band} onChange={(event) => setBand(event.target.value)}>
                  <option value="">Any rating</option>
                  <option value="concern">Needs attention (1–2★)</option>
                  <option value="praise">Positive (4–5★)</option>
                  <option value="commented">Has a written comment</option>
                </Select>
              </div>

              {filtering && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setQuery('');
                    setCourseId('');
                    setBand('');
                  }}
                >
                  Clear
                </Button>
              )}
            </div>

            {filtering && (
              <p className="text-xs text-slate-500">
                {filtered.length === 0
                  ? 'Nothing matches.'
                  : `Showing ${filtered.length} of ${plural(summary.count, 'rating')}.`}
              </p>
            )}

            {filtered.length === 0 ? (
              <Empty>No feedback matches those filters.</Empty>
            ) : (
              <ul className="space-y-3">
                {filtered.map((entry) => (
                  <Entry key={entry.id} entry={entry} />
                ))}
              </ul>
            )}

            {unrated.length > 0 && !filtering && (
              <p className="text-xs text-slate-500">
                Nothing said yet about{' '}
                <span className="font-medium text-slate-600">
                  {unrated.map((course) => course.code).join(' · ')}
                </span>
                .
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Star bands, highest first — shows whether an average hides a split. */
function Distribution({ distribution }) {
  const most = Math.max(...distribution);

  return (
    <div className="min-w-[12rem] flex-1 space-y-1">
      {[5, 4, 3, 2, 1].map((star) => {
        const n = distribution[star - 1];
        return (
          <div key={star} className="flex items-center gap-2 text-xs">
            <span className="w-3 text-right text-slate-500">{star}</span>
            <span className="text-amber-400" aria-hidden>
              ★
            </span>
            <span className="h-2 flex-1 overflow-hidden rounded-sm bg-slate-100">
              <span
                className="block h-full rounded-sm bg-amber-400"
                style={{ width: most === 0 ? 0 : `${(n / most) * 100}%` }}
              />
            </span>
            <span className="w-4 tabular-nums text-slate-500">{n}</span>
          </div>
        );
      })}
    </div>
  );
}

/** One course's standing, and a way to filter the list down to it. */
function CourseRow({ course, active, onPick }) {
  const rated = course.count > 0;

  return (
    <button
      onClick={rated ? onPick : undefined}
      // A course nobody has rated is a fact, not a filter — pressing it would
      // show an empty list and teach you nothing you did not already see here.
      disabled={!rated}
      className={`rounded-xl border px-4 py-3 text-left transition ${
        active
          ? 'border-indigo-400 bg-indigo-50/60'
          : rated
            ? 'border-slate-200 bg-white hover:border-slate-300'
            : 'border-dashed border-slate-200 bg-slate-50/60'
      }`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0">
          <span className="text-xs font-semibold tracking-wide text-indigo-600">{course.code}</span>
          <span className="mt-0.5 block truncate text-sm text-slate-700">{course.title}</span>
        </span>

        <span className="shrink-0 text-right">
          {rated ? (
            <>
              <span className="text-sm font-semibold text-slate-900">{course.average}</span>
              <span className="mt-0.5 block text-xs text-slate-500">
                {plural(course.count, 'rating')}
              </span>
            </>
          ) : (
            <span className="text-xs text-slate-400">no feedback</span>
          )}
        </span>
      </div>
    </button>
  );
}

function Entry({ entry }) {
  return (
    <li>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <Link
                to={`/trainer/courses/${entry.course.id}`}
                className="text-xs font-semibold tracking-wide text-indigo-600 hover:underline"
              >
                {entry.course.code}
              </Link>
              <span className="text-xs text-slate-500">{entry.course.title}</span>
            </div>
            <p className="mt-1 text-sm font-medium text-slate-900">{entry.candidate.fullName}</p>
          </div>

          <div className="shrink-0 text-right">
            <Stars n={entry.rating} />
            {(entry.contentRating || entry.durationRating) && (
              <p className="mt-1 text-xs text-slate-500">
                {entry.contentRating ? `content ${entry.contentRating}` : ''}
                {entry.contentRating && entry.durationRating ? ' · ' : ''}
                {entry.durationRating ? `duration ${entry.durationRating}` : ''}
              </p>
            )}
            <p className="mt-1 flex items-center justify-end gap-2 text-xs text-slate-500">
              <Badge tone={toneFor(entry.rating)}>{LABELS[entry.rating]}</Badge>
              {formatDate(entry.updatedAt)}
            </p>
          </div>
        </div>

        {entry.comment ? (
          <p className="mt-3 whitespace-pre-line border-l-2 border-slate-200 pl-3 text-sm leading-relaxed text-slate-700">
            {entry.comment}
          </p>
        ) : (
          // Worth saying: a bare rating is a different thing from a rating
          // whose comment failed to load.
          <p className="mt-3 text-xs text-slate-400">Rated without a comment.</p>
        )}
      </Card>
    </li>
  );
}

/** One dimension beside the headline average. */
function Part({ label, value }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      {value == null ? (
        <p className="mt-1 text-sm text-slate-400">Not rated</p>
      ) : (
        <p className="mt-1 flex items-baseline gap-2">
          <span className="text-xl font-semibold text-slate-900">{value}</span>
          <Stars n={Math.round(value)} />
        </p>
      )}
    </div>
  );
}
