import { useCallback, useEffect, useMemo, useState } from 'react';
import { mailApi } from '../api/endpoints';
import { useAuth } from '../auth/context';
import { isEmployee } from '../auth/roles';
import { useMailChanges } from '../realtime/context';
import { MailCountsContext } from './context';

/**
 * Nav counts for the post room. Gate users: `GET /api/mail?limit=1` → counts.
 * Employees: `GET /api/mail?recipient=me&limit=1` → counts for their own items.
 * Refreshed (debounced) on mail:created / mail:updated / reconnect.
 */
export function MailCountsProvider({ children }) {
  const { user } = useAuth();
  const employee = isEmployee(user);
  const key = employee ? 'me' : 'all';
  const [result, setResult] = useState({ key: null, counts: null });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    const query = employee ? { recipient: 'me', page: 1, limit: 1 } : { page: 1, limit: 1 };
    mailApi
      .list(query, ctrl.signal)
      .then((r) => setResult({ key, counts: r.counts }))
      .catch(() => {});
    return () => ctrl.abort();
  }, [key, employee, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  useMailChanges(refresh, 300);

  const counts = result.key === key ? result.counts : null;
  const value = useMemo(() => ({ counts, refresh }), [counts, refresh]);
  return <MailCountsContext.Provider value={value}>{children}</MailCountsContext.Provider>;
}
