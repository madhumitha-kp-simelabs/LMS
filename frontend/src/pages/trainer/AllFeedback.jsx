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

/**
 * Summarising a set of entries — the same shape the server sends for
 * everything, recomputed here for whatever the filters have left.
 *
 * Nulls are skipped rather than counted as zero, or feedback left before the
 * content and duration ratings existed would drag both averages down.
 */
const mean = (rows, pick) => {
  const given = rows.map(pick).filter((value) => value != null);
  if (given.length === 0) return null;
  return Math.round((given.reduce((sum, v) => sum + v, 0) / given.length) * 10) / 10;
};

const summarise = (rows) => ({
  count: rows.length,
  average: mean(rows, (r) => r.rating),
  distribution: [1, 2, 3, 4, 5].map((star) => rows.filter((r) => r.rating === star).length),
  content: mean(rows, (r) => r.contentRating),
  duration: mean(rows, (r) => r.durationRating),
  trainer: mean(rows, (r) => r.trainerRating),
});

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

  /**
   * The headline describes whatever is on screen.
   *
   * It used to be the organisation-wide summary regardless, so picking a course
   * filtered the comments underneath while the average and the bars carried on
   * describing everything — a chart quietly answering a different question from
   * the one just asked.
   */
  const picked = courseId ? courses.find((course) => course.id === courseId) : null;
  const shown = summarise(filtered);
  const scope = picked
    ? `${picked.code} v${picked.version} · ${picked.title}`
    : `Across ${plural(courses.filter((c) => c.count > 0).length, 'course')}`;

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
            {/* Filters first. They govern everything below them — the headline
                average as much as the comments — so putting them after the
                summary made the summary look like a fixed total that the
                controls beneath could not touch. */}
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
                        {course.code} v{course.version} ({course.count})
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

            {/* The summary and the ratings it is drawn from, in one frame —
                the average is a claim and the ratings beneath are the evidence
                for it, so they are read together. */}
            <Card accent="amber" flush>
              <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4 px-6 py-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {scope}
                  </p>
                  <p className="mt-1 flex items-baseline gap-3">
                    <span className="text-3xl font-semibold text-slate-900">
                      {shown.average ?? '—'}
                    </span>
                    {shown.average != null && <Stars n={Math.round(shown.average)} />}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    from {plural(shown.count, 'candidate')}
                    {filtering && shown.count !== summary.count && ` of ${summary.count}`}
                  </p>
                </div>

                <div className="flex flex-wrap gap-4">
                  {/* Beside the headline, because the headline is their sum. */}
                  <Part label="Content" value={shown.content} />
                  <Part label="Duration" value={shown.duration} />
                  <Part label="Trainer" value={shown.trainer} />
                </div>

                <Distribution distribution={shown.distribution} />
              </div>

              <div className="border-t border-amber-200/70 bg-white px-6 py-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Candidate ratings
                  {filtering && filtered.length > 0 && (
                    <span className="ml-2 font-normal normal-case tracking-normal text-slate-400">
                      {filtered.length} of {plural(summary.count, 'rating')}
                    </span>
                  )}
                </p>

                {filtered.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500">Nothing matches those filters.</p>
                ) : (
                  <ul className="mt-3 space-y-3">
                    {filtered.map((entry) => (
                      <Entry key={entry.id} entry={entry} />
                    ))}
                  </ul>
                )}
              </div>
            </Card>
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

function Entry({ entry }) {
  return (
    <li className="rounded-xl border border-slate-200 px-4 py-3.5">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <Link
                to={`/trainer/courses/${entry.course.id}`}
                className="text-xs font-semibold tracking-wide text-indigo-600 hover:underline"
              >
                {entry.course.code} v{entry.course.version}
              </Link>
              <span className="text-xs text-slate-500">{entry.course.title}</span>
            </div>
            <p className="mt-1 text-sm font-medium text-slate-900">{entry.candidate.fullName}</p>
          </div>

          <div className="shrink-0 text-right">
            <Stars n={entry.rating} />
            {(entry.contentRating || entry.durationRating || entry.trainerRating) && (
              <p className="mt-1 text-xs text-slate-500">
                {[
                  entry.contentRating && `content ${entry.contentRating}`,
                  entry.durationRating && `duration ${entry.durationRating}`,
                  entry.trainerRating && `trainer ${entry.trainerRating}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
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
      </div>
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
