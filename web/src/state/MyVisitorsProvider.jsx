import { useCallback, useEffect, useMemo, useState } from 'react';
import { visitsApi } from '../api/endpoints';
import { useAuth } from '../auth/context';
import { isRecipient } from '../auth/roles';
import { useVisitChanges } from '../realtime/context';
import { MyVisitorsContext } from './context';

/**
 * Nav badge for "My visitors": how many of my visitors are waiting for my answer.
 * Refreshed (debounced) on visit:created / visit:updated (the server sends my own visits to my socket) and reconnect.
 */
export function MyVisitorsProvider({ children }) {
  const { user } = useAuth();
  const enabled = isRecipient(user);
  const [waiting, setWaiting] = useState(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const ctrl = new AbortController();
    visitsApi
      .mine({ scope: 'waiting', limit: 1, page: 1 }, ctrl.signal)
      .then((r) => setWaiting(r.counts.waiting))
      .catch(() => {});
    return () => ctrl.abort();
  }, [nonce, enabled]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  useVisitChanges(refresh, 300);

  const value = useMemo(() => ({ waiting: enabled ? waiting : null, refresh }), [enabled, waiting, refresh]);
  return <MyVisitorsContext.Provider value={value}>{children}</MyVisitorsContext.Provider>;
}
