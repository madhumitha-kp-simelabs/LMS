import { Fragment, useCallback, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
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
    { to: '/my-projects', label: 'My projects' },
    { to: '/my-progress', label: 'My progress' },
    { to: '/inbox', label: 'Updates', badge: 'notices' },
  ],
  // A trainer writes the topics handed to them and nothing else, so they get
  // the courses they are on and the two screens about how those are going.
  trainer: [
    { to: '/trainer', label: 'My courses', end: true },
    { to: '/trainer/progress', label: 'Progress' },
    { to: '/trainer/feedback', label: 'Feedback' },
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
    // Browse answers "what does the organisation teach?" — for a lead as much
    // as a candidate. It sits on the learning side because that is the half of
    // the app it belongs to, even though a lead often opens it to find a
    // colleague's course rather than to enrol.
    { to: '/browse', label: 'Browse', section: true },
    { to: '/my-courses', label: 'Learning' },
    { to: '/my-projects', label: 'My projects' },
    { to: '/inbox', label: 'Updates', badge: 'notices' },
  ],
  // An admin's "Courses" is the catalogue — what exists and what it is called.
  // Leads and trainers get the working view of the courses they are on.
  admin: [
    { to: '/admin/courses', label: 'Courses' },
    { to: '/admin/allotment', label: 'Allotment' },
    { to: '/admin/projects', label: 'Projects' },
    { to: '/trainer/progress', label: 'Progress' },
    { to: '/trainer/feedback', label: 'Feedback' },
    { to: '/trainer/inbox', label: 'Requests', badge: 'requests' },
    { to: '/admin', label: 'Administration', end: true },
  ],
};

export default function AppLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const links = NAV_FOR_ROLE[user.role] ?? [];
  const role = ROLE[user.role];

  const [pending, setPending] = useState(0);
  const [unread, setUnread] = useState(0);
  // Which courses they lead. "Course lead" alone tells somebody their job
  // title, which they already know; the useful half is which courses it is
  // over — especially for a lead who runs three and is looking at a fourth.
  const [ledCourses, setLedCourses] = useState([]);
  // Only people who decide on join requests need the pending count.
  const staffMember = user.role === 'lead' || user.role === 'admin';
  // And only people with an Inbox link need the unread one. A lead who is also
  // learning has both links and both counts.
  const reads = links.some((link) => link.badge === 'notices');

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
  }, [staffMember, reads]);

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
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-8 py-4">
          <div className="flex items-center gap-10">
            <Link to={HOME_FOR_ROLE[user.role]} className="group flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-bold text-white shadow-sm">
                L
              </span>
              <span className="font-semibold text-slate-900 transition group-hover:text-indigo-600">
                Learning Tracker
              </span>
            </Link>

            <nav className="flex items-center gap-1">
              {links.map((link) => (
                // A rule before `section`, so a lead's two lives read as two
                // groups rather than one run-on list. Fragment keyed on the
                // link, since the divider belongs to it.
                <Fragment key={link.to}>
                  {link.section && (
                    <span className="mx-1.5 h-5 w-px shrink-0 bg-slate-200" aria-hidden />
                  )}
                <NavLink
                  to={link.to}
                  end={link.end}
                  className={({ isActive }) =>
                    `flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition ${
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
                </NavLink>
                </Fragment>
              ))}
            </nav>
          </div>

          <div className="flex shrink-0 items-center gap-4">
            <div className="flex items-center gap-3">
              <span
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold ${role.avatar}`}
                aria-hidden
              >
                {initials(user.fullName)}
              </span>
              <span className="hidden leading-tight sm:block">
                <span className="block text-sm font-medium text-slate-900">{user.fullName}</span>
                <span className={`block text-xs ${role.text}`} title={subtitleTitle}>
                  {subtitle}
                </span>
              </span>
            </div>

            <span className="h-8 w-px bg-slate-200" aria-hidden />

            <button
              onClick={logout}
              className="rounded-lg px-3 py-1.5 text-sm text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
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
