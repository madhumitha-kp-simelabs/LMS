import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Alert, Card, Empty } from '../../components/ui';
import CourseFeedback from './CourseFeedback';
import SessionRequest from './SessionRequest';
import CourseSchedule from './CourseSchedule';

/**
 * Score analysis for the signed-in candidate.
 *
 * Scores are a single measure compared across topics, so the chart is one
 * sequential blue ramp (darker = higher) rather than a colour per topic —
 * colour here encodes magnitude, not identity, so there is no legend to read.
 */

// Sequential blue, light -> dark. Validated for a single hue, monotone
// lightness, visible step gaps, and light-end contrast on a white surface.
const RAMP = [
  { min: 80, fill: '#184f95' },
  { min: 60, fill: '#2a78d6' },
  { min: 40, fill: '#5598e7' },
  { min: 0, fill: '#86b6ef' },
];

const INK = { secondary: '#52514e', muted: '#898781', grid: '#e1e0d9' };

const fillFor = (percentage) => RAMP.find((step) => percentage >= step.min).fill;

const formatDate = (value) =>
  new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export default function MyProgress() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Pausing, resuming and asking for time all move dates this page prints, so
  // it has to be reloadable rather than fetched once.
  const load = useCallback(
    () =>
      api('/learn/progress')
        .then(({ courses }) => setCourses(courses))
        .catch((err) => setError(err.message)),
    [],
  );

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  if (loading) return <p className="text-sm text-slate-500">Loading your results…</p>;

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">My progress</h1>
      <p className="mt-1 text-sm text-slate-500">
        Your latest score for each topic. Retaking a quiz replaces the score shown here.
      </p>

      <Alert>{error}</Alert>

      {courses.length === 0 ? (
        <div className="mt-6">
          <Empty>Nothing has been allotted to you yet.</Empty>
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {courses.map((course) => (
            <CourseProgress key={course.id} course={course} onChanged={load} />
          ))}
        </div>
      )}
    </div>
  );
}

function CourseProgress({ course, onChanged }) {
  const { summary, topics } = course;
  const scored = topics.filter((t) => t.latest);

  return (
    <section>
      <p className="text-base font-semibold tracking-wide text-indigo-600">{course.code}</p>
      <h2 className="font-semibold text-slate-900">{course.title}</h2>
      <CourseDates dates={course.dates} />

      {summary.quizzesAttempted === 0 ? (
        <div className="space-y-6">
          <Empty>
            You haven&apos;t taken any quizzes in this course yet. Your scores will appear here once
            you do.
          </Empty>
          <CourseSchedule
            course={{ id: course.id, ...course.dates }}
            onChanged={onChanged}
          />

          <SessionRequest courseId={course.id} courseTitle={course.title} />

          <CourseFeedback courseId={course.id} courseTitle={course.title} />
        </div>
      ) : (
        <div className="space-y-6">
          <Card>
            <div className="flex flex-wrap items-end gap-x-12 gap-y-6">
              <div>
                <p className="text-sm text-slate-500">Overall score</p>
                {/* Hero figure — the one number this view leads with. */}
                <p className="mt-1 text-5xl font-semibold leading-none text-slate-900">
                  {summary.overallPercentage}
                  <span className="text-2xl font-medium text-slate-400">%</span>
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  {summary.marksEarned} of {summary.marksPossible} marks
                </p>
              </div>

              <Stat label="Quizzes done" value={`${summary.quizzesAttempted}/${summary.quizzesAvailable}`} />
              <Stat label="Topics allotted" value={topics.length} />
              <Stat
                label="Total attempts"
                value={topics.reduce((sum, t) => sum + t.attemptCount, 0)}
              />
            </div>
          </Card>

          <Card>
            <h3 className="font-semibold text-slate-900">Score by topic</h3>
            <p className="mt-1 text-sm text-slate-500">Latest attempt · darker means higher</p>
            <ScoreChart topics={scored} />
          </Card>

          <AttemptTable topics={topics.filter((t) => t.attemptCount > 0)} />

          <CourseSchedule
            course={{ id: course.id, ...course.dates }}
            onChanged={onChanged}
          />

          <SessionRequest courseId={course.id} courseTitle={course.title} />

          <CourseFeedback courseId={course.id} courseTitle={course.title} />
        </div>
      )}
    </section>
  );
}

