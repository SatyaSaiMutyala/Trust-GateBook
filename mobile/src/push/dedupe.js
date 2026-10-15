/**
 * The socket and FCM can both announce the same post-room event while the app is open. Whoever shows a toast
 * first "claims" the key; a second claim within the window is refused.
 */
const WINDOW_MS = 5000;
const seen = new Map();

/** @returns {boolean} true if the caller should show the notice. */
export function claimNotice(key, now = Date.now()) {
  for (const [k, t] of seen) if (now - t > WINDOW_MS) seen.delete(k);
  const last = seen.get(key);
  if (last !== undefined && now - last <= WINDOW_MS) return false;
  seen.set(key, now);
  return true;
}

export const mailNoticeKey = id => `mail:${id}`;

/** Key for a routed item `{ type: 'mail' | 'user', id }`. */
export const routeNoticeKey = route =>
  route.type === 'user' ? `user:${route.id}` : mailNoticeKey(route.id);

/** For tests. */
export function resetNotices() {
  seen.clear();
}
