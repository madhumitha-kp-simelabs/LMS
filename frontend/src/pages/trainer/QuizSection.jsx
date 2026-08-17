import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Alert, Badge, Button, Card, Empty, Input } from '../../components/ui';
import ImportQuestions from './ImportQuestions';

const BLANK_OPTION = { label: '', isCorrect: false };
const blankDraft = () => ({
  prompt: '',
  marks: 1,
  options: [{ ...BLANK_OPTION }, { ...BLANK_OPTION }],
});

export default function QuizSection({ topic, onChanged, onError }) {
  const [quiz, setQuiz] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function loadQuiz(quizId) {
    const { quiz } = await api(`/quizzes/${quizId}`);
    setQuiz(quiz);
  }

  useEffect(() => {
    setLoading(true);
    setQuiz(null);

    if (!topic.quiz) {
      setLoading(false);
      return;
    }

    loadQuiz(topic.quiz.id)
      .catch((err) => onError(err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic.id, topic.quiz?.id]);

  async function handleCreateQuiz() {
    setBusy(true);
    try {
      const { quiz } = await api(`/quizzes/topics/${topic.id}`, { method: 'POST' });
      await loadQuiz(quiz.id);
      await onChanged();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function togglePublished() {
    setBusy(true);
    try {
      await api(`/quizzes/${quiz.id}`, {
        method: 'PATCH',
        body: { isPublished: !quiz.isPublished },
      });
      await loadQuiz(quiz.id);
      await onChanged();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <p className="text-sm text-slate-500">Loading quiz…</p>
      </Card>
    );
  }

  if (!quiz) {
    return (
      <Card accent="violet">
        <h3 className="font-semibold text-slate-900">Quiz</h3>
        <p className="mt-1 text-sm text-slate-500">
          No quiz for this topic yet. Create one, then add the MCQs candidates will answer after
          reading the material.
        </p>
        <Button onClick={handleCreateQuiz} disabled={busy} className="mt-4">
          {busy ? 'Creating…' : 'Create quiz'}
        </Button>
      </Card>
    );
  }

  // The create endpoint returns a bare quiz row; only the GET carries these.
  const questions = quiz.questions ?? [];
  const attempts = quiz._count?.attempts ?? 0;
  const totalMarks = questions.reduce((sum, q) => sum + q.marks, 0);

  return (
    <Card accent="violet">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900">Quiz</h3>
          <p className="mt-1 text-sm text-slate-500">
            {questions.length} question{questions.length === 1 ? '' : 's'} · {totalMarks} mark
            {totalMarks === 1 ? '' : 's'}
            {attempts > 0 && ` · ${attempts} attempts`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge tone={quiz.isPublished ? 'green' : 'amber'}>
            {quiz.isPublished ? 'Published' : 'Draft'}
          </Badge>
          <Button variant="secondary" onClick={togglePublished} disabled={busy}>
            {quiz.isPublished ? 'Unpublish' : 'Publish'}
          </Button>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {questions.length === 0 ? (
          <Empty>No questions yet. Add the first one below.</Empty>
        ) : (
          questions.map((question, index) => (
            <QuestionRow
              key={question.id}
              index={index + 1}
              question={question}
              onChanged={() => loadQuiz(quiz.id).then(onChanged)}
              onError={onError}
            />
          ))
        )}
      </div>

      <QuestionForm
        quizId={quiz.id}
        onSaved={() => loadQuiz(quiz.id).then(onChanged)}
        onError={onError}
      />

      <ImportQuestions
        quizId={quiz.id}
        onImported={() => loadQuiz(quiz.id).then(onChanged)}
        onError={onError}
      />
    </Card>
  );
}

// ------------------------------------------------------------- existing row

function QuestionRow({ index, question, onChanged, onError }) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await api(`/quizzes/questions/${question.id}`, { method: 'DELETE' });
      await onChanged();
    } catch (err) {
      onError(err.message);
      setDeleting(false);
    }
  }

  if (editing) {
    return (
      <div className="rounded-lg border border-slate-900 p-4">
        <QuestionForm
          questionId={question.id}
          initial={{
            prompt: question.prompt,
            marks: question.marks,
            options: question.options.map((o) => ({ label: o.label, isCorrect: o.isCorrect })),
          }}
          onSaved={async () => {
            setEditing(false);
            await onChanged();
          }}
          onCancel={() => setEditing(false)}
          onError={onError}
          inline
        />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400">Q{index}</span>
            <Badge tone={question.type === 'mcq_multi' ? 'violet' : 'indigo'}>
              {question.type === 'mcq_multi' ? 'Multiple answers' : 'Single answer'}
            </Badge>
            <span className="text-xs text-slate-500">
              {question.marks} mark{question.marks === 1 ? '' : 's'}
            </span>
          </div>
          <p className="mt-1.5 text-sm font-medium text-slate-900">{question.prompt}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button variant="danger" onClick={handleDelete} disabled={deleting}>
            {deleting ? '…' : 'Delete'}
          </Button>
        </div>
      </div>

      <ul className="mt-3 space-y-1">
        {question.options.map((option) => (
          <li
            key={option.id}
            className={`flex items-center gap-2 rounded px-2 py-1 text-sm ${
              option.isCorrect ? 'bg-emerald-50 text-emerald-900' : 'text-slate-600'
            }`}
          >
            <span aria-hidden className="w-4 text-center">
              {option.isCorrect ? '✓' : '·'}
            </span>
            {option.label}
          </li>
        ))}
      </ul>

      {question.type === 'mcq_multi' && (
        <p className="mt-2 text-xs text-slate-500">
          All correct options must be selected to earn the marks — no partial credit.
        </p>
      )}
    </div>
  );
}

// ------------------------------------------------------------------- form

function QuestionForm({ quizId, questionId, initial, onSaved, onCancel, onError, inline = false }) {
  const [draft, setDraft] = useState(initial ?? blankDraft());
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState(null);

  const correctCount = draft.options.filter((o) => o.isCorrect).length;

  function setOption(index, patch) {
    setDraft((current) => ({
      ...current,
      options: current.options.map((o, i) => (i === index ? { ...o, ...patch } : o)),
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setProblem(null);

    const options = draft.options
      .map((o) => ({ ...o, label: o.label.trim() }))
      .filter((o) => o.label.length > 0);

    if (options.length < 2) return setProblem('Give the question at least two options.');
    if (!options.some((o) => o.isCorrect)) return setProblem('Tick at least one correct answer.');

    setSaving(true);
    try {
      const body = { prompt: draft.prompt, marks: Number(draft.marks), options };
      if (questionId) {
        await api(`/quizzes/questions/${questionId}`, { method: 'PATCH', body });
      } else {
        await api(`/quizzes/${quizId}/questions`, { method: 'POST', body });
        setDraft(blankDraft());
      }
      await onSaved();
    } catch (err) {
      onError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={inline ? 'space-y-3' : 'mt-4 space-y-3 rounded-lg bg-slate-50 p-4'}
    >
      {!inline && <p className="text-sm font-medium text-slate-700">Add a question</p>}
      <Alert>{problem}</Alert>

      <Input
        label="Question"
        placeholder="Which document formally authorises a project?"
        required
        value={draft.prompt}
        onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
      />

      <div>
        <span className="mb-1 block text-sm font-medium text-slate-700">
          Options — tick every correct answer
        </span>
        <div className="space-y-2">
          {draft.options.map((option, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={option.isCorrect}
                onChange={(e) => setOption(index, { isCorrect: e.target.checked })}
                aria-label={`Option ${index + 1} is correct`}
                className="shrink-0 rounded border-slate-300"
              />
              <input
                value={option.label}
                onChange={(e) => setOption(index, { label: e.target.value })}
                placeholder={`Option ${index + 1}`}
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
              />
              {draft.options.length > 2 && (
                <button
                  type="button"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      options: draft.options.filter((_, i) => i !== index),
                    })
                  }
                  className="shrink-0 px-1 text-slate-400 hover:text-rose-600"
                  aria-label={`Remove option ${index + 1}`}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>

        {draft.options.length < 6 && (
          <button
            type="button"
            onClick={() => setDraft({ ...draft, options: [...draft.options, { ...BLANK_OPTION }] })}
            className="mt-2 text-sm text-slate-500 hover:text-slate-900"
          >
            + Add option
          </button>
        )}

        <p className="mt-2 text-xs text-slate-500">
          {correctCount > 1
            ? 'Multiple answers — the candidate must tick all of them to score.'
            : 'Single answer.'}
        </p>
      </div>

      <div className="flex items-end gap-3">
        <Input
          label="Marks"
          type="number"
          min={1}
          max={100}
          value={draft.marks}
          onChange={(e) => setDraft({ ...draft, marks: e.target.value })}
          className="w-24"
        />
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving…' : questionId ? 'Save changes' : 'Add question'}
        </Button>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
