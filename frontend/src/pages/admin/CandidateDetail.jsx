import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import {
  Alert,
  Avatar,
  Badge,
  Card,
  Cell,
  Empty,
  Row,
  Table,
  toneForScore,
} from '../../components/ui';

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Everything about one candidate. The admin list stays scannable by keeping
 * only names and courses; the figures that need context all live here.
 */
export default function CandidateDetail() {
  const { userId } = useParams();
  const [candidate, setCandidate] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setCandidate(null);
    setError(null);
    api(`/admin/candidates/${userId}`)
      .then(({ candidate }) => setCandidate(candidate))
      .catch((err) => setError(err.message));
  }, [userId]);

  if (error) {
    return (
      <div>
        <BackLink />
        <div className="mt-4">
          <Alert>{error}</Alert>
        </div>
      </div>
    );
  }

  if (!candidate) return <p className="text-sm text-slate-500">Loading…</p>;

  const { summary } = candidate;

  return (
    <div>
      <BackLink />

      <div className="mt-4 flex flex-wrap items-start justify-between gap-x-10 gap-y-4 rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-sky-50 p-6">
        <div className="flex items-center gap-4">
          <Avatar name={candidate.fullName} tone="indigo" size="lg" />
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold text-slate-900">{candidate.fullName}</h1>
              <Badge tone={candidate.isActive ? 'green' : 'rose'}>
                {candidate.isActive ? 'Active' : 'Deactivated'}
              </Badge>
              {candidate.role !== 'candidate' && (
                <Badge tone="violet">
                  {{ lead: 'Course lead', trainer: 'Trainer', admin: 'Administrator' }[candidate.role]}
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-slate-600">{candidate.email}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              Joined {formatDate(candidate.createdAt)} · last active{' '}
              {formatDate(summary.lastActive)}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile accent="indigo" label="Courses" value={summary.courses} hint="enrolled on" />
        <Tile
          accent="violet"
          label="Topics allotted"
          value={summary.topicsAllotted}
          hint="released to them"
        />
        <Tile
          accent="sky"
          label="Quizzes done"
          value={summary.quizzesDone}
          hint={
            summary.attempts > summary.quizzesDone
              ? `${plural(summary.attempts, 'attempt')} in all`
              : 'one attempt each'
          }
        />
        <Tile
          accent={summary.averageScore === null ? 'amber' : 'emerald'}
          label="Average"
          value={summary.averageScore === null ? '—' : `${summary.averageScore}%`}
          hint="latest attempt per quiz"
        />
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-slate-900">Courses</h2>
        <div className="mt-4">
          <CourseTable courses={candidate.courses} />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-slate-900">Quiz attempts</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Every attempt, newest first. Only the latest per quiz counts towards the average — the
          earlier ones are kept so a retake never hides what came before it.
        </p>
        <div className="mt-4">
          <AttemptTable attempts={candidate.attempts} />
        </div>
      </section>
    </div>
  );
}

const BackLink = () => (
  <Link to="/admin" className="text-sm text-indigo-600 hover:text-indigo-700">
    ← Administration
  </Link>
);

function Tile({ label, value, hint, accent }) {
  const colour = {
    indigo: 'text-indigo-700',
    violet: 'text-violet-700',
    sky: 'text-sky-700',
    emerald: 'text-emerald-700',
    amber: 'text-amber-700',
  }[accent];

  return (
    <Card accent={accent}>
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-1 text-3xl font-semibold ${colour}`}>{value}</p>
      <p className="mt-1.5 text-xs text-slate-500">{hint}</p>
    </Card>
  );
}

function CourseTable({ courses }) {
  if (courses.length === 0) return <Empty>Not enrolled on any course yet.</Empty>;

  return (
    <Table
      headers={[
        { label: 'Course' },
        { label: 'Lead' },
        { label: 'Topics', align: 'right' },
        { label: 'Quizzes', align: 'right' },
        { label: 'Progress' },
        { label: 'Due' },
      ]}
    >
      {courses.map((course) => (
        <Row key={course.id}>
          <Cell>
            <span className="flex items-baseline gap-1.5">
              <span className="text-xs font-semibold tracking-wide text-indigo-600">
                {course.code}
              </span>
              <span className="text-xs text-slate-400">v{course.version}</span>
            </span>
            <span className="font-medium text-slate-900">{course.title}</span>
            {course.status === 'pending' && (
              <span className="ml-2">
                <Badge tone="amber">Awaiting approval</Badge>
              </span>
            )}
          </Cell>
          <Cell className="text-slate-700">{course.trainer?.fullName ?? '—'}</Cell>
          <Cell align="right" className="text-slate-700">
            {course.topicsAllotted}
            <span className="text-xs text-slate-400"> / {course.topics}</span>
          </Cell>
          <Cell align="right" className="text-slate-700">
            {course.quizzesDone}
          </Cell>
          <Cell className="whitespace-nowrap text-xs text-slate-500">
            {/* Three ways an enrolment can already have ended, and they are not
                the same thing: finished it, moved to a later edition, or
                stopped. A record that showed only "not started" for the last
                two would misrepresent what happened. */}
            {course.completedAt ? (
              <Badge tone="green">Finished {formatDate(course.completedAt)}</Badge>
            ) : course.discontinuedAt ? (
              <Badge tone="rose">Stopped {formatDate(course.discontinuedAt)}</Badge>
            ) : course.supersededAt ? (
              <Badge tone="slate">Moved on {formatDate(course.supersededAt)}</Badge>
            ) : course.pausedAt ? (
              <Badge tone="amber">Paused {formatDate(course.pausedAt)}</Badge>
            ) : course.startedAt ? (
              <>Started {formatDate(course.startedAt)}</>
            ) : (
              <span className="text-slate-400">Not started</span>
            )}
          </Cell>

          <Cell className="whitespace-nowrap text-xs">
            <DueDate course={course} />
          </Cell>
        </Row>
      ))}
    </Table>
  );
}

function AttemptTable({ attempts }) {
  if (attempts.length === 0) return <Empty>No quizzes attempted yet.</Empty>;

  return (
    <Table
      headers={[
        { label: 'Quiz' },
        { label: 'Attempt', align: 'right' },
        { label: 'Score', align: 'right' },
        { label: 'Result', align: 'right' },
        { label: 'Submitted' },
      ]}
    >
      {attempts.map((attempt) => (
        <Row key={attempt.id}>
          <Cell>
            <span className="block font-medium text-slate-900">{attempt.topicTitle}</span>
            <span className="text-xs text-slate-500">
              {attempt.courseCode ? `${attempt.courseCode} · ` : ''}
              {attempt.quizTitle}
            </span>
          </Cell>
          <Cell align="right" className="text-slate-700">
            #{attempt.attemptNumber}
            {!attempt.counts && (
              <span className="ml-1 text-xs text-slate-400">superseded</span>
            )}
          </Cell>
          <Cell align="right" className="text-slate-700">
            {attempt.totalScore}
            <span className="text-xs text-slate-400"> / {attempt.maxScore}</span>
          </Cell>
          <Cell align="right">
            {attempt.percentage === null ? (
              <span className="text-slate-400">—</span>
            ) : (
              <Badge tone={attempt.counts ? toneForScore(attempt.percentage) : 'slate'}>
                {attempt.percentage}%
              </Badge>
            )}
          </Cell>
          <Cell className="whitespace-nowrap text-slate-500">
            {formatDate(attempt.submittedAt)}
          </Cell>
        </Row>
      ))}
    </Table>
  );
}

/**
 * When this candidate is due to finish, and whether that still matters.
 *
 * A deadline on a course somebody has already finished, stopped, or moved off
 * is history, so it is shown plainly. A live one is worth colouring: overdue in
 * rose, close in amber. "Started 27 Aug" on its own says nothing about whether
 * somebody is late, which is usually the question being asked of this page.
 */
function DueDate({ course }) {
  if (!course.dueAt) {
    return (
      <span className="text-slate-400" title="This course has no duration set">
        —
      </span>
    );
  }

  const settled = course.completedAt || course.discontinuedAt || course.supersededAt;
  const days = Math.ceil((new Date(course.dueAt).getTime() - Date.now()) / 86400000);

  if (settled) {
    return <span className="text-slate-400">{formatDate(course.dueAt)}</span>;
  }

  const tone = days < 0 ? 'text-rose-700 font-medium' : days <= 7 ? 'text-amber-700' : 'text-slate-600';

  return (
    <span className={tone}>
      {formatDate(course.dueAt)}
      <span className="ml-1 text-slate-400">
        {days < 0
          ? `· ${-days}d over`
          : days === 0
            ? '· today'
            : `· ${days}d left`}
      </span>
    </span>
  );
}
