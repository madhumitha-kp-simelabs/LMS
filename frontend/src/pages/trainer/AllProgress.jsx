import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import {
  Alert,
  Badge,
  Button,
  Card,
  Empty,
  Input,
  Select,
  toneForScore,
} from '../../components/ui';
import AttemptReview from '../../components/AttemptReview';
import OtherCourses from '../../components/OtherCourses';

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Where a candidate stands, and what the standing filter selects on.
 *
 * "Needs work" outranks "in progress" deliberately: somebody halfway through a
 * course who is failing quizzes is a person to help, not a person to wait for,
 * and the point of this page is finding them.
 */
const standingOf = (row) => {
  if (row.needsWork.length > 0) return 'needsWork';
  if (row.completedAt) return 'completed';
  if (row.startedAt) return 'inProgress';
  return 'notStarted';
};

const STANDINGS = {
  needsWork: 'Needs help',
  notStarted: 'Not started',
  inProgress: 'In progress',
  completed: 'Completed',
};

/**
 * Every candidate on every course you work on, in one list.
 *
 * The per-course screen answers "how is this cohort doing", once you have
 * already chosen a course. This answers the question that actually starts the
 * week — who is stuck, anywhere — which no amount of opening courses one at a
 * time answers well.
 */
export default function AllProgress() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [courseId, setCourseId] = useState('');
  const [standing, setStanding] = useState('');
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    api('/progress')
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  const rows = data?.progress ?? [];

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return rows.filter((row) => {
      if (courseId && row.course.id !== courseId) return false;
      if (standing && standingOf(row) !== standing) return false;
      if (!needle) return true;
      return `${row.fullName} ${row.email} ${row.course.code} ${row.course.title}`
        .toLowerCase()
        .includes(needle);
    });
  }, [rows, query, courseId, standing]);

  const counts = useMemo(() => {
    const tally = {};
    for (const row of rows) tally[standingOf(row)] = (tally[standingOf(row)] ?? 0) + 1;
    return tally;
  }, [rows]);

  if (!data && !error) return <p className="text-sm text-slate-500">Loading progress…</p>;

  const scored = rows.filter((r) => r.overallPercentage !== null);
  const average =
    scored.length === 0
      ? null
      : Math.round(scored.reduce((sum, r) => sum + r.overallPercentage, 0) / scored.length);
  const filtering = Boolean(query.trim() || courseId || standing);

  return (
    <div className="max-w-5xl">
      <h1 className="text-xl font-semibold text-slate-900">Candidate progress</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-500">
        Everyone on the courses you work on. Open a row to see topic by topic, and the answers
        behind any quiz they have sat.
      </p>

      <div className="mt-6 space-y-5">
        <Alert>{error}</Alert>

        {rows.length === 0 ? (
          <Empty>
            Nobody is on your courses yet. Candidates appear here once an administrator allots them
            a topic.
          </Empty>
        ) : (
          <>
            {/* The counts are the page: four numbers say where the week goes. */}
            <Card flush className="overflow-hidden">
              <div className="grid divide-y divide-slate-200 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
                <Tile
                  label="Need help"
                  value={counts.needsWork ?? 0}
                  hint="failing at least one quiz"
                  accent="rose"
                  active={standing === 'needsWork'}
                  onPick={() => setStanding((c) => (c === 'needsWork' ? '' : 'needsWork'))}
                />
                <Tile
                  label="Not started"
                  value={counts.notStarted ?? 0}
                  hint="never opened a topic"
                  accent="amber"
                  active={standing === 'notStarted'}
                  onPick={() => setStanding((c) => (c === 'notStarted' ? '' : 'notStarted'))}
                />
                <Tile
                  label="In progress"
                  value={counts.inProgress ?? 0}
                  hint="working through it"
                  accent="indigo"
                  active={standing === 'inProgress'}
                  onPick={() => setStanding((c) => (c === 'inProgress' ? '' : 'inProgress'))}
                />
                <Tile
                  label="Average score"
                  value={average === null ? '—' : `${average}%`}
                  hint={
                    scored.length === 0
                      ? 'nothing scored yet'
                      : `across ${plural(scored.length, 'candidate')}`
                  }
                  accent="emerald"
                />
              </div>
            </Card>

            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-[14rem] flex-1">
                <Input
                  type="search"
                  placeholder="Search by name, email or course…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>

              <div className="w-56">
                <Select value={courseId} onChange={(event) => setCourseId(event.target.value)}>
                  <option value="">Every course</option>
                  {(data.courses ?? []).map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.code} ({course.candidates})
                    </option>
                  ))}
                </Select>
              </div>

              <div className="w-44">
                <Select value={standing} onChange={(event) => setStanding(event.target.value)}>
                  <option value="">Any standing</option>
                  {Object.entries(STANDINGS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label} ({counts[value] ?? 0})
                    </option>
                  ))}
                </Select>
              </div>

              {filtering && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setQuery('');
                    setCourseId('');
                    setStanding('');
                  }}
                >
                  Clear
                </Button>
              )}
            </div>

            {filtering && (
              <p className="text-xs text-slate-500">
                {filtered.length === 0
                  ? 'Nobody matches.'
                  : `Showing ${filtered.length} of ${rows.length} rows.`}
              </p>
            )}

            {filtered.length === 0 ? (
              <Empty>Nobody matches those filters.</Empty>
            ) : (
              <div className="space-y-3">
                {filtered.map((row) => {
                  const key = `${row.course.id}:${row.id}`;
                  return (
                    <Row
                      key={key}
                      row={row}
                      open={expanded === key}
                      onToggle={() => setExpanded(expanded === key ? null : key)}
                    />
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** A stat that is also a filter, where the number is something to act on. */
function Tile({ label, value, hint, accent, active, onPick }) {
  const colour = {
    rose: 'text-rose-700',
    amber: 'text-amber-700',
    indigo: 'text-indigo-700',
    emerald: 'text-emerald-700',
  }[accent];

  const rule = {
    rose: 'bg-rose-500',
    amber: 'bg-amber-500',
    indigo: 'bg-indigo-500',
    emerald: 'bg-emerald-500',
  }[accent];

  const body = (
    <>
      <span className="flex items-center gap-2">
        <span className={`h-3 w-1 shrink-0 rounded-full ${rule}`} aria-hidden />
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      </span>
      <span className={`mt-2 block text-3xl font-semibold tabular-nums ${colour}`}>{value}</span>
      <span className="mt-1 block text-xs text-slate-500">{hint}</span>
    </>
  );

  // Average score is a fact, not a queue — it filters nothing, so it is not a
  // button pretending otherwise.
  if (!onPick) return <div className="px-5 py-4">{body}</div>;

  return (
    <button
      onClick={onPick}
      aria-pressed={active}
      className={`px-5 py-4 text-left transition ${active ? 'bg-indigo-50/70' : 'hover:bg-slate-50'}`}
    >
      {body}
    </button>
  );
}

function Row({ row, open, onToggle }) {
  const [reviewing, setReviewing] = useState(null);
  const standing = standingOf(row);

  const badge = {
    needsWork: { tone: 'rose', label: `Needs help · ${row.needsWork.length}` },
    completed: { tone: 'green', label: `Completed ${formatDate(row.completedAt)}` },
    inProgress: { tone: 'indigo', label: `Started ${formatDate(row.startedAt)}` },
    notStarted: { tone: 'slate', label: 'Not started' },
  }[standing];

  return (
    <Card flush accent={standing === 'needsWork' ? 'rose' : undefined}>
      <button onClick={onToggle} className="w-full px-5 py-4 text-left">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <span className="block font-medium text-slate-900">{row.fullName}</span>
            <span className="flex flex-wrap items-baseline gap-x-2 text-xs">
              <span className="font-semibold tracking-wide text-indigo-600">{row.course.code}</span>
              <span className="text-slate-500">{row.course.title}</span>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="text-slate-500">
              {row.quizzesDone}/{row.quizzesAvailable} quizzes
            </span>
            <Badge tone={badge.tone}>{badge.label}</Badge>
            {row.overallPercentage === null ? (
              <span className="text-slate-400">—</span>
            ) : (
              <Badge tone={toneForScore(row.overallPercentage)}>{row.overallPercentage}%</Badge>
            )}
            <span className="text-xs text-slate-400">{open ? '▲' : '▼'}</span>
          </div>
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-200 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Topic by topic
            </p>
            <Link
              to={`/trainer/courses/${row.course.id}/progress`}
              className="text-xs text-indigo-600 underline hover:text-indigo-700"
            >
              Open {row.course.code} progress
            </Link>
          </div>

          <ul className="mt-2 space-y-1.5">
            {row.topics.map((topic) => (
              <li key={topic.topicId}>
                <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 px-4 py-2.5">
                  <span className="min-w-0 text-sm text-slate-800">
                    <span className="text-slate-400">{topic.position}.</span> {topic.title}
                  </span>
                  <span className="flex shrink-0 items-center gap-3 text-xs text-slate-500">
                    {!topic.hasQuiz ? (
                      <span className="text-slate-400">no quiz</span>
                    ) : topic.percentage === null ? (
                      <span className="text-amber-700">not attempted</span>
                    ) : (
                      <>
                        <span>
                          {topic.totalScore}/{topic.maxScore}
                        </span>
                        <Badge tone={topic.passed ? 'green' : 'rose'}>{topic.percentage}%</Badge>
                        {topic.passMark != null && (
                          <span className="text-slate-400">pass {topic.passMark}%</span>
                        )}
                        <button
                          onClick={() =>
                            setReviewing(reviewing === topic.attemptId ? null : topic.attemptId)
                          }
                          className="text-indigo-600 underline transition hover:text-indigo-700"
                        >
                          {reviewing === topic.attemptId ? 'Hide answers' : 'View answers'}
                        </button>
                      </>
                    )}
                  </span>
                </div>

                {reviewing === topic.attemptId && (
                  <div className="mt-2">
                    <AttemptReview
                      attemptId={topic.attemptId}
                      staff
                      onClose={() => setReviewing(null)}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>

          <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Also studying
          </p>
          <OtherCourses courses={row.otherCourses} />
        </div>
      )}
    </Card>
  );
}
