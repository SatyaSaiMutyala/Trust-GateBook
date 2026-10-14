import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { io } from 'socket.io-client';
import { API_URL } from '../api/config';
import { selectToken } from '../store/authSlice';
import {
  notificationNewEvent,
  notificationReadEvent,
  mailEvent,
  mailReminderEvent,
  reconnected,
  settingsEvent,
  visitEvent,
} from './events';

/** Keeps one Socket.IO connection open while signed in and dispatches its events into the store. */
export function useRealtime() {
  const dispatch = useDispatch();
  const token = useSelector(selectToken);

  useEffect(() => {
    if (!token) return undefined;
    const socket = io(API_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });
    let connectedOnce = false;
    socket.on('connect', () => {
      if (connectedOnce) dispatch(reconnected());
      connectedOnce = true;
    });
    socket.on('visit:created', p => dispatch(visitEvent(p.visit)));
    socket.on('visit:updated', p => dispatch(visitEvent(p.visit)));
    socket.on('mail:created', p => dispatch(mailEvent('created', p.item)));
    socket.on('mail:updated', p => dispatch(mailEvent('updated', p.item)));
    socket.on('mail:reminder', p => dispatch(mailReminderEvent(p.item)));
    socket.on('settings:updated', p => dispatch(settingsEvent(p.settings)));
    socket.on('notification:new', p => dispatch(notificationNewEvent(p)));
    socket.on('notification:read', p => dispatch(notificationReadEvent(p)));
    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [token, dispatch]);
}
