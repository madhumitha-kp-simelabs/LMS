import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { Alert, Badge, Card, Empty, toneForScore } from '../../components/ui';

const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '—';

/** Every candidate on a course: where they are, what they scored, what to fix. */
export default function CourseProgress() {
  const { courseId } = useParams();
  const [data, setData] = useState(null);
  const [course, setCourse] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([api(`/courses/${courseId}/progress`), api(`/courses/${courseId}`)])
      .then(([progress, { course }]) => {
        setData(progress);
        setCourse(course);
      })
      .catch((err) => setError(err.message));
  }, [courseId]);

  if (error) return <Alert>{error}</Alert>;
  if (!data) return <p className="text-sm text-slate-500">Loading progress…</p>;

  const { candidates, summary } = data;

  return (
    <div>
      <Link to={`/trainer/courses/${courseId}`} className="text-sm text-indigo-600 hover:text-indigo-700">
        ← Back to course
      </Link>

      <div className="mt-4">
        <p className="text-base font-semibold tracking-wide text-indigo-600">{course?.code}</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Candidate progress</h1>
        <p className="mt-1 text-sm text-slate-500">{course?.title}</p>
      </div>

      {candidates.length === 0 ? (
        <div className="mt-8">
          <Empty>No candidates are enrolled on this course yet.</Empty>
        </div>
      ) : (
        <>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Tile accent="indigo" label="Candidates" value={summary.candidates} />
            <Tile accent="sky" label="Started" value={`${summary.started}/${summary.candidates}`} />
            <Tile
              accent="emerald"
              label="Completed"
              value={`${summary.completed}/${summary.candidates}`}
            />
            <Tile
              accent="violet"
              label="Average score"
              value={summary.averageScore === null ? '—' : `${summary.averageScore}%`}
            />
          </div>

          {summary.weakestTopics.length > 0 && (
            <Card accent="amber" className="mt-6">
              <h2 className="font-semibold text-slate-900">Where the group struggles</h2>
              <p className="mt-1 text-sm text-slate-500">
                Lowest average scores across everyone who has attempted them — worth reviewing the
                material or the questions.
              </p>
              <ul className="mt-4 space-y-2">
                {summary.weakestTopics.map((topic) => (
                  <li
                    key={topic.topicId}
                    className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 px-4 py-3"
                  >
                    <span className="text-sm text-slate-800">
                      <span className="text-slate-400">{topic.position}.</span> {topic.title}
                    </span>
                    <span className="flex items-center gap-3 text-xs text-slate-500">
                      {topic.responses} attempted
                      <Badge tone={toneForScore(topic.average)}>{topic.average}%</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <div className="mt-6 space-y-3">
            {candidates.map((candidate) => (
              <CandidateRow
                key={candidate.id}
                candidate={candidate}
                open={expanded === candidate.id}
                onToggle={() => setExpanded(expanded === candidate.id ? null : candidate.id)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Tile({ label, value, accent }) {
  const colour = {
    indigo: 'text-indigo-700',
    sky: 'text-sky-700',
    emerald: 'text-emerald-700',
    violet: 'text-violet-700',
  }[accent];

  return (
    <Card accent={accent}>
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-1 text-3xl font-semibold ${colour}`}>{value}</p>
    </Card>
  );
}

function CandidateRow({ candidate, open, onToggle }) {
  const status = candidate.completedAt
    ? { tone: 'green', label: `Completed ${formatDate(candidate.completedAt)}` }
    : candidate.startedAt
      ? { tone: 'indigo', label: `Started ${formatDate(candidate.startedAt)}` }
      : { tone: 'slate', label: 'Not started' };

  return (
    <Card className="p-0">
      <button onClick={onToggle} className="w-full px-6 py-4 text-left">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <span className="block font-medium text-slate-900">{candidate.fullName}</span>
            <span className="text-xs text-slate-500">{candidate.email}</span>
          </div>

          <div className="flex flex-wrap items-center gap-5 text-sm">
            <span className="text-slate-500">
              {candidate.quizzesDone}/{candidate.quizzesAvailable} quizzes
            </span>
            <span className="text-slate-500">
              {candidate.marksEarned}/{candidate.marksPossible} marks
            </span>
            <Badge tone={status.tone}>{status.label}</Badge>
            {candidate.overallPercentage === null ? (
              <span className="text-slate-400">—</span>
            ) : (
              <Badge tone={toneForScore(candidate.overallPercentage)}>
                {candidate.overallPercentage}%
              </Badge>
            )}
            <span className="text-xs text-slate-400">{open ? '▲' : '▼'}</span>
          </div>
        </div>

        {(candidate.needsWork.length > 0 || candidate.notAttempted.length > 0) && !open && (
          <p className="mt-2 text-xs text-amber-700">
            Needs work:{' '}
            {[
              ...candidate.needsWork.map((t) => `${t.title} (${t.percentage}%)`),
              ...candidate.notAttempted.map((t) => `${t.title} (not attempted)`),
            ]
              .slice(0, 3)
              .join(' · ')}
          </p>
        )}
      </button>

      {open && (
        <div className="border-t border-slate-200 px-6 py-5">
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Topic by topic
              </p>
              <ul className="space-y-1.5">
                {candidate.topics.map((topic) => (
                  <li
                    key={topic.topicId}
                    className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 px-4 py-2.5"
                  >
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
                            {topic.totalScore}/{topic.maxScore} · {topic.attempts} attempt
                            {topic.attempts === 1 ? '' : 's'}
                          </span>
                          <Badge tone={toneForScore(topic.percentage)}>{topic.percentage}%</Badge>
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Areas of improvement
              </p>

              {candidate.needsWork.length === 0 && candidate.notAttempted.length === 0 ? (
                <p className="rounded-lg border border-emerald-200 bg-emerald-50/50 px-4 py-3 text-sm text-emerald-900">
                  Nothing outstanding — every allotted quiz passed at 50% or above.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {candidate.needsWork.map((topic) => (
                    <li
                      key={topic.title}
                      className="flex items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50/50 px-4 py-2.5 text-sm text-rose-900"
                    >
                      <span>{topic.title}</span>
                      <span className="shrink-0 font-medium">{topic.percentage}%</span>
                    </li>
                  ))}
                  {candidate.notAttempted.map((topic) => (
                    <li
                      key={topic.title}
                      className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50/50 px-4 py-2.5 text-sm text-amber-900"
                    >
                      <span>{topic.title}</span>
                      <span className="shrink-0 text-xs">not attempted</span>
                    </li>
                  ))}
                </ul>
              )}

              <p className="mt-3 text-xs text-slate-500">
                Enrolled {formatDate(candidate.enrolledAt)} · {candidate.topicsAllotted} topic
                {candidate.topicsAllotted === 1 ? '' : 's'} allotted
              </p>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
