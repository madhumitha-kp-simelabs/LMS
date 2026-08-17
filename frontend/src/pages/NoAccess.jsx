import { Link } from 'react-router-dom';
import { HOME_FOR_ROLE, useAuth } from '../context/AuthContext';

export default function NoAccess() {
  const { user } = useAuth();

  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 px-4 text-center">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">You don’t have access to that page</h1>
        <p className="mt-2 text-sm text-slate-500">
          Your account doesn’t have permission to view it. If that seems wrong, ask an
          administrator.
        </p>
        <Link
          to={user ? HOME_FOR_ROLE[user.role] : '/login'}
          className="mt-6 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
        >
          Back to safety
        </Link>
      </div>
    </div>
  );
}
