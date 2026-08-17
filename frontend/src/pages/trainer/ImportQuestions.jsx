import { useRef, useState } from 'react';
import { api, apiUpload } from '../../lib/api';
import { Alert, Badge, Button, Empty } from '../../components/ui';

const TEMPLATE = `1. Which document formally authorises a project?
*A) Project charter
B) Work breakdown structure
C) Risk register
Marks: 2

2. Which of these belong in a project charter?
A. High-level objectives
B. Named sponsor
C. Detailed Gantt chart
Answer: A, B`;

export default function ImportQuestions({ quizId, onImported, onError }) {
  const fileInput = useRef(null);
  const [open, setOpen] = useState(false);
  const [showFormat, setShowFormat] = useState(false);
  const [parsed, setParsed] = useState(null);
  const [chosen, setChosen] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);

  function reset() {
    setParsed(null);
    setChosen(new Set());
    setProblem(null);
    if (fileInput.current) fileInput.current.value = '';
  }

  async function handleFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setBusy(true);
    setProblem(null);
    try {
      const data = new FormData();
      data.append('file', file);
      const result = await apiUpload(`/quizzes/${quizId}/import`, data);

      setParsed(result);
      // Pre-select only the ones that can actually be saved.
      setChosen(
        new Set(result.questions.map((q, i) => (q.issues.length === 0 ? i : null)).filter((i) => i !== null)),
      );
    } catch (err) {
      setProblem(err.message);
      setParsed(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleImport() {
    const questions = [...chosen]
      .sort((a, b) => a - b)
      .map((index) => {
        const { prompt, marks, options } = parsed.questions[index];
        return { prompt, marks, options: options.map(({ label, isCorrect }) => ({ label, isCorrect })) };
      });

    setBusy(true);
    try {
      await api(`/quizzes/${quizId}/questions/bulk`, { method: 'POST', body: { questions } });
      reset();
      setOpen(false);
      await onImported();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 text-sm text-slate-500 hover:text-slate-900"
      >
        ⭳ Import questions from a PDF or Word file
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-lg border border-slate-300 bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-900">Import from a document</p>
          <p className="mt-0.5 text-xs text-slate-500">
            PDF or Word (.docx), up to 10 MB. Nothing is saved until you review the result.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className="text-sm text-slate-500 hover:text-slate-900"
        >
          Close
        </button>
      </div>

      <button
        type="button"
        onClick={() => setShowFormat((s) => !s)}
        className="mt-3 text-xs font-medium text-slate-600 underline"
      >
        {showFormat ? 'Hide' : 'Show'} the format your document must follow
      </button>

      {showFormat && (
        <div className="mt-2">
          <pre className="overflow-x-auto rounded-lg border border-slate-200 bg-white p-3 text-xs leading-relaxed text-slate-700">
            {TEMPLATE}
          </pre>
          <ul className="mt-2 space-y-0.5 text-xs text-slate-500">
            <li>· Questions start with a number or “Q”.</li>
            <li>· Mark correct options with a leading *, a trailing (correct) or [x], or an “Answer:” line.</li>
            <li>· “Marks:” is optional and defaults to 1.</li>
            <li>· Tick two or more options to make a question multi-answer.</li>
          </ul>
        </div>
      )}

      <Alert>{problem}</Alert>

      {!parsed && (
        <input
          ref={fileInput}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={handleFile}
          disabled={busy}
          className="mt-3 block w-full text-sm text-slate-600 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-violet-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-violet-700"
        />
      )}

      {busy && !parsed && <p className="mt-3 text-sm text-slate-500">Reading document…</p>}

      {parsed && (
        <div className="mt-4">
          <p className="text-sm text-slate-700">
            Found <span className="font-medium">{parsed.summary.found}</span> question
            {parsed.summary.found === 1 ? '' : 's'} in{' '}
            <span className="font-medium">{parsed.summary.sourceFilename}</span> ·{' '}
            {parsed.summary.importable} ready to import
          </p>

          {parsed.questions.length === 0 ? (
            <div className="mt-3">
              <Empty>
                No questions matched the expected format. Check the format guide above and try
                again.
              </Empty>
            </div>
          ) : (
            <div className="mt-3 max-h-96 space-y-2 overflow-y-auto pr-1">
              {parsed.questions.map((question, index) => {
                const broken = question.issues.length > 0;
                return (
                  <div
                    key={index}
                    className={`rounded-lg border bg-white p-3 ${
                      broken ? 'border-red-200' : 'border-slate-200'
                    }`}
                  >
                    <label className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        disabled={broken}
                        checked={chosen.has(index)}
                        onChange={(e) =>
                          setChosen((current) => {
                            const next = new Set(current);
                            if (e.target.checked) next.add(index);
                            else next.delete(index);
                            return next;
                          })
                        }
                        className="mt-1 shrink-0 rounded border-slate-300"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <Badge tone={question.type === 'mcq_multi' ? 'violet' : 'indigo'}>
                            {question.type === 'mcq_multi' ? 'Multiple answers' : 'Single answer'}
                          </Badge>
                          <span className="text-xs text-slate-500">
                            {question.marks} mark{question.marks === 1 ? '' : 's'}
                          </span>
                        </span>
                        <span className="mt-1 block text-sm font-medium text-slate-900">
                          {question.prompt}
                        </span>
                      </span>
                    </label>

                    <ul className="mt-2 space-y-0.5 pl-6">
                      {question.options.map((option, i) => (
                        <li
                          key={i}
                          className={`flex gap-2 rounded px-2 py-0.5 text-sm ${
                            option.isCorrect ? 'bg-emerald-50 text-emerald-900' : 'text-slate-600'
                          }`}
                        >
                          <span aria-hidden className="w-3 text-center">
                            {option.isCorrect ? '✓' : '·'}
                          </span>
                          {option.label}
                        </li>
                      ))}
                    </ul>

                    {broken && (
                      <ul className="mt-2 space-y-0.5 pl-6">
                        {question.issues.map((issue) => (
                          <li key={issue} className="text-xs text-rose-700">
                            ⚠ {issue} — fix it in the document and re-upload, or add this one by
                            hand.
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <Button onClick={handleImport} disabled={chosen.size === 0 || busy}>
              {busy ? 'Importing…' : `Import ${chosen.size} question${chosen.size === 1 ? '' : 's'}`}
            </Button>
            <Button variant="secondary" onClick={reset}>
              Choose another file
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
