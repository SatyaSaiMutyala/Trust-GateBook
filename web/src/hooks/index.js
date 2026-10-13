import useMediaQuery from '@mui/material/useMediaQuery';
import { useEffect, useState } from 'react';
import { DESKTOP_MIN } from '../theme/tokens';
/** Current time, updated every `intervalMs` (durations tick every 30 s). */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
/** Desktop / web layout at ≥ 861 px, phone layout below. */
export function useIsDesktop() {
  return useMediaQuery(`(min-width:${DESKTOP_MIN}px)`, { noSsr: true });
}
export function useDebounced(value, delayMs = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return v;
}
