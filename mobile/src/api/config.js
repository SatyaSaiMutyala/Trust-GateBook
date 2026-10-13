import { Platform } from 'react-native';
import Config from 'react-native-config';

function defaultBaseUrl() {
  // The Android emulator reaches the host machine through 10.0.2.2; the iOS simulator shares the host's localhost.
  return Platform.OS === 'android'
    ? 'http://10.0.2.2:4000'
    : 'http://localhost:4000';
}

const fromEnv = (Config?.API_URL ?? '').trim();

/** Backend base URL without a trailing slash, from API_URL in .env (react-native-config). A physical device needs the computer's LAN IP. */
export const API_URL = (
  fromEnv.length > 0 ? fromEnv : defaultBaseUrl()
).replace(/\/+$/, '');

/** Signed file URLs come back as `/api/files/...`; prefix them with the API base URL. */
export function fileUrl(path) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_URL}${path.startsWith('/') ? '' : '/'}${path}`;
}
