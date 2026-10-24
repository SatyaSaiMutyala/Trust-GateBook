import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import {
  ANDROID_PACKAGE_ID,
  APP_VERSION,
  PLAY_STORE_URL,
} from '../config/appVersion';
import { fetchPlayStoreVersion, isNewer } from '../utils/playStoreVersion';

/**
 * Force update (Android): when Google Play has a newer version than this build, `updateRequired` turns true and
 * stays true. Checked on start and every time the app comes back to the foreground, so someone who opens the store
 * without updating sees it again. Debug builds and iOS are never blocked, and any failure lets the user in.
 */
export function useForceUpdate() {
  const [storeVersion, setStoreVersion] = useState(null);
  const running = useRef(false);

  const check = useCallback(async () => {
    if (__DEV__ || Platform.OS !== 'android' || running.current) return;
    running.current = true;
    try {
      const latest = await fetchPlayStoreVersion();
      if (latest && isNewer(latest, APP_VERSION)) setStoreVersion(latest);
    } catch {
      // Offline, page changed, …: fail open.
    } finally {
      running.current = false;
    }
  }, []);

  useEffect(() => {
    check();
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') check();
    });
    return () => sub.remove();
  }, [check]);

  // No canOpenURL() guard: on Android 11+ it is false unless the scheme is declared in <queries>, which would leave
  // the user stuck behind a dialog that can't be closed.
  const openStore = useCallback(() => {
    Linking.openURL(`market://details?id=${ANDROID_PACKAGE_ID}`).catch(() =>
      Linking.openURL(PLAY_STORE_URL).catch(() => {}),
    );
  }, []);

  return { updateRequired: storeVersion !== null, storeVersion, openStore };
}
