import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { Alert, Badge, Button, Card, Empty, toneForScore } from '../../components/ui';

const formatDate = (value) =>
  new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

export default function CandidateHome() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api('/learn/progress'), api('/learn/my-courses')])
      .then(([progress, catalogue]) => setData({ progress, catalogue }))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;

  const firstName = user.fullName.split(' ')[0];

  if (error) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Welcome back, {firstName}</h1>
        <div className="mt-4">
          <Alert>{error}</Alert>
        </div>
      </div>
    );
  }

  const courses = data.progress.courses;
  const topicsByCourse = data.catalogue.courses;

  if (courses.length === 0) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Welcome back, {firstName}</h1>
        <div className="mt-6">
          <Empty>
            Nothing has been allotted to you yet. Your trainer will share course material when
            it&apos;s ready.
          </Empty>
        </div>
      </div>
    );
  }

  const allTopics = courses.flatMap((c) => c.topics.map((t) => ({ ...t, course: c })));
  const materialCount = topicsByCourse
    .flatMap((c) => c.topics)
    .reduce((sum, t) => sum + t.materialCount, 0);

  const quizzesAvailable = allTopics.filter((t) => t.hasQuiz).length;
  const quizzesDone = allTopics.filter((t) => t.latest).length;

  // Marks-weighted across every course, so a longer quiz counts for more.
  const earned = courses.reduce((sum, c) => sum + c.summary.marksEarned, 0);
  const possible = courses.reduce((sum, c) => sum + c.summary.marksPossible, 0);
  const overall = possible === 0 ? null : Math.round((earned / possible) * 1000) / 10;

  // What to do next: the first topic in order with a quiz not yet attempted.
  const nextUp = allTopics.find((t) => t.hasQuiz && !t.latest) ?? null;

  const recent = allTopics
    .filter((t) => t.latest)
    .sort((a, b) => new Date(b.latest.submittedAt) - new Date(a.latest.submittedAt))
    .slice(0, 4);

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">Welcome back, {firstName}</h1>
      <p className="mt-1 text-sm text-slate-500">
        {quizzesDone === quizzesAvailable && quizzesAvailable > 0
          ? 'You’re up to date on every quiz allotted to you.'
          : `You have ${quizzesAvailable - quizzesDone} quiz${
              quizzesAvailable - quizzesDone === 1 ? '' : 'zes'
            } left to take.`}
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          accent="indigo"
          label="Overall score"
          value={overall === null ? '—' : `${overall}%`}
          hint={possible === 0 ? 'No quizzes taken yet' : `${earned} of ${possible} marks`}
        />
        <Tile
          accent="violet"
          label="Quizzes done"
          value={`${quizzesDone}/${quizzesAvailable}`}
          hint={quizzesAvailable === 0 ? 'None published yet' : 'Across all courses'}
        />
        <Tile
          accent="emerald"
          label="Topics allotted"
          value={allTopics.length}
          hint={`In ${courses.length} course${courses.length === 1 ? '' : 's'}`}
        />
        <Tile accent="sky" label="Files to read" value={materialCount} hint="Slides and documents" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card accent="indigo">
          <h2 className="font-semibold text-slate-900">
            {nextUp ? 'Up next' : 'Keep going'}
          </h2>

          {nextUp ? (
            <>
              <p className="mt-3 text-base font-semibold tracking-wide text-indigo-600">
                {nextUp.course.code}
              </p>
              <p className="text-sm font-medium text-slate-900">
                <span className="text-slate-400">{nextUp.position}.</span> {nextUp.title}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                You haven&apos;t taken this quiz yet.
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm text-slate-500">
              {quizzesAvailable === 0
                ? 'No quizzes have been published for your topics yet. Read the material in the meantime.'
                : 'Every quiz allotted to you has been attempted. You can retake any of them to improve your score.'}
            </p>
          )}

          <Link to="/my-courses">
            <Button className="mt-4">{nextUp ? 'Go to the quiz' : 'Browse my courses'}</Button>
          </Link>
        </Card>

        <Card accent="emerald">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Recent results</h2>
            <Link to="/my-progress" className="text-sm text-indigo-600 hover:text-indigo-700">
              See all
            </Link>
          </div>

          {recent.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              Your scores will appear here once you take a quiz.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {recent.map((topic) => (
                <li
                  key={topic.topicId}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-slate-800">{topic.title}</span>
                    <span className="text-xs text-slate-500">
                      {topic.attemptCount} attempt{topic.attemptCount === 1 ? '' : 's'} ·{' '}
                      {formatDate(topic.latest.submittedAt)}
                    </span>
                  </span>
                  <Badge tone={toneForScore(topic.latest.percentage)}>
                    {topic.latest.percentage}%
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-6 space-y-5">
        {courses.map((course) => (
          <div key={course.id}>
            <p className="text-base font-semibold tracking-wide text-indigo-600">{course.code}</p>
            <h2 className="mb-2 font-semibold text-slate-900">{course.title}</h2>

            <div className="grid gap-2 sm:grid-cols-2">
              {course.topics.map((topic) => (
                <Link key={topic.topicId} to="/my-courses">
                  <div className="flex h-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 transition hover:border-slate-400">
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-slate-800">
                        <span className="text-slate-400">{topic.position}.</span> {topic.title}
                      </span>
                      <span className="text-xs text-slate-500">
                        {!topic.hasQuiz
                          ? 'No quiz yet'
                          : topic.latest
                            ? `Scored ${topic.latest.percentage}%`
                            : 'Quiz not taken'}
                      </span>
                    </span>
                    {topic.hasQuiz && !topic.latest && <Badge tone="amber">To do</Badge>}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Tile({ label, value, hint, accent }) {
  const valueColour = {
    indigo: 'text-indigo-700',
    violet: 'text-violet-700',
    emerald: 'text-emerald-700',
    sky: 'text-sky-700',
  }[accent];

  return (
    <Card accent={accent}>
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${valueColour}`}>{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </Card>
  );
}
