import { ANDROID_PACKAGE_ID } from '../config/appVersion';

/**
 * The version currently live on Google Play, read from the public store page (same approach as the
 * react-native-version-check package, with a plain fetch). Returns null when it can't tell — the caller must then
 * never block (fail open).
 */
export async function fetchPlayStoreVersion() {
  const url = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE_ID}&hl=en&gl=US`;
  const res = await fetch(url, {
    headers: { 'sec-fetch-site': 'same-origin' },
  });
  if (!res.ok) return null;
  const text = await res.text();
  const m =
    text.match(/Current Version.+?>([\d.-]+)<\/span>/) || // older page layout
    text.match(/\[\[\["([\d.]+?)"\]\]/); // current page layout
  return m ? m[1].trim() : null;
}

/** True when dotted version `a` is newer than `b`, comparing each part as a number ('1.10' > '1.9'). */
export function isNewer(a, b) {
  const pa = String(a)
    .split('.')
    .map(n => parseInt(n, 10) || 0);
  const pb = String(b)
    .split('.')
    .map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}
