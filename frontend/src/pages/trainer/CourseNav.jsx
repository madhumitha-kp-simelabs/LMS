import { NavLink } from 'react-router-dom';

/**
 * Moving between a course's four views.
 *
 * These were buttons in the course header, which put navigation and the publish
 * control in the same crowded group — four controls competing for one corner.
 * A tab row says what it is: places to go, not things to do.
 *
 * It was then an underline tab row, and that failed differently: a line of grey
 * text between a gradient header card and the content below reads as a caption,
 * not as navigation, and leads stopped finding Projects at all. So it is a
 * solid segmented control now — a thing you click, sitting on its own ground.
 *
 * The counts are the other half of the fix. A tab that can say "3" or "1
 * waiting" tells you there is something behind it before you go looking; a bare
 * word does not. `work` comes from the course payload every one of these
 * screens already loads, and is simply absent until it arrives.
 */
export default function CourseNav({ courseId, work }) {
  const tabs = [
    { to: `/trainer/courses/${courseId}`, label: 'Content', end: true },
    { to: `/trainer/courses/${courseId}/projects`, label: 'Projects', count: work?.projects },
    {
      to: `/trainer/courses/${courseId}/submissions`,
      label: 'Work handed in',
      count: work?.submissions,
      // The one number worth colouring: work sitting there that nobody has
      // marked. Everything else is a fact; this one is a job.
      attention: work?.awaitingReview,
    },
    { to: `/trainer/courses/${courseId}/progress`, label: 'Candidate progress' },
  ];

  return (
    <nav className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            `flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition ${
              isActive
                ? 'bg-indigo-600 font-semibold text-white shadow-sm'
                : 'font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`
          }
        >
          {({ isActive }) => (
            <>
              {tab.label}

              {/* One badge, not two: the job displaces the tally, because a
                  tab reading "5  1 to review" makes you do arithmetic to find
                  the number that matters. A zero earns no badge at all — the
                  empty state on the page says it better than "Projects 0". */}
              {tab.attention > 0 ? (
                <span
                  // Amber even on the active tab, where the indigo ground would
                  // otherwise swallow it.
                  className="rounded-full bg-amber-400 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-amber-950"
                  title={`${tab.attention} of ${tab.count} waiting to be reviewed`}
                >
                  {tab.attention} to review
                </span>
              ) : (
                tab.count > 0 && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums ${
                      isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {tab.count}
                  </span>
                )
              )}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
