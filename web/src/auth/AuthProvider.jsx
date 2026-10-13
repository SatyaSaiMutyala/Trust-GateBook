import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, onUnauthorized, tokenStore } from '../api/client';
import { authApi } from '../api/endpoints';
import { AuthContext } from './context';
export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => tokenStore.get());
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState(() => (tokenStore.get() ? 'loading' : 'signedOut'));
  const [retry, setRetry] = useState(0);
  const logout = useCallback(() => {
    tokenStore.set(null);
    setToken(null);
    setUser(null);
    setStatus('signedOut');
  }, []);
  useEffect(() => {
    onUnauthorized(logout);
    return () => onUnauthorized(null);
  }, [logout]);
  // Restore the session from a remembered token.
  useEffect(() => {
    if (!token || user) return;
    let cancelled = false;
    authApi
      .me()
      .then((u) => {
        if (cancelled) return;
        setUser(u);
        setStatus('signedIn');
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) logout();
        else {
          // Server unreachable: retry shortly rather than dropping the token.
          setTimeout(() => {
            if (!cancelled) setRetry((n) => n + 1);
          }, 4000);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, user, logout, retry]);
  const login = useCallback(async (email, password) => {
    const res = await authApi.login(email.trim(), password);
    tokenStore.set(res.token);
    setToken(res.token);
    setUser(res.user);
    setStatus('signedIn');
  }, []);
  /** Replace the signed-in user after a profile change (PATCH /api/auth/me). */
  const updateUser = useCallback((u) => setUser(u), []);
  const value = useMemo(
    () => ({ status, user, token, login, logout, updateUser }),
    [status, user, token, login, logout, updateUser],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
