import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Alert, Badge, Button, Card, toneForScore } from './ui';

/**
 * The answer key for one submitted attempt.
 *
 * Every option is shown with two independent signals — what was picked, and
 * what was actually correct — so a wrong answer explains itself rather than
 * just being marked wrong. That is the whole reason a trainer opens this: a
 * score says 40%, this says which four questions it went on.
 *
 * One component for both sides. A candidate reads their own attempt through
 * /learn; staff read anyone's on their course through /quizzes. The wording
 * follows: "you chose this" for the candidate, "they chose this" for staff,
 * since second person about a third party reads as an accusation.
 */
export default function AttemptReview({ attemptId, onClose, staff = false }) {
  const [review, setReview] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setReview(null);
    api(`${staff ? '/quizzes' : '/learn'}/attempts/${attemptId}/review`)
      .then(setReview)
      .catch((err) => setError(err.message));
  }, [attemptId, staff]);

  if (error) {
    return (
      <Card>
        <Alert>{error}</Alert>
        <Button variant="secondary" onClick={onClose} className="mt-3">
          Back
        </Button>
      </Card>
    );
  }

  if (!review) {
    return (
      <Card>
        <p className="text-sm text-slate-500">Loading answers…</p>
      </Card>
    );
  }

  const { attempt, questions } = review;

  return (
    <Card accent="violet">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900">
            {staff && attempt.candidate ? `${attempt.candidate.fullName} — ` : ''}
            {attempt.topicTitle}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Attempt {attempt.attemptNumber} · {attempt.totalScore} of {attempt.maxScore} marks
          </p>
        </div>
        <Badge tone={toneForScore(attempt.percentage)}>{attempt.percentage}%</Badge>
      </div>

      <div className="mt-4 space-y-4">
        {questions.map((question, index) => (
          <div
            key={question.id}
            className={`rounded-lg border p-4 ${
              question.isCorrect
                ? 'border-emerald-200'
                : question.answered === false
                  ? 'border-amber-200'
                  : 'border-red-200'
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-400">Q{index + 1}</span>
              {/* Left blank is not the same as got it wrong — one is a gap in
                  knowledge, the other can be running out of time, and a trainer
                  reading a low score needs to tell them apart. */}
              <Badge
                tone={question.isCorrect ? 'green' : question.answered === false ? 'amber' : 'rose'}
              >
                {question.isCorrect
                  ? 'Correct'
                  : question.answered === false
                    ? 'Not answered'
                    : 'Incorrect'}
              </Badge>
              <span className="text-xs text-slate-500">
                {question.awardedMarks}/{question.marks} marks
              </span>
              {question.type === 'mcq_multi' && (
                <span className="text-xs text-slate-500">· select all that apply</span>
              )}
            </div>

            <p className="mt-1.5 text-sm font-medium text-slate-900">{question.prompt}</p>

            <ul className="mt-3 space-y-1.5">
              {question.options.map((option) => (
                <OptionRow key={option.id} option={option} staff={staff} />
              ))}
            </ul>

            {!question.isCorrect && question.type === 'mcq_multi' && (
              <p className="mt-2 text-xs text-slate-500">
                Every correct option must be selected, and no incorrect ones, to earn the marks.
              </p>
            )}
          </div>
        ))}
      </div>

      <Button variant="secondary" onClick={onClose} className="mt-4">
        Back
      </Button>
    </Card>
  );
}

function OptionRow({ option, staff }) {
  const { isCorrect, selected, label } = option;
  const who = staff ? 'they' : 'you';

  // Four states, each labelled in words — never colour alone.
  const state = isCorrect
    ? selected
      ? { tone: 'bg-emerald-50 text-emerald-900', mark: '✓', note: `Correct — ${who} chose this` }
      : {
          tone: 'bg-emerald-50/60 text-emerald-900',
          mark: '✓',
          note: `Correct — ${who} missed this`,
        }
    : selected
      ? { tone: 'bg-rose-50 text-rose-900', mark: '✕', note: `Wrong — ${who} chose this` }
      : { tone: 'text-slate-600', mark: '·', note: null };

  return (
    <li className={`flex items-start gap-2 rounded px-2 py-1.5 text-sm ${state.tone}`}>
      <span aria-hidden className="w-4 shrink-0 text-center">
        {state.mark}
      </span>
      <span className="flex-1">
        {label}
        {state.note && <span className="ml-2 text-xs opacity-75">({state.note})</span>}
      </span>
    </li>
  );
}
