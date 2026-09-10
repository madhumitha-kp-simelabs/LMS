import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Alert, Badge, Card, Empty } from '../../components/ui';
import CourseSchedule from './CourseSchedule';

/** Score analysis for the signed-in candidate. */

const INK = { muted: '#898781', grid: '#e1e0d9' };

const formatDate = (value) =>
  new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export default function MyProgress() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // One course open at a time. Null before the fetch lands; the first course
  // opens itself once it does, so the page is never a row of shut drawers.
  const [openId, setOpenId] = useState(null);

  // Pausing, resuming and asking for time all move dates this page prints, so
  // it has to be reloadable rather than fetched once.
  const load = useCallback(
    () =>
      api('/learn/progress')
        .then(({ courses }) => {
          setCourses(courses);
          setOpenId((current) => current ?? courses[0]?.id ?? null);
        })
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
        <div className="mt-6 space-y-3">
          {courses.map((course) => (
            <CourseProgress
              key={course.id}
              course={course}
              open={openId === course.id}
              onToggle={() => setOpenId((current) => (current === course.id ? null : course.id))}
              onChanged={load}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * One course, as a drawer.
 *
 * Somebody on four courses had four full analyses stacked down the page, and
 * the one they came to look at was rarely the first. The closed row carries
 * what tells them which drawer to open — the course, its headline score and
 * how much of it is done — and everything below it is the detail behind that
 * number.
 */
function CourseProgress({ course, open, onToggle, onChanged }) {
  const { summary, topics } = course;
  const started = summary.quizzesAttempted > 0;

  return (
    <Card flush accent={open ? 'indigo' : undefined}>
      <button
        onClick={onToggle}
        aria-expanded={open}
        className={`flex w-full flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-4 text-left transition hover:bg-slate-50/70 ${
          open ? 'bg-slate-50/60' : ''
        }`}
      >
        <span className="min-w-0">
          <span className="flex flex-wrap items-baseline gap-2">
            <span className="text-sm font-semibold tracking-wide text-indigo-600">
              {course.code}
            </span>
            <span className="text-xs text-slate-400">v{course.version}</span>
            {/* Says why this one is not in My courses any more. Without it a
                finished-looking record with no way back reads as a fault. */}
            {course.dates?.supersededAt && <Badge tone="slate">Moved to a later version</Badge>}
          </span>
          <span className="block truncate font-semibold text-slate-900">{course.title}</span>
        </span>

        <span className="flex shrink-0 items-center gap-4">
          {started ? (
            <span className="text-right">
              <span className="block text-xl font-semibold leading-none text-slate-900">
                {summary.overallPercentage}
                <span className="text-sm font-medium text-slate-400">%</span>
              </span>
              <span className="mt-1 block text-xs text-slate-500">
                {summary.quizzesAttempted}/{summary.quizzesAvailable} quizzes
              </span>
            </span>
          ) : (
            <span className="text-xs text-slate-400">Not started</span>
          )}

          <span
            className={`text-xs text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden
          >
            ▾
          </span>
        </span>
      </button>

      {open && (
        <div className="border-t border-slate-100 px-5 py-5">
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

          <AttemptTable topics={topics.filter((t) => t.attemptCount > 0)} />

          <CourseSchedule
            course={{ id: course.id, ...course.dates }}
            onChanged={onChanged}
          />
            </div>
          )}
        </div>
      )}
    </Card>
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

function AttemptTable({ topics }) {
  if (topics.length === 0) return null;

  return (
    <Card>
      <h3 className="font-semibold text-slate-900">All attempts</h3>
      <p className="mt-1 text-sm text-slate-500">
        Every sitting, including the ones a retake replaced.
      </p>
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
