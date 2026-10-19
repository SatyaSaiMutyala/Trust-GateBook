import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { errorMessage } from '../api/client';
import { trackApi } from '../api/endpoints';
import { useUser } from '../auth/context';
import { isGateUser } from '../auth/roles';
import { useRealtimeEvent } from '../realtime/context';
import { chime, unlockAudioOnFirstTap } from '../utils/chime';
import { readStored, writeStored } from '../utils/storage';
import { TrackContext } from './context';

const CHANGE_EVENTS = [
  'visit:created',
  'visit:updated',
  'mail:created',
  'mail:updated',
  'material:changed',
  'keys:changed',
  'incident:changed',
  'patrol:changed',
  'gen:changed',
  'expected:changed',
  'reconnect',
];
const POLL_MS = 30_000; // time-based items (late rounds, overdue keys) appear without an event
const ALARM_MS = 12_000;
const QUIET_MS = 5 * 60_000;
const SOUND_KEY = 'gb.sound';

/** Subscribe one handler to several events (fixed list). */
function useEvents(handler) {
  useRealtimeEvent(CHANGE_EVENTS[0], handler);
  useRealtimeEvent(CHANGE_EVENTS[1], handler);
  useRealtimeEvent(CHANGE_EVENTS[2], handler);
  useRealtimeEvent(CHANGE_EVENTS[3], handler);
  useRealtimeEvent(CHANGE_EVENTS[4], handler);
  useRealtimeEvent(CHANGE_EVENTS[5], handler);
  useRealtimeEvent(CHANGE_EVENTS[6], handler);
  useRealtimeEvent(CHANGE_EVENTS[7], handler);
  useRealtimeEvent(CHANGE_EVENTS[8], handler);
  useRealtimeEvent(CHANGE_EVENTS[9], handler);
  useRealtimeEvent(CHANGE_EVENTS[10], handler);
}

/**
 * TRACK for this gate (gate users): loaded on start, on every change event and every 30 s. Late patrol rounds ring
 * every 12 s for security and supervisors while the page is visible, until scanned or silenced for 5 minutes.
 */
export function TrackProvider({ children }) {
  const user = useUser();
  const gate = isGateUser(user);
  const [state, setState] = useState({ data: null, error: null });
  const [quietUntil, setQuietUntil] = useState(() => new Map());
  const [sound, setSoundState] = useState(() => readStored(SOUND_KEY) !== 'off');
  const timer = useRef(null);

  const load = useCallback(() => {
    if (!gate) return;
    trackApi
      .get()
      .then((data) => setState({ data, error: null }))
      .catch((err) => setState((s) => ({ ...s, error: errorMessage(err) })));
  }, [gate]);
  const refresh = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(load, 400);
  }, [load]);
  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      clearInterval(id);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load]);
  useEvents(refresh);
  useEffect(() => unlockAudioOnFirstTap(), []);

  const isQuiet = useCallback((id) => (quietUntil.get(id) ?? 0) > Date.now(), [quietUntil]);
  const quiet = useCallback((id) => setQuietUntil((m) => new Map(m).set(id, Date.now() + QUIET_MS)), []);
  const setSound = useCallback((on) => {
    writeStored(SOUND_KEY, on ? 'on' : 'off');
    setSoundState(on);
  }, []);

  // The alarm: late rounds, not silenced, for guards and supervisors.
  const ringing = useMemo(
    () => (state.data?.items ?? []).filter((i) => i.tone === 'alarm').map((i) => i.id),
    [state.data],
  );
  const rings = gate && (user.role === 'security' || user.isSupervisor);
  useEffect(() => {
    if (!rings || !ringing.length) return undefined;
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (!ringing.some((r) => (quietUntil.get(r) ?? 0) <= Date.now())) return;
      chime(sound);
      setTimeout(() => chime(sound), 900);
      navigator.vibrate?.([600, 200, 600, 200, 900]);
    }, ALARM_MS);
    return () => clearInterval(id);
  }, [rings, ringing, quietUntil, sound]);

  const value = useMemo(
    () => ({ data: state.data, error: state.error, refresh: load, quiet, isQuiet, sound, setSound }),
    [state, load, quiet, isQuiet, sound, setSound],
  );
  return <TrackContext.Provider value={value}>{children}</TrackContext.Provider>;
}
