import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { notificationsApi } from '../api/endpoints';
import { useLocalEmit, useRealtimeEvent } from '../realtime/context';
import { NotificationsContext, useToast } from './context';

/**
 * Unread count for the bell. Fetched on sign-in, when the window regains focus / becomes visible, and on socket
 * reconnect; kept live by `notification:new` / `notification:read` (which also update other tabs and devices).
 */
export function NotificationsProvider({ children }) {
  const [unreadCount, setUnreadCount] = useState(null);
  const [nonce, setNonce] = useState(0);
  const emit = useLocalEmit();
  const toast = useToast();
  const seq = useRef(0);

  useEffect(() => {
    const ctrl = new AbortController();
    const mine = ++seq.current;
    notificationsApi
      .unreadCount(ctrl.signal)
      .then((n) => {
        if (mine === seq.current) setUnreadCount(n);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    const onFocus = () => refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  useRealtimeEvent('notification:new', (p) => {
    if (typeof p?.unreadCount === 'number') setUnreadCount(p.unreadCount);
    else setUnreadCount((n) => (n ?? 0) + 1);
    // Escalation steps (reminders, manager alerts): toast them; alarm steps also vibrate longer.
    const n = p?.notification;
    if (n?.event === 'escalation') {
      toast([n.title, n.body].filter(Boolean).join(' · '));
      try {
        navigator.vibrate?.(n.alarm ? [400, 150, 400, 150, 400] : [200]);
      } catch {
        /* ignore */
      }
    }
  });
  useRealtimeEvent('notification:read', (p) => {
    if (typeof p?.unreadCount === 'number') setUnreadCount(p.unreadCount);
  });
  useRealtimeEvent('reconnect', refresh);

  /** Optimistically mark one read; the server's count wins when it answers. */
  const markRead = useCallback(
    async (id) => {
      seq.current += 1; // a stale count fetch must not undo the optimistic change
      setUnreadCount((n) => Math.max(0, (n ?? 1) - 1));
      emit('notification:read', { ids: [id] });
      try {
        const r = await notificationsApi.read(id);
        if (typeof r?.unreadCount === 'number') setUnreadCount(r.unreadCount);
      } catch {
        refresh();
      }
    },
    [emit, refresh],
  );

  const markAllRead = useCallback(async () => {
    seq.current += 1;
    const before = unreadCount;
    setUnreadCount(0);
    emit('notification:read', { ids: 'all' });
    try {
      await notificationsApi.readAll();
      return true;
    } catch {
      setUnreadCount(before);
      refresh();
      return false;
    }
  }, [emit, refresh, unreadCount]);

  const value = useMemo(
    () => ({ unreadCount, refresh, markRead, markAllRead }),
    [unreadCount, refresh, markRead, markAllRead],
  );
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}
