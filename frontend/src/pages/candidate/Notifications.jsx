import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { Alert, Badge, Button, Card, Empty } from '../../components/ui';

const formatWhen = (value) => {
  const then = new Date(value);
  const days = Math.floor((Date.now() - then.getTime()) / 86400000);
  // Relative while it is recent, absolute once it is not — "14 days ago" is
  // harder to place than a date, and "today" is easier than one.
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return then.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

/**
 * A candidate's inbox.
 *
 * The staff Inbox is a queue of decisions; this is a list of things that have
 * happened. They share a name because to the person reading it the difference
 * does not matter — it is where you look to find out what you missed.
 *
 * A notice that offers an action carries it, rather than sending the reader off
 * to find the screen where it lives. A new edition of a course is news you can
 * act on in one place or not at all.
 */
export default function Notifications() {
  const [notifications, setNotifications] = useState(null);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [moved, setMoved] = useState(null);
  const navigate = useNavigate();

  const load = useCallback(
    () =>
      api('/notifications')
        .then(({ notifications }) => setNotifications(notifications))
        .catch((err) => setError(err.message)),
    [],
  );

  useEffect(() => {
    load();
  }, [load]);

  const recount = () => window.dispatchEvent(new Event('inbox-changed'));

  async function markRead(ids) {
    try {
      await api('/notifications/read', { method: 'POST', body: ids ? { ids } : {} });
      await load();
      recount();
    } catch (err) {
      setError(err.message);
    }
  }

  async function move(notice) {
    if (
      !window.confirm(
        `Move to ${notice.course.code} version ${notice.course.version}?\n\n` +
          `Your results on version ${notice.currentVersion} are kept as a record, but nothing ` +
          'carries forward — the revised topics have their own quizzes to sit.',
      )
    ) {
      return;
    }

    setBusyId(notice.id);
    setError(null);
    try {
      const result = await api(`/learn/courses/${notice.course.id}/move-here`, { method: 'POST' });
      setMoved(result);
      await api('/notifications/read', { method: 'POST', body: { ids: [notice.id] } });
      await load();
      recount();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  if (!notifications && !error) return <p className="text-sm text-slate-500">Loading…</p>;

  const unread = (notifications ?? []).filter((n) => !n.readAt);

  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-3 text-xl font-semibold text-slate-900">
            Inbox
            {unread.length > 0 && <Badge tone="amber">{unread.length} new</Badge>}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Course updates, newest first.
          </p>
        </div>

        {unread.length > 0 && (
          <Button variant="secondary" size="sm" onClick={() => markRead(null)}>
            Mark all read
          </Button>
        )}
      </div>

      <div className="mt-6 space-y-3">
        <Alert>{error}</Alert>

        {moved && (
          <Alert tone="indigo">
            Moved from version {moved.from} to version {moved.to}. {moved.topics} topic
            {moved.topics === 1 ? '' : 's'} are open to you —{' '}
            <button onClick={() => navigate('/my-courses')} className="font-medium underline">
              start reading
            </button>
            .
          </Alert>
        )}

        {notifications?.length === 0 ? (
          <Empty>
            Nothing yet. You will hear here when a course you are on is republished at a new
            version.
          </Empty>
        ) : (
          notifications?.map((notice) => {
            const isUnread = !notice.readAt;

            return (
              <Card
                key={notice.id}
                // Unread is the only thing needing to be picked out of a list;
                // read ones are history and should recede.
                accent={isUnread ? 'amber' : undefined}
                className={isUnread ? '' : 'bg-slate-50/60'}
              >
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="amber">New version</Badge>
                      {notice.course && (
                        <span className="text-xs font-semibold tracking-wide text-indigo-600">
                          {notice.course.code} v{notice.course.version}
                        </span>
                      )}
                      <span className="text-xs text-slate-500">{formatWhen(notice.createdAt)}</span>
                    </div>

                    <p
                      className={`mt-1.5 ${
                        isUnread ? 'font-semibold text-slate-900' : 'text-slate-700'
                      }`}
                    >
                      {notice.title}
                    </p>

                    {notice.body && (
                      <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-slate-600">
                        {notice.body}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {notice.canMove ? (
                      <Button
                        size="sm"
                        disabled={busyId === notice.id}
                        onClick={() => move(notice)}
                      >
                        {busyId === notice.id
                          ? 'Moving…'
                          : `Move to v${notice.course.version}`}
                      </Button>
                    ) : (
                      // Says why there is no button. A notice that simply lacks
                      // one reads as broken rather than as no longer relevant.
                      <span className="text-right text-xs text-slate-400">
                        {notice.currentVersion == null
                          ? 'No longer on this course'
                          : notice.currentVersion >= (notice.course?.version ?? 0)
                            ? 'You are on this version'
                            : 'You finished the version you were on'}
                      </span>
                    )}

                    {isUnread && (
                      <button
                        onClick={() => markRead([notice.id])}
                        className="text-xs text-slate-500 underline hover:text-slate-700"
                      >
                        Mark read
                      </button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
