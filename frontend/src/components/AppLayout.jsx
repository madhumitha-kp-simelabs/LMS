import { Fragment, useCallback, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { HOME_FOR_ROLE, useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { initials } from './ui';

const ROLE = {
  candidate: { label: 'Candidate', avatar: 'bg-sky-100 text-sky-700', text: 'text-sky-700' },
  trainer: { label: 'Trainer', avatar: 'bg-violet-100 text-violet-700', text: 'text-violet-700' },
  lead: { label: 'Course lead', avatar: 'bg-indigo-100 text-indigo-700', text: 'text-indigo-700' },
  admin: { label: 'Administrator', avatar: 'bg-amber-100 text-amber-800', text: 'text-amber-800' },
};

/**
 * What each role sees along the top.
 *
 * Two rules the labels have to keep. Nothing is called "Inbox" twice: a lead
 * has both a queue of decisions and a list of things that happened to them, and
 * one word for both left them guessing which badge meant what. And nothing is
 * long enough to wrap — a nav item on two lines pushes the bar to twice the
 * height and reads as a paragraph.
 *
 * So the staff queue is "Requests", because that is what is in it, and the
 * learner's is "Updates", because nobody is waiting on them to decide anything.
 *
 * `end` where a link has routes nested under it, so the parent does not stay
 * highlighted alongside the child.
 */
const NAV_FOR_ROLE = {
  candidate: [
    { to: '/home', label: 'Home' },
    { to: '/browse', label: 'Browse' },
    { to: '/my-courses', label: 'My courses' },
    { to: '/my-projects', label: 'My projects', badge: 'projects' },
    { to: '/my-progress', label: 'My progress' },
    { to: '/inbox', label: 'Updates', badge: 'notices' },
  ],
  // A trainer writes the topics handed to them and nothing else, so they get
  // the courses they are on and the two screens about how those are going.
  trainer: [
    // "Courses" rather than "My courses": the learner half below has a
    // My courses of its own, and two items of the same name in one bar is
    // the confusion the hat switcher exists to prevent.
    { to: '/trainer', label: 'Courses', end: true },
    { to: '/trainer/progress', label: 'Progress' },
    { to: '/trainer/feedback', label: 'Feedback' },
    /**
     * A trainer learns too.
     *
     * Writing the topics on one course does not stop somebody being taught
     * another, and the rule that keeps the two apart is per course — nobody is
     * a learner on a course they work on — not per role. So a trainer gets the
     * candidate's nav, item for item, exactly as a lead does.
     */
    { to: '/home', label: 'Home', section: true },
    { to: '/browse', label: 'Browse' },
    { to: '/my-courses', label: 'My courses' },
    { to: '/my-projects', label: 'My projects', badge: 'projects' },
    { to: '/my-progress', label: 'My progress' },
    { to: '/inbox', label: 'Updates', badge: 'notices' },
  ],
  /**
   * A lead has two lives and the nav has to say which is which.
   *
   * Teaching first — it is why they sign in most days — then a rule, then the
   * half where they are the student. "Courses" and "My courses" would have been
   * the natural pair but read as the same thing at a glance, so the learning
   * side says "Learning" outright.
   */
  lead: [
    { to: '/trainer', label: 'Courses', end: true },
    { to: '/trainer/progress', label: 'Progress' },
    // Every project in the organisation, not only theirs — a lead is
    // answerable for how the programme hangs together, not just their corner.
    { to: '/trainer/projects', label: 'Projects' },
    { to: '/trainer/feedback', label: 'Feedback' },
    { to: '/trainer/inbox', label: 'Requests', badge: 'requests' },
    /**
    * The learner half is the candidate's nav, item for item.
    *
    * It used to be a shortened version with its own labels — "Learning" rather
    * than "My courses", no Home, no My progress — on the grounds that
    * "Courses" and "My courses" read alike in one long bar. The hat switcher
    * settles that: only one half is live at a time, so the two can no longer
    * be confused, and a lead being taught a course should see exactly what
    * every other learner sees rather than a cut-down version of it.
    */
    { to: '/home', label: 'Home', section: true },
    { to: '/browse', label: 'Browse' },
    { to: '/my-courses', label: 'My courses' },
    { to: '/my-projects', label: 'My projects', badge: 'projects' },
    { to: '/my-progress', label: 'My progress' },
    { to: '/inbox', label: 'Updates', badge: 'notices' },
  ],
  // An admin's "Courses" is the catalogue — what exists and what it is called.
  // Leads and trainers get the working view of the courses they are on.
  admin: [
    // First, because it is the overview the rest of the nav drills into — an
    // admin opening the app wants the shape of the organisation before they
    // want any one course.
    { to: '/admin', label: 'Dashboard', end: true },
    { to: '/admin/courses', label: 'Courses' },
    { to: '/admin/allotment', label: 'Allotment' },
    { to: '/admin/projects', label: 'Projects' },
    { to: '/trainer/progress', label: 'Progress' },
    { to: '/trainer/feedback', label: 'Feedback' },
    { to: '/trainer/inbox', label: 'Requests', badge: 'requests' },
  ],
};

/**
 * What the staff half of the nav is called for each role.
 *
 * The learner half is always "As candidate" — that is what somebody taking a
 * course is, whatever their job title. The other half is named by the job.
 */
const STAFF_HAT = { lead: 'As lead', trainer: 'As trainer', admin: 'As admin' };

export default function AppLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const links = NAV_FOR_ROLE[user.role] ?? [];
  const role = ROLE[user.role];

  /**
   * Which hat they are wearing: 'staff', 'learner', or null for neither yet.
   *
   * Only means anything for somebody whose nav has both halves — a lead runs
   * courses and is taught others, and the two sets of screens answer different
   * questions. Holding one at a time is what stops the bar reading as ten
   * equally likely places to go.
   *
   * Starts as null on every sign-in: the choice is "what am I here to do
   * today", and inheriting yesterday's answer would make it invisible. Kept in
   * sessionStorage so a page refresh does not ask again, and cleared on the way
   * out so the next sign-in starts blank.
   */
  const hatKey = `lt.hat.${user.id ?? user.email}`;
  const [hat, setHat] = useState(() => {
    try {
      return sessionStorage.getItem(hatKey);
    } catch {
      // Private windows and blocked site data throw on read.
      return null;
    }
  });

  // Where the learner half starts. -1 for a role with only one half, and the
  // switcher is not offered at all then.
  const splitAt = links.findIndex((link) => link.section);
  const bothHats = splitAt > 0;
  const halfOf = (index) => (index < splitAt ? 'staff' : 'learner');
  // A role with one half is unaffected: everything stays live, as before.
  const usable = (index) => !bothHats || hat === halfOf(index);

  function wearHat(next) {
    setHat(next);
    try {
      sessionStorage.setItem(hatKey, next);
    } catch {
      // Not being able to remember it is survivable; the choice still applies.
    }

    // Taken to the first screen of the half they picked. Without this, choosing
    // "As candidate" while reading a staff page leaves somebody on a page whose
    // whole nav has just gone grey, with nothing to click.
    const first = links.findIndex((link, index) => halfOf(index) === next);
    if (first !== -1) navigate(links[first].to);
  }

  function signOut() {
    try {
      sessionStorage.removeItem(hatKey);
    } catch {
      // Nothing to do — the logout below is what matters.
    }
    logout();
  }

  const [pending, setPending] = useState(0);
  const [unread, setUnread] = useState(0);
  // Projects handed over since this person last looked at the list.
  const [newProjects, setNewProjects] = useState(0);
  // Which courses they lead. "Course lead" alone tells somebody their job
  // title, which they already know; the useful half is which courses it is
  // over — especially for a lead who runs three and is looking at a fourth.
  const [ledCourses, setLedCourses] = useState([]);
  // Only people who decide on join requests need the pending count.
  const staffMember = user.role === 'lead' || user.role === 'admin';
  // And only people with an Inbox link need the unread one. A lead who is also
  // learning has both links and both counts.
  const reads = links.some((link) => link.badge === 'notices');
  // Only somebody with a learner half is ever given project work.
  const learns = links.some((link) => link.badge === 'projects');

  /**
   * The line under the name: the role, and what it is over.
   *
   * Named up to two courses, counted beyond that — a header is not the place
   * for a list, and three codes with versions is already wider than the name
   * above it. The full list is on the tooltip for the times it matters.
   */
  const codes = ledCourses.map((course) => `${course.code} v${course.version}`);
  const subtitle =
    codes.length === 0
      ? role.label
      : codes.length <= 2
        ? `${role.label} · ${codes.join(', ')}`
        : `${role.label} · ${codes.length} courses`;
  const subtitleTitle = codes.length > 0 ? `Leads ${codes.join(', ')}` : undefined;

  const refreshPending = useCallback(() => {
    if (reads) {
      api('/notifications/count')
        .then(({ count }) => setUnread(count))
        .catch(() => {});
    }

    if (learns) {
      api('/learn/projects/count')
        .then(({ count }) => setNewProjects(count))
        .catch(() => {});
    }

    // Guarded per call, not with one early return: a candidate has no staff
    // queue but does have notices, and returning here would cost them the count.
    if (!staffMember) return;
    // Every kind of waiting as one number: the badge answers "is there
    // anything in my inbox", and four counts on one icon would make the
    // reader do the addition.
    Promise.all([
      api('/allot/requests'),
      api('/sessions/inbox'),
      api('/extensions/inbox'),
      api('/discontinuations/inbox'),
      api('/progress/overdue'),
    ])
      .then(([joins, sessions, extensions, stopping, late]) =>
        setPending(
          (joins.count ?? 0) +
            (sessions.count ?? 0) +
            (extensions.count ?? 0) +
            (stopping.count ?? 0) +
            (late.count ?? 0),
        ),
      )
      // A failed badge count is not worth interrupting the page for.
      .catch(() => {});
  }, [staffMember, reads, learns]);

  // Refresh on navigation, and whenever the inbox says it acted on something.
  useEffect(() => {
    if (user.role !== 'lead') return;

    api('/courses')
      .then(({ courses }) => setLedCourses(courses.filter((course) => course.relation === 'lead')))
      // The subtitle falls back to the plain role if this fails; not worth an
      // error anywhere the user can see.
      .catch(() => {});
  }, [user.role]);

  useEffect(() => {
    refreshPending();
  }, [refreshPending, location.pathname]);

  useEffect(() => {
    window.addEventListener('inbox-changed', refreshPending);
    return () => window.removeEventListener('inbox-changed', refreshPending);
  }, [refreshPending]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="h-1 bg-gradient-to-r from-indigo-500 via-violet-500 to-sky-400" />

      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 flex-1 items-center gap-4 xl:gap-8">
            <Link to={HOME_FOR_ROLE[user.role]} className="group flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-bold text-white shadow-sm">
                L
              </span>
              <span className="hidden font-semibold text-slate-900 transition group-hover:text-indigo-600 lg:block">
                Learning Tracker
              </span>
            </Link>

            <nav className="flex min-w-0 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {links.map((link, index) => (
                // A rule before `section`, so a lead's two lives read as two
                // groups rather than one run-on list. Fragment keyed on the
                // link, since the divider belongs to it.
                <Fragment key={link.to}>
                  {link.section && (
                    <span className="mx-1.5 h-5 w-px shrink-0 bg-slate-200" aria-hidden />
                  )}
                {usable(index) ? (
                  <NavLink
                    to={link.to}
                    end={link.end}
                    className={({ isActive }) =>
                      `flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm transition ${
                        isActive
                          ? 'bg-indigo-50 font-medium text-indigo-700'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`
                    }
                  >
                    {link.label}
                    {link.badge === 'notices' && unread > 0 && (
                      <span className="grid h-5 min-w-5 place-items-center rounded-full bg-amber-500 px-1 text-xs font-semibold text-white">
                        {unread}
                      </span>
                    )}
                    {link.badge === 'requests' && pending > 0 && (
                      <span className="grid h-5 min-w-5 place-items-center rounded-full bg-amber-500 px-1 text-xs font-semibold text-white">
                        {pending}
                      </span>
                    )}
                    {link.badge === 'projects' && newProjects > 0 && (
                      <span className="grid h-5 min-w-5 place-items-center rounded-full bg-amber-500 px-1 text-xs font-semibold text-white">
                        {newProjects}
                      </span>
                    )}
                  </NavLink>
                ) : (
                  // A span, not a disabled link: there is nothing to follow, so
                  // there should be no anchor to middle-click or copy either.
                  // Badges are dropped with it — a count nobody can act on is
                  // noise sitting next to a word they cannot press.
                  <span
                    aria-disabled="true"
                    title={
                      hat === null
                        ? 'Pick a hat beside your name first'
                        : `Switch to "${
                            halfOf(index) === 'staff' ? STAFF_HAT[user.role] : 'As candidate'
                          }" to use this`
                    }
                    className="shrink-0 cursor-not-allowed whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm text-slate-300"
                  >
                    {link.label}
                  </span>
                )}
                </Fragment>
              ))}
            </nav>
          </div>

          <div className="flex shrink-0 items-center gap-2.5 sm:gap-3">
            {/* Only for somebody who has both halves. A candidate, a trainer or
                an admin has one set of screens, and a switch with one setting
                is a control that does nothing. */}
            {bothHats && (
              <span
                className={`inline-flex shrink-0 divide-x overflow-hidden rounded-lg border text-xs ${
                  hat === null
                    ? // Nothing picked yet, and the whole nav is grey behind it,
                      // so the switch has to be what the eye lands on.
                      'divide-amber-200 border-amber-300 bg-amber-50 ring-2 ring-amber-100'
                    : 'divide-slate-200 border-slate-200 bg-white'
                }`}
              >
                {[
                  ['staff', STAFF_HAT[user.role] ?? 'As staff'],
                  ['learner', 'As candidate'],
                ].map(([which, label]) => (
                  <button
                    key={which}
                    onClick={() => wearHat(which)}
                    aria-pressed={hat === which}
                    className={`whitespace-nowrap px-2 py-1.5 font-medium transition ${
                      hat === which
                        ? 'bg-indigo-50 text-indigo-700'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </span>
            )}

            <div className="flex min-w-0 items-center gap-2.5">
              <span
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold ${role.avatar}`}
                aria-hidden
              >
                {initials(user.fullName)}
              </span>
              <span className="hidden min-w-0 max-w-[11rem] leading-tight lg:block">
                <span className="block truncate text-sm font-medium text-slate-900">
                  {user.fullName}
                </span>
                <span className={`block truncate text-xs ${role.text}`} title={subtitleTitle}>
                  {subtitle}
                </span>
              </span>
            </div>

            <span className="hidden h-8 w-px bg-slate-200 sm:block" aria-hidden />

            <button
              onClick={signOut}
              className="shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-8 py-10">
        <Outlet />
      </main>
    </div>
  );
}
