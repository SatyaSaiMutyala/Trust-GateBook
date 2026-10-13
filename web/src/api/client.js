import { readStored, STORAGE_KEYS, writeStored } from '../utils/storage';
/** API origin. Empty = same origin (Vite dev proxy forwards /api and /socket.io). */
export const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');
export class ApiError extends Error {
  status;
  code;
  field;
  /** The full `error` object from the response (e.g. `error.item` on a mail confirm conflict). */
  details;
  constructor(status, code, message, field, details = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.field = field;
    this.details = details;
  }
}
export function errorMessage(err) {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}
// ---- token -----------------------------------------------------------------
export const tokenStore = {
  get: () => readStored(STORAGE_KEYS.token),
  set: (token) => writeStored(STORAGE_KEYS.token, token),
};
let unauthorizedHandler = null;
/** Called when an authenticated request comes back 401 (expired or revoked token). */
export function onUnauthorized(handler) {
  unauthorizedHandler = handler;
}
export function fileUrl(path) {
  if (!path) return path;
  if (/^(https?:|blob:|data:)/i.test(path)) return path;
  return `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
}
export function buildUrl(path, query) {
  const params = new URLSearchParams();
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === '') continue;
      params.set(k, String(v));
    }
  }
  const qs = params.toString();
  return `${API_BASE}${path}${qs ? `?${qs}` : ''}`;
}
async function send(method, path, opts = {}) {
  const headers = { Accept: 'application/json' };
  const token = tokenStore.get();
  if (token && !opts.anonymous) headers.Authorization = `Bearer ${token}`;
  let body;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  let res;
  try {
    res = await fetch(buildUrl(path, opts.query), { method, headers, body, signal: opts.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(0, 'network', 'Cannot reach the server. Check the connection and try again.');
  }
  if (!res.ok) {
    let parsed;
    try {
      parsed = await res.json();
    } catch {
      parsed = null;
    }
    const e = parsed?.error;
    const error = new ApiError(
      res.status,
      e?.code ?? (res.status === 401 ? 'unauthorized' : res.status === 403 ? 'forbidden' : 'internal'),
      e?.message ?? `Request failed (${res.status}).`,
      e?.field,
      e ?? null,
    );
    if (res.status === 401 && !opts.anonymous && token) unauthorizedHandler?.();
    throw error;
  }
  return res;
}
export async function request(method, path, opts) {
  const res = await send(method, path, opts);
  if (res.status === 204) return undefined;
  return await res.json();
}
export async function requestBlob(path, opts) {
  const res = await send('GET', path, opts);
  const cd = res.headers.get('Content-Disposition') ?? '';
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
  return { blob: await res.blob(), filename: m ? decodeURIComponent(m[1]) : null };
}
