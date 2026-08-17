import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Gates a route subtree. Pass `roles` to restrict it further.
 *
 * This is a usability guard, not a security boundary — the API enforces the
 * same rules server-side, because anything in the browser can be bypassed.
 */
export default function ProtectedRoute({ roles }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center text-slate-500">
        Loading…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/no-access" replace />;
  }

  return <Outlet />;
}
