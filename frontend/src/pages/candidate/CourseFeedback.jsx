import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Alert, Button, Card, Textarea } from '../../components/ui';

const LABELS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

/**
 * What a candidate is asked to rate.
 *
 * Overall is required and the other two are not: a candidate with a view on
 * the course as a whole but none on its length should be able to say so and
 * leave. Each carries its own question, because "rate the duration" invites
 * "long or short?" while "was it the right length" has an answer.
 */
const ITEMS = [
  {
    key: 'rating',
    label: 'Overall',
    hint: 'The course as a whole',
    required: true,
  },
  {
    key: 'contentRating',
    label: 'Content',
    hint: 'Was the material clear and useful?',
  },
  {
    key: 'durationRating',
    label: 'Duration',
    hint: 'Was the course the right length?',
  },
];

/**
 * A candidate's rating and comments on a course.
 *
 * One entry per course, editable afterwards — feedback is a current opinion,
 * not a thread, so re-submitting replaces rather than appends.
 */
export default function CourseFeedback({ courseId, courseTitle }) {
  const [existing, setExisting] = useState(null);
  const [editing, setEditing] = useState(false);
  const [scores, setScores] = useState({ rating: 0, contentRating: 0, durationRating: 0 });
  // Which star is under the cursor, and on which row — one object, so hovering
  // Content cannot light up Duration.
  const [hovered, setHovered] = useState({ key: null, star: 0 });
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
        setScores({
          rating: feedback?.rating ?? 0,
          contentRating: feedback?.contentRating ?? 0,
          durationRating: feedback?.durationRating ?? 0,
        });
        setComment(feedback?.comment ?? '');
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [courseId]);

  async function save(event) {
    event.preventDefault();
    if (scores.rating === 0) return setError('Give the course an overall rating from 1 to 5.');

    setBusy(true);
    setError(null);
    try {
      const { feedback } = await api(`/learn/courses/${courseId}/feedback`, {
        method: 'PUT',
        body: {
          rating: scores.rating,
          // Zero means "not rated", which is null to the API — it is not a
          // score, and sending it as one would put every unrated dimension at
          // the bottom of the lead's averages.
          contentRating: scores.contentRating || null,
          durationRating: scores.durationRating || null,
          comment: comment.trim() || undefined,
        },
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
      setScores({ rating: 0, contentRating: 0, durationRating: 0 });
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
          <div className="space-y-4">
            {ITEMS.map((item) => (
              <StarRow
                key={item.key}
                item={item}
                value={scores[item.key]}
                hovered={hovered.key === item.key ? hovered.star : 0}
                onHover={(star) => setHovered({ key: item.key, star })}
                onLeave={() => setHovered({ key: null, star: 0 })}
                onPick={(star) =>
                  setScores((current) => ({
                    ...current,
                    // Clicking the star you already gave takes it back off,
                    // which is the only way to unset an optional rating.
                    [item.key]: !item.required && current[item.key] === star ? 0 : star,
                  }))
                }
              />
            ))}
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
                  setScores({
                    rating: existing.rating,
                    contentRating: existing.contentRating ?? 0,
                    durationRating: existing.durationRating ?? 0,
                  });
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
          {/* Read back the same three rows you filled in, minus any you
              skipped — showing an empty row would read as a zero. */}
          <div className="space-y-2">
            {ITEMS.filter((item) => existing[item.key]).map((item) => (
              <div key={item.key} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="w-24 shrink-0 text-sm text-slate-500">{item.label}</span>
                <span className="text-xl leading-none tracking-wider text-amber-400" aria-hidden>
                  {'★'.repeat(existing[item.key])}
                  <span className="text-slate-300">{'★'.repeat(5 - existing[item.key])}</span>
                </span>
                <span className="text-xs text-slate-600">{LABELS[existing[item.key]]}</span>
              </div>
            ))}
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

/**
 * One rateable thing: its name, what it means, and five stars.
 *
 * The label sits beside the stars rather than above them so three rows read as
 * one question with three parts, not three separate forms.
 */
function StarRow({ item, value, hovered, onHover, onLeave, onPick }) {
  const shown = hovered || value;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <span className="w-24 shrink-0">
        <span className="block text-sm font-medium text-slate-700">
          {item.label}
          {!item.required && <span className="ml-1 text-xs text-slate-400">optional</span>}
        </span>
      </span>

      <span className="flex items-center gap-1" onMouseLeave={onLeave}>
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onPick(star)}
            onMouseEnter={() => onHover(star)}
            aria-label={`${item.label}: ${star} out of 5 — ${LABELS[star]}`}
            aria-pressed={value === star}
            className={`text-2xl leading-none transition ${
              star <= shown ? 'text-amber-400' : 'text-slate-300 hover:text-amber-200'
            }`}
          >
            ★
          </button>
        ))}
      </span>

      {/* The word, or the question it answers while still unrated. */}
      <span className="text-xs text-slate-500">
        {shown > 0 ? LABELS[shown] : item.hint}
      </span>
    </div>
  );
}
