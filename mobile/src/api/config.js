import Config from 'react-native-config';

/** Live TruSentinel server (AWS). Request paths already start with `/api/…`, so this is the bare origin. */
export const PRODUCTION_API_URL = 'https://trusentinel.mytrustlab.co.in';

/**
 * Normalise a base URL: no trailing slash, and no trailing `/api` — the app adds `/api/…` itself, so
 * `https://host/api` would otherwise turn into `https://host/api/api/…`.
 */
export function normalizeBaseUrl(url) {
  return String(url ?? '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/api$/i, '');
}

const fromEnv = normalizeBaseUrl(Config?.API_URL);

/**
 * Backend base URL. Defaults to the live server; set API_URL in mobile/.env (read at build time by
 * react-native-config) to point a build at another backend, e.g. http://10.0.2.2:4000 (Android emulator →
 * your computer), http://localhost:4000 (iOS simulator) or http://<your-LAN-IP>:4000 (phone on the same Wi-Fi).
 */
export const API_URL = fromEnv || PRODUCTION_API_URL;

/** Signed file URLs come back as `/api/files/...`; prefix them with the API base URL. */
export function fileUrl(path) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_URL}${path.startsWith('/') ? '' : '/'}${path}`;
}
