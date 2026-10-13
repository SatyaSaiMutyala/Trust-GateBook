import { useCallback, useEffect, useMemo, useState } from 'react';
import { visitsApi } from '../api/endpoints';
import { useAuth } from '../auth/context';
import { isGateUser } from '../auth/roles';
import { useVisitChanges } from '../realtime/context';
import { InsideContext } from './context';

/**
 * Nav badge count for "Inside now": `GET /api/visits/inside?limit=1` → pagination.total.
 * Refreshed (debounced) on visit:created / visit:updated and on socket reconnect.
 */
export function InsideProvider({ children }) {
  const { user } = useAuth();
  const enabled = isGateUser(user); // employees get 403 on visit endpoints
  const [count, setCount] = useState(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const ctrl = new AbortController();
    visitsApi
      .inside({ limit: 1, page: 1 }, ctrl.signal)
      .then((r) => setCount(r.pagination.total))
      .catch(() => {});
    return () => ctrl.abort();
  }, [nonce, enabled]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  useVisitChanges(refresh, 300);

  const value = useMemo(() => ({ count, refresh }), [count, refresh]);
  return <InsideContext.Provider value={value}>{children}</InsideContext.Provider>;
}
