import { createContext, useContext, useEffect, useRef } from 'react';
export class RealtimeBus {
  handlers = new Map();
  on(event, handler) {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler);
    return () => {
      set.delete(handler);
    };
  }
  emit(event, payload) {
    this.handlers.get(event)?.forEach((h) => h(payload));
  }
}
export const RealtimeContext = createContext(null);
export function useRealtimeStatus() {
  return useContext(RealtimeContext)?.connected ?? false;
}
/** Subscribe to a realtime event. The latest handler is always used; no resubscribe churn. */
export function useRealtimeEvent(event, handler) {
  const ctx = useContext(RealtimeContext);
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    if (!ctx) return;
    return ctx.bus.on(event, (p) => ref.current(p));
  }, [ctx, event]);
}
/** Run `refetch` (debounced) whenever any visit changes or the socket reconnects. */
export function useVisitChanges(refetch, delayMs = 400) {
  const timer = useRef(null);
  const ref = useRef(refetch);
  useEffect(() => {
    ref.current = refetch;
  });
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const schedule = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => ref.current(), delayMs);
  };
  useRealtimeEvent('visit:created', schedule);
  useRealtimeEvent('visit:updated', schedule);
  useRealtimeEvent('reconnect', schedule);
}
/**
 * Re-broadcast a change we made ourselves, so lists update even if the socket is down.
 * (The server's own event arrives too; patching twice is harmless.)
 */
export function useLocalEmit() {
  const ctx = useContext(RealtimeContext);
  return (event, payload) => ctx?.bus.emit(event, payload);
}

/** Run `refetch` (debounced) whenever any post item changes or the socket reconnects. */
export function useMailChanges(refetch, delayMs = 400) {
  const timer = useRef(null);
  const ref = useRef(refetch);
  useEffect(() => {
    ref.current = refetch;
  });
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const schedule = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => ref.current(), delayMs);
  };
  useRealtimeEvent('mail:created', schedule);
  useRealtimeEvent('mail:updated', schedule);
  useRealtimeEvent('reconnect', schedule);
}

/** Run `refetch` (debounced) whenever a pre-registration changes or the socket reconnects. */
export function useExpectedChanges(refetch, delayMs = 400) {
  const timer = useRef(null);
  const ref = useRef(refetch);
  useEffect(() => {
    ref.current = refetch;
  });
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const schedule = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => ref.current(), delayMs);
  };
  useRealtimeEvent('expected:changed', schedule);
  useRealtimeEvent('reconnect', schedule);
}

/** Refetch (debounced) when a material gate pass changes anywhere, or after a reconnect. */
export function useMaterialChanges(refetch, delayMs = 400) {
  const timer = useRef(null);
  const ref = useRef(refetch);
  useEffect(() => {
    ref.current = refetch;
  });
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const schedule = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => ref.current(), delayMs);
  };
  useRealtimeEvent('material:changed', schedule);
  useRealtimeEvent('reconnect', schedule);
}

/** Refetch (debounced) on `event`, or after a reconnect. @param {string} event */
function useChanges(event, refetch, delayMs) {
  const timer = useRef(null);
  const ref = useRef(refetch);
  useEffect(() => {
    ref.current = refetch;
  });
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const schedule = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => ref.current(), delayMs);
  };
  useRealtimeEvent(event, schedule);
  useRealtimeEvent('reconnect', schedule);
}

/** Refetch (debounced) when a key is issued, returned or edited, or after a reconnect. */
export const useKeysChanges = (refetch, delayMs = 300) => useChanges('keys:changed', refetch, delayMs);

/** Refetch (debounced) when an incident changes, or after a reconnect. */
export const useIncidentChanges = (refetch, delayMs = 300) => useChanges('incident:changed', refetch, delayMs);

/** Refetch (debounced) after a patrol scan or set-up change, or after a reconnect. */
export const usePatrolChanges = (refetch, delayMs = 300) => useChanges('patrol:changed', refetch, delayMs);

/** Refetch (debounced) after a generator run, diesel entry or set-up change, or after a reconnect. */
export const useGenChanges = (refetch, delayMs = 300) => useChanges('gen:changed', refetch, delayMs);
