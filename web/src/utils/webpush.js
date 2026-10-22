/**
 * Web push for "Alerts on this device" (docs/API.md "Web push"). The service worker is /sw.js.
 */
import { pushApi } from '../api/endpoints';

export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

/** "Windows · Chrome" (+ " (app)" when installed). */
export function deviceLabel() {
  const ua = navigator.userAgent;
  const os = /Android/.test(ua)
    ? 'Android'
    : isIOS()
      ? 'iPhone/iPad'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac/.test(ua)
          ? 'Mac'
          : 'Device';
  const br = /Edg\//.test(ua)
    ? 'Edge'
    : /Chrome\//.test(ua)
      ? 'Chrome'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Browser';
  return `${os} · ${br}${isStandalone() ? ' (app)' : ''}`;
}

/** @param {string} b64 base64url */
function keyBytes(b64) {
  const s = (b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

/** The service worker, registered on start-up; null where unsupported or not ready within 4 s. */
async function registration() {
  if (!pushSupported()) return null;
  return Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 4000))]);
}

/** Registers /sw.js (start-up). */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

/** This browser's subscription, if alerts are on. */
export async function currentSubscription() {
  const reg = await registration();
  if (!reg || Notification.permission !== 'granted') return null;
  return reg.pushManager.getSubscription();
}

/** Re-sends an existing subscription after sign-in (the server may have dropped it, or another user used it). */
export async function refreshSubscription() {
  const sub = await currentSubscription().catch(() => null);
  if (sub) await pushApi.subscribe(sub.toJSON(), deviceLabel()).catch(() => {});
  return !!sub;
}

/**
 * Turn alerts on. Resolves with a message for the toast; throws an Error with a message to show when it cannot.
 */
export async function enablePush() {
  if (!pushSupported()) {
    throw new Error(
      isIOS() && !isStandalone()
        ? 'Add TruSentinel to your Home Screen first.'
        : 'This browser cannot show notifications.',
    );
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted')
    throw new Error('Notifications are blocked. Allow them in your browser or phone settings.');
  const reg = await registration();
  if (!reg) throw new Error('Could not turn on alerts: the service worker did not start.');
  const { publicKey } = await pushApi.config();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  await pushApi.subscribe(sub.toJSON(), deviceLabel());
  return 'Alerts are on for this device';
}

/** Turn alerts off on this browser. */
export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  await pushApi.unsubscribe(sub.endpoint).catch(() => {});
  await sub.unsubscribe();
}
