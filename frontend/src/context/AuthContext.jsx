import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, tokenStore } from '../lib/api';

const AuthContext = createContext(null);

/** Where each role lands after signing in, and where the brand link goes. */
export const HOME_FOR_ROLE = {
  candidate: '/home',
  trainer: '/trainer',
  admin: '/admin',
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // Starts true so protected routes wait for the session check instead of
  // bouncing an already-signed-in user to the login page on refresh.
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tokenStore.get()) {
      setLoading(false);
      return;
    }

    api('/auth/me')
      .then(({ user }) => setUser(user))
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const { user, token } = await api('/auth/login', {
      method: 'POST',
      auth: false,
      body: { email, password },
    });
    tokenStore.set(token);
    setUser(user);
    return user;
  }, []);

  const register = useCallback(async (fullName, email, password) => {
    const { user, token } = await api('/auth/register', {
      method: 'POST',
      auth: false,
      body: { fullName, email, password },
    });
    tokenStore.set(token);
    setUser(user);
    return user;
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout }),
    [user, loading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside an AuthProvider');
  return ctx;
}
