import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { HOME_FOR_ROLE, useAuth } from '../context/AuthContext';
import { api } from '../lib/api';

const ROLE = {
  candidate: { label: 'Candidate', avatar: 'bg-sky-100 text-sky-700', text: 'text-sky-700' },
  trainer: { label: 'Trainer', avatar: 'bg-violet-100 text-violet-700', text: 'text-violet-700' },
  admin: { label: 'Administrator', avatar: 'bg-amber-100 text-amber-800', text: 'text-amber-800' },
};

/** "Priya Menon" -> "PM"; a single name gives one letter. */
function initials(fullName) {
  const parts = fullName.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

const NAV_FOR_ROLE = {
  candidate: [
    { to: '/home', label: 'Home' },
    { to: '/browse', label: 'Browse courses' },
    { to: '/my-courses', label: 'My courses' },
    { to: '/my-progress', label: 'My progress' },
  ],
  // `end` where a link has routes nested under it, so the parent does not stay
  // highlighted alongside the child.
  trainer: [
    { to: '/trainer', label: 'Courses', end: true },
    { to: '/trainer/inbox', label: 'Inbox', badge: 'requests' },
  ],
  // An admin's "Courses" is the catalogue — what exists and what it is called.
  // Trainers get the working view of the courses allotted to them.
  admin: [
    { to: '/admin/courses', label: 'Courses' },
    { to: '/admin/allotment', label: 'Allotment' },
    { to: '/trainer/inbox', label: 'Inbox', badge: 'requests' },
    { to: '/admin', label: 'Administration', end: true },
  ],
};

export default function AppLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const links = NAV_FOR_ROLE[user.role] ?? [];
  const role = ROLE[user.role];

  const [pending, setPending] = useState(0);
  const staffMember = user.role === 'trainer' || user.role === 'admin';

  const refreshPending = useCallback(() => {
    if (!staffMember) return;
    api('/allot/requests')
      .then(({ count }) => setPending(count))
      // A failed badge count is not worth interrupting the page for.
      .catch(() => {});
  }, [staffMember]);

  // Refresh on navigation, and whenever the inbox says it acted on something.
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

            <nav className="flex gap-1">
              {links.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.end}
                  className={({ isActive }) =>
                    `flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition ${
                      isActive
                        ? 'bg-indigo-50 font-medium text-indigo-700'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`
                  }
                >
                  {link.label}
                  {link.badge === 'requests' && pending > 0 && (
                    <span className="grid h-5 min-w-5 place-items-center rounded-full bg-amber-500 px-1 text-xs font-semibold text-white">
                      {pending}
                    </span>
                  )}
                </NavLink>
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
                <span className={`block text-xs ${role.text}`}>{role.label}</span>
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
