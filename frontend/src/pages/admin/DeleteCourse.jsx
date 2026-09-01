import { useState } from 'react';
import { api } from '../../lib/api';
import { Alert, Button, Input, Modal } from '../../components/ui';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Deleting a course, and everything underneath it.
 *
 * This is the most destructive thing in the application: it takes the topics,
 * the material, the quizzes, every attempt anybody ever made on them, the
 * projects and the work handed in against them, the enrolments and the
 * feedback. None of it comes back.
 *
 * So the dialog does two things a plain confirm cannot. It asks the server what
 * is actually there and lists it, because "are you sure?" is a question nobody
 * can answer without knowing what is at stake. And when there is anything to
 * lose, it makes you type the course code — the pause is the point, and it also
 * means a mis-click on the wrong row is caught by the code not matching.
 *
 * An empty course skips the typing. Guarding a course with nothing in it as
 * heavily as one with a cohort's results teaches people to type past the
 * warning without reading it.
 */
export default function DeleteCourse({ course, onDeleted, onError }) {
  const [open, setOpen] = useState(false);
  const [impact, setImpact] = useState(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function start() {
    setError(null);
    setTyped('');
    setImpact(null);
    setOpen(true);
    try {
      setImpact(await api(`/courses/${course.id}/impact`));
    } catch (err) {
      setError(err.message);
    }
  }

  function close() {
    if (busy) return;
    setOpen(false);
    setError(null);
    setTyped('');
  }

  async function confirm(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { files } = await api(`/courses/${course.id}`, { method: 'DELETE' });
      setOpen(false);
      await onDeleted(course, files);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // What is actually at stake, in the order somebody would care about it.
  const losses = impact
    ? [
        [impact.candidates, 'candidate enrolment'],
        [impact.attempts, 'quiz attempt'],
        [impact.submissions, 'handed-in submission'],
        [impact.topics, 'topic'],
        [impact.materials, 'file'],
        [impact.projects, 'project'],
      ].filter(([count]) => count > 0)
    : [];

  // Typing is asked for only when something would be lost.
  const grave = losses.length > 0;
  const ready = impact && (!grave || typed.trim().toUpperCase() === course.code.toUpperCase());

  return (
    <>
      <Button variant="danger" size="sm" onClick={start}>
        Delete
      </Button>

      <Modal open={open} title={`Delete ${course.code} v${course.version}?`} onClose={close}>
        <form onSubmit={confirm} className="space-y-4">
          <p className="text-sm text-slate-600">{course.title}</p>

          <Alert>{error}</Alert>

          {!impact && !error ? (
            <p className="text-sm text-slate-500">Checking what is on this course…</p>
          ) : (
            impact && (
              <>
                {grave ? (
                  <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-3">
                    <p className="text-sm font-medium text-rose-900">
                      This permanently destroys:
                    </p>
                    <ul className="mt-1.5 space-y-0.5 text-sm text-rose-800">
                      {losses.map(([count, noun]) => (
                        <li key={noun}>· {plural(count, noun)}</li>
                      ))}
                    </ul>
                    <p className="mt-2 text-sm text-rose-800">
                      Results and uploaded files cannot be recovered.
                    </p>
                  </div>
                ) : (
                  <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                    This course is empty — no topics, candidates or work. Nothing is lost.
                  </p>
                )}

                {grave && (
                  <Input
                    label={`Type ${course.code} to confirm`}
                    autoFocus
                    autoComplete="off"
                    placeholder={course.code}
                    value={typed}
                    onChange={(event) => setTyped(event.target.value)}
                  />
                )}
              </>
            )
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">
            <Button type="button" variant="secondary" disabled={busy} onClick={close}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" disabled={busy || !ready}>
              {busy ? 'Deleting…' : 'Delete course'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
