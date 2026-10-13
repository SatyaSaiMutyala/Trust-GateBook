import { useCallback, useEffect, useMemo, useState } from 'react';
import { errorMessage } from '../api/client';
import { settingsApi } from '../api/endpoints';
import { useRealtimeEvent } from '../realtime/context';
import { SettingsContext } from './context';
export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let cancelled = false;
    settingsApi
      .get()
      .then((s) => {
        if (cancelled) return;
        setSettings(s);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [nonce]);
  useRealtimeEvent('settings:updated', ({ settings: s }) => setSettings(s));
  useRealtimeEvent('reconnect', () => setNonce((n) => n + 1));
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const save = useCallback(async (next) => {
    const saved = await settingsApi.put(next);
    setSettings(saved);
    return saved;
  }, []);
  const value = useMemo(() => ({ settings, error, reload, save }), [settings, error, reload, save]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}
