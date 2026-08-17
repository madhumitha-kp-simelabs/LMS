import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Alert, Button, Card, Textarea } from '../../components/ui';

const LABELS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

/**
 * A candidate's rating and comments on a course.
 *
 * One entry per course, editable afterwards — feedback is a current opinion,
 * not a thread, so re-submitting replaces rather than appends.
 */
export default function CourseFeedback({ courseId, courseTitle }) {
  const [existing, setExisting] = useState(null);
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setEditing(false);
    setError(null);

    api(`/learn/courses/${courseId}/feedback`)
      .then(({ feedback }) => {
        setExisting(feedback);
        setRating(feedback?.rating ?? 0);
        setComment(feedback?.comment ?? '');
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [courseId]);

  async function save(event) {
    event.preventDefault();
    if (rating === 0) return setError('Choose a rating from 1 to 5.');

    setBusy(true);
    setError(null);
    try {
      const { feedback } = await api(`/learn/courses/${courseId}/feedback`, {
        method: 'PUT',
        body: { rating, comment: comment.trim() || undefined },
      });
      setExisting(feedback);
      setEditing(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api(`/learn/courses/${courseId}/feedback`, { method: 'DELETE' });
      setExisting(null);
      setRating(0);
      setComment('');
      setEditing(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return null;

  const showForm = editing || !existing;
  const shown = hovered || rating;

  return (
    <Card accent="amber">
      <h3 className="text-lg font-semibold text-slate-900">Your feedback</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
        How useful was this course? Your trainer sees this, along with your name.
      </p>

      <div className="mt-3">
        <Alert>{error}</Alert>
      </div>

      {showForm ? (
        <form onSubmit={save} className="mt-5 space-y-5">
          <div>
            <span className="mb-2 block text-sm font-medium text-slate-700">Rating</span>
            <div className="flex items-center gap-2" onMouseLeave={() => setHovered(0)}>
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHovered(star)}
                  aria-label={`${star} out of 5 — ${LABELS[star]}`}
                  aria-pressed={rating === star}
                  className={`text-3xl leading-none transition ${
                    star <= shown ? 'text-amber-400' : 'text-slate-300 hover:text-amber-200'
                  }`}
                >
                  ★
                </button>
              ))}
              <span className="ml-2 text-sm text-slate-600">
                {shown > 0 ? LABELS[shown] : 'Not rated yet'}
              </span>
            </div>
          </div>

          <Textarea
            label="Comments (optional)"
            placeholder="What worked well? What was hard to follow?"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />

          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : existing ? 'Update feedback' : 'Send feedback'}
            </Button>
            {existing && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setEditing(false);
                  setRating(existing.rating);
                  setComment(existing.comment ?? '');
                  setError(null);
                }}
              >
                Cancel
              </Button>
            )}
          </div>
        </form>
      ) : (
        <div className="mt-5">
          <div className="flex items-center gap-3">
            <span className="text-2xl leading-none tracking-wider text-amber-400" aria-hidden>
              {'★'.repeat(existing.rating)}
              <span className="text-slate-300">{'★'.repeat(5 - existing.rating)}</span>
            </span>
            <span className="text-sm text-slate-600">{LABELS[existing.rating]}</span>
          </div>

          {existing.comment && (
            <p className="mt-3 whitespace-pre-line rounded-lg bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-700">
              {existing.comment}
            </p>
          )}

          <div className="mt-5 flex gap-2">
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button variant="danger" onClick={remove} disabled={busy}>
              Remove
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
