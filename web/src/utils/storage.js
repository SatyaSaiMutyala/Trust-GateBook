// localStorage can throw (private mode, blocked site data); every access is guarded and
// falls back to an in-memory copy so the app keeps working for the session.
const memory = new Map();
export function readStored(key) {
  try {
    const v = window.localStorage.getItem(key);
    if (v !== null) return v;
  } catch {
    /* ignore */
  }
  return memory.get(key) ?? null;
}
export function writeStored(key, value) {
  if (value === null) memory.delete(key);
  else memory.set(key, value);
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}
export const STORAGE_KEYS = {
  token: 'gatebook.token',
};