/** Enrolled → started → completed. Dates only; the clock time isn't meaningful here. */
function CourseDates({ dates }) {
  if (!dates) return null;

  const steps = [
    { label: 'Enrolled', value: dates.enrolledAt, tone: 'text-slate-600' },
    { label: 'Started', value: dates.startedAt, tone: 'text-indigo-700' },
    { label: 'Completed', value: dates.completedAt, tone: 'text-emerald-700' },
  ];

  return (
    <div className="mb-4 mt-2 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs">
      {steps.map((step) => (
        <span key={step.label} className="flex items-center gap-1.5">
          <span className="text-slate-500">{step.label}</span>
          {step.value ? (
            <span className={`font-medium ${step.tone}`}>{formatDate(step.value)}</span>
          ) : (
            <span className="text-slate-400">
              {step.label === 'Started' ? 'not opened yet' : 'not yet'}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function ScoreChart({ topics }) {
  const [hovered, setHovered] = useState(null);

  return (
    <div className="mt-5">
      <div className="space-y-4">
        {topics.map((topic) => {
          const pct = topic.latest.percentage;
          const active = hovered === topic.topicId;

          return (
            <div
              key={topic.topicId}
              onMouseEnter={() => setHovered(topic.topicId)}
              onMouseLeave={() => setHovered(null)}
              className="relative"
            >
              <div className="mb-1.5 flex items-baseline justify-between gap-4">
                <span className="truncate text-sm text-slate-700">
                  <span className="text-slate-400">{topic.position}.</span> {topic.title}
                </span>
                {/* Value at the tip of the bar, in ink — never the data colour. */}
                <span
                  className="shrink-0 text-sm font-semibold"
                  style={{ color: INK.secondary, fontVariantNumeric: 'tabular-nums' }}
                >
                  {pct}%
                </span>
              </div>

              {/* Track shows the 0-100 scale the bar is measured against. */}
              <div className="h-5 w-full overflow-hidden rounded-sm" style={{ background: '#f1f5f9' }}>
                <div
                  className="h-full transition-[width] duration-500"
                  style={{
                    width: `${Math.max(pct, 0.6)}%`,
                    background: fillFor(pct),
                    // 4px rounded data-end, square where it meets the baseline.
                    borderRadius: '0 4px 4px 0',
                  }}
                />
              </div>

              {active && (
                <div className="absolute right-0 top-full z-10 mt-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm">
                  <p className="font-medium text-slate-900">
                    {topic.latest.totalScore}/{topic.latest.maxScore} marks
                  </p>
                  <p className="mt-0.5" style={{ color: INK.muted }}>
                    {topic.attemptCount} attempt{topic.attemptCount === 1 ? '' : 's'} · best{' '}
                    {topic.bestPercentage}%
                  </p>
                  <p style={{ color: INK.muted }}>{formatDate(topic.latest.submittedAt)}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex items-center gap-4 border-t pt-3" style={{ borderColor: INK.grid }}>
        <span className="text-xs" style={{ color: INK.muted }}>
          Lower
        </span>
        <div className="flex gap-1">
          {[...RAMP].reverse().map((step) => (
            <span
              key={step.fill}
              className="h-2.5 w-8 rounded-sm"
              style={{ background: step.fill }}
              aria-hidden
            />
          ))}
        </div>
        <span className="text-xs" style={{ color: INK.muted }}>
          Higher
        </span>
      </div>
    </div>
  );
}

/** The table view — every value in the chart, reachable without reading colour. */
function AttemptTable({ topics }) {
  if (topics.length === 0) return null;

  return (
    <Card>
      <h3 className="font-semibold text-slate-900">All attempts</h3>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b" style={{ borderColor: INK.grid }}>
              <th className="py-2 pr-4 text-left font-medium" style={{ color: INK.muted }}>
                Topic
              </th>
              <th className="py-2 pr-4 text-left font-medium" style={{ color: INK.muted }}>
                Attempt
              </th>
              <th className="py-2 pr-4 text-right font-medium" style={{ color: INK.muted }}>
                Score
              </th>
              <th className="py-2 text-right font-medium" style={{ color: INK.muted }}>
                Submitted
              </th>
            </tr>
          </thead>
          <tbody>
            {topics.flatMap((topic) =>
              [...topic.history].reverse().map((attempt, index) => {
                const isLatest = index === 0;
                return (
                  <tr key={`${topic.topicId}-${attempt.attemptNumber}`} className="border-b last:border-0" style={{ borderColor: INK.grid }}>
                    <td className="py-2 pr-4 text-slate-700">
                      {index === 0 ? topic.title : ''}
                    </td>
                    <td className="py-2 pr-4" style={{ color: INK.muted }}>
                      #{attempt.attemptNumber}
                      {isLatest && topic.history.length > 1 && (
                        <span className="ml-2 text-xs text-slate-900">counts</span>
                      )}
                    </td>
                    <td
                      className="py-2 pr-4 text-right text-slate-900"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {attempt.percentage}%
                    </td>
                    <td
                      className="py-2 text-right"
                      style={{ color: INK.muted, fontVariantNumeric: 'tabular-nums' }}
                    >
                      {formatDate(attempt.submittedAt)}
                    </td>
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
