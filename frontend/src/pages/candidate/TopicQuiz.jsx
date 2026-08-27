import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Alert, Badge, Button, Card, Empty, toneForScore } from '../../components/ui';
import AttemptReview from '../../components/AttemptReview';

export default function TopicQuiz({ topicId, onScored }) {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [taking, setTaking] = useState(false);
  const [selections, setSelections] = useState({});
  const [result, setResult] = useState(null);
  const [reviewing, setReviewing] = useState(null);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setState(await api(`/learn/topics/${topicId}/quiz`));
    } catch (err) {
      // 404 simply means no published quiz for this topic.
      if (err.status !== 404) setError(err.message);
      setState(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setTaking(false);
    setResult(null);
    setReviewing(null);
    setSelections({});
    setError(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicId]);

  if (loading) {
    return (
      <Card>
        <p className="text-sm text-slate-500">Loading quiz…</p>
      </Card>
    );
  }

  if (!state) {
    return (
      <Card className="border-dashed bg-slate-50/50">
        <p className="text-sm text-slate-500">
          No quiz has been published for this topic yet.
        </p>
      </Card>
    );
  }

  const { quiz, attempts, attemptsLeft, canAttempt } = state;

  if (reviewing) {
    return <AttemptReview attemptId={reviewing} onClose={() => setReviewing(null)} />;
  }

  function toggleOption(question, optionId) {
    setSelections((current) => {
      const picked = current[question.id] ?? [];

      if (question.type === 'mcq_single') {
        return { ...current, [question.id]: [optionId] };
      }
      return {
        ...current,
        [question.id]: picked.includes(optionId)
          ? picked.filter((id) => id !== optionId)
          : [...picked, optionId],
      };
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);

    const answers = quiz.questions.map((q) => ({
      questionId: q.id,
      optionIds: selections[q.id] ?? [],
    }));

    setSubmitting(true);
    try {
      const outcome = await api(`/learn/topics/${topicId}/quiz/attempts`, {
        method: 'POST',
        body: { answers },
      });
      setResult(outcome);
      setTaking(false);
      setSelections({});
      await load();
      onScored?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  // ---------------------------------------------------------- result view

  if (result) {
    const { attempt, breakdown } = result;
    return (
      <Card accent={attempt.percentage >= 80 ? 'emerald' : attempt.percentage >= 50 ? 'amber' : 'rose'}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-900">Attempt {attempt.attemptNumber} scored</h3>
            <p className="mt-1 text-sm text-slate-500">
              {attempt.totalScore} of {attempt.maxScore} marks
            </p>
          </div>
          <Badge tone={toneForScore(attempt.percentage)}>{attempt.percentage}%</Badge>
        </div>

        <ul className="mt-4 space-y-2">
          {breakdown.map((item, index) => (
            <li
              key={item.questionId}
              className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
                item.isCorrect ? 'bg-emerald-50 text-emerald-900' : 'bg-rose-50 text-rose-900'
              }`}
            >
              <span aria-hidden className="mt-0.5">
                {item.isCorrect ? '✓' : '✕'}
              </span>
              <span className="flex-1">
                <span className="text-xs opacity-70">Q{index + 1}</span> {item.prompt}
              </span>
              <span className="shrink-0 text-xs">
                {item.awardedMarks}/{item.marks}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => setReviewing(attempt.id)}>View correct answers</Button>
          <Button variant="secondary" onClick={() => setResult(null)}>
            Done
          </Button>
          {canAttempt && (
            <Button
              variant="secondary"
              onClick={() => {
                setResult(null);
                setTaking(true);
              }}
            >
              Try again
            </Button>
          )}
        </div>
      </Card>
    );
  }

  // ----------------------------------------------------------- taking view

  if (taking) {
    const answeredCount = quiz.questions.filter((q) => (selections[q.id] ?? []).length > 0).length;

    return (
      <Card accent="indigo">
        <h3 className="font-semibold text-slate-900">{quiz.title}</h3>
        <p className="mt-1 text-sm text-slate-500">
          {quiz.questions.length} questions · {quiz.totalMarks} marks
        </p>

        <Alert>{error}</Alert>

        <form onSubmit={handleSubmit} className="mt-4 space-y-5">
          {quiz.questions.map((question, index) => {
            const picked = selections[question.id] ?? [];
            const multi = question.type === 'mcq_multi';

            return (
              <fieldset key={question.id} className="rounded-lg border border-slate-200 p-4">
                <legend className="px-1 text-xs text-slate-400">
                  Q{index + 1} · {question.marks} mark{question.marks === 1 ? '' : 's'}
                  {multi && ' · select all that apply'}
                </legend>

                <p className="text-sm font-medium text-slate-900">{question.prompt}</p>

                <div className="mt-3 space-y-1.5">
                  {question.options.map((option) => (
                    <label
                      key={option.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      <input
                        type={multi ? 'checkbox' : 'radio'}
                        name={question.id}
                        checked={picked.includes(option.id)}
                        onChange={() => toggleOption(question, option.id)}
                        className="shrink-0 border-slate-300"
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            );
          })}

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit answers'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setTaking(false)}>
              Cancel
            </Button>
            <span className="text-xs text-slate-500">
              {answeredCount} of {quiz.questions.length} answered
            </span>
          </div>
        </form>
      </Card>
    );
  }

  // ---------------------------------------------------------- summary view

  const best = attempts.length > 0 ? attempts[0] : null;

  return (
    <Card accent="violet">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900">{quiz.title}</h3>
          <p className="mt-1 text-sm text-slate-500">
            {quiz.questions.length} questions · {quiz.totalMarks} marks
            {attemptsLeft !== null && ` · ${attemptsLeft} attempts left`}
          </p>
        </div>
        {best && (
          <Badge tone={toneForScore(Number(best.percentage))}>
            Latest {Number(best.percentage)}%
          </Badge>
        )}
      </div>

      <Alert>{error}</Alert>

      {attempts.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {attempts.map((attempt) => (
            <li
              key={attempt.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <span className="text-slate-700">Attempt {attempt.attemptNumber}</span>
              <span className="flex items-center gap-3">
                <span className="text-slate-500">
                  {attempt.totalScore}/{attempt.maxScore} · {Number(attempt.percentage)}%
                </span>
                <button
                  onClick={() => setReviewing(attempt.id)}
                  className="text-slate-600 underline hover:text-slate-900"
                >
                  View answers
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4">
        {canAttempt ? (
          <Button onClick={() => setTaking(true)}>
            {attempts.length > 0 ? 'Retake quiz' : 'Start quiz'}
          </Button>
        ) : (
          <Empty>You have used all your attempts for this quiz.</Empty>
        )}
      </div>
    </Card>
  );
}
