import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { API_BASE } from '../api/client';
import { normalizeMail, normalizeVisit } from '../api/endpoints';
import { useAuth } from '../auth/context';
import { RealtimeBus, RealtimeContext } from './context';
export function RealtimeProvider({ children }) {
  const { token, status } = useAuth();
  const [bus] = useState(() => new RealtimeBus());
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    if (!token || status !== 'signedIn') return;
    const socket = io(API_BASE || undefined, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });
    let everConnected = false;
    socket.on('connect', () => {
      setConnected(true);
      if (everConnected) bus.emit('reconnect', {});
      everConnected = true;
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));
    socket.on('visit:created', (p) => bus.emit('visit:created', { visit: normalizeVisit(p.visit) }));
    socket.on('visit:updated', (p) => bus.emit('visit:updated', { visit: normalizeVisit(p.visit) }));
    socket.on('settings:updated', (p) => bus.emit('settings:updated', p));
    socket.on('mail:created', (p) => bus.emit('mail:created', { item: normalizeMail(p.item) }));
    socket.on('mail:updated', (p) => bus.emit('mail:updated', { item: normalizeMail(p.item) }));
    socket.on('mail:reminder', (p) => bus.emit('mail:reminder', { item: normalizeMail(p.item) }));
    socket.on('notification:new', (p) => bus.emit('notification:new', p));
    socket.on('notification:read', (p) => bus.emit('notification:read', p));
    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      setConnected(false);
    };
  }, [token, status, bus]);
  const value = useMemo(() => ({ bus, connected }), [bus, connected]);
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}
