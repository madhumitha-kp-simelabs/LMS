import { Badge } from './ui';

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

/**
 * The rest of a candidate's load, beside the course you are looking at.
 *
 * Someone crawling through this course may simply be carrying three others,
 * and without that a lead reads slow progress as a person struggling when it is
 * a person overcommitted. Different conversation, so it is worth the space.
 *
 * Shows what they are on and where they have got to, never what they scored:
 * marks on another lead's course belong to that course's team. Shared by both
 * progress screens so the two never drift apart on what "elsewhere" means.
 */
export default function OtherCourses({ courses }) {
  if (!courses || courses.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Not on any other course — this one has their full attention.
      </p>
    );
  }

  const running = courses.filter((c) => c.status === 'active' && !c.completedAt).length;

  return (
    <div>
      <p className="text-xs text-slate-500">
        {running === 0
          ? 'Nothing else running.'
          : `${running} other course${running === 1 ? '' : 's'} on the go.`}
      </p>

      <ul className="mt-2 space-y-1.5">
        {courses.map((course) => {
          // endsAt already carries a running pause; dueAt is the fallback for
          // anything that has not been through the newer shape yet.
          const due = course.endsAt ?? course.dueAt ?? null;
          const overdue = due && !course.pausedAt && new Date(due) < new Date();

          return (
          <li
            key={course.id}
            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border border-slate-200 px-3 py-2"
          >
            <span className="min-w-0">
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-xs font-semibold tracking-wide text-indigo-600">
                  {course.code}
                  {course.version != null && (
                    <span className="text-slate-400"> v{course.version}</span>
                  )}
                </span>
                <span className="truncate text-sm text-slate-800">{course.title}</span>
              </span>
              <span className="block text-xs text-slate-500">
                {course.lead ? `Led by ${course.lead}` : 'No lead yet'}
              </span>
            </span>

            <span className="shrink-0 text-right">
              {/* Milestones, not marks. Where they have got to is context you
                  can act on; what they scored is that lead's to share. */}
              {course.status === 'pending' ? (
                <Badge tone="amber">Awaiting approval</Badge>
              ) : course.completedAt ? (
                <Badge tone="green">Finished {formatDate(course.completedAt)}</Badge>
              ) : course.startedAt ? (
                <Badge tone="indigo">Started {formatDate(course.startedAt)}</Badge>
              ) : (
                <Badge tone="slate">Not started</Badge>
              )}

              {/* The deadline sits under the milestone rather than beside the
                  lead's name: both are dates about where this course stands,
                  so they read as one column down the right-hand edge.

                  Only while it is still running — a finished course has no
                  deadline left to meet, and the badge above already says the
                  day they finished. */}
              {!course.completedAt && course.status === 'active' && (
                <span className="mt-1 block text-xs">
                  {due ? (
                    <span className={overdue ? 'font-semibold text-rose-700' : 'font-semibold text-slate-700'}>
                      {overdue ? 'Was due' : 'Due'} {formatDate(due)}
                      {course.pausedAt && (
                        <span className="font-normal text-slate-400"> · paused</span>
                      )}
                    </span>
                  ) : (
                    <span className="text-slate-400">No end date set</span>
                  )}
                </span>
              )}
            </span>
          </li>
          );
        })}
      </ul>
    </div>
  );
}
