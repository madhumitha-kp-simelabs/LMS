import { useState } from 'react';
import { api } from '../lib/api';
import { Badge, Button } from './ui';

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * A lead stopping and starting one candidate's clock on one course.
 *
 * The case this exists for is somebody being pulled onto a release or going on
 * leave: they stop logging in, so waiting for them to pause it themselves is
 * waiting for the person who has gone quiet. The lead knows, so the lead
 * records it — and their deadline moves by exactly the days lost.
 *
 * Shared by the per-course progress tab and the cross-course page, because a
 * lead should not have to learn where the control lives twice.
 */
export default function PauseCandidate({ courseId, candidate, onChanged, onError }) {
  const [busy, setBusy] = useState(false);

  const paused = Boolean(candidate.pausedAt);
  // Nothing left to protect on a course already finished or left behind.
  const settled = candidate.completedAt || candidate.discontinuedAt || candidate.supersededAt;

  async function act(what) {
    setBusy(true);
    onError?.(null);
    try {
      await api(`/courses/${courseId}/candidates/${candidate.id}/${what}`, { method: 'POST' });
      await onChanged();
    } catch (err) {
      onError?.(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
      {candidate.dueAt ? (
        <span className="text-slate-500">
          Due <span className="font-medium text-slate-700">{formatDate(candidate.dueAt)}</span>
        </span>
      ) : (
        <span className="text-slate-400" title="This course has no duration set">
          No deadline
        </span>
      )}

      {paused && (
        <Badge tone="slate">Paused since {formatDate(candidate.pausedAt)}</Badge>
      )}

      {candidate.pausedDays > 0 && (
        <span className="text-slate-500">
          {plural(candidate.pausedDays, 'day')} paused so far
        </span>
      )}

      {!settled &&
        (paused ? (
          <Button size="sm" disabled={busy} onClick={() => act('resume')}>
            {busy ? 'Resuming…' : 'Resume'}
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => act('pause')}
            title="On a project or on leave? Their deadline moves by the days they lose."
          >
            {busy ? 'Pausing…' : 'Pause'}
          </Button>
        ))}
    </div>
  );
}
