/**
 * Push notifications via Firebase Cloud Messaging (firebase-admin).
 * Best-effort: nothing here ever throws into a request; failures are logged.
 */
import fs from 'node:fs/promises';
import { config } from '../config.js';
import { Device } from '../models/Device.js';

/**
 * @typedef {{ title: string, body: string, data?: Record<string, unknown> }} PushMessage
 * @typedef {{ success: boolean, error?: { code?: string, message?: string } }} SendResult
 * @typedef {(message: any) => Promise<{ responses: SendResult[], successCount?: number, failureCount?: number }>} Sender
 */

const CHUNK = 500;
const INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

/** @type {Sender | null} */
let sender = null;
/** @type {Set<Promise<void>>} */
const pending = new Set();

export const pushEnabled = () => sender !== null;

/**
 * Initialises firebase-admin from FIREBASE_SERVICE_ACCOUNT. Missing/unreadable/invalid file → push disabled
 * (one log line). Called once at start-up; tests never call it (push stays disabled unless a fake is injected).
 * @returns {Promise<boolean>} whether push is enabled
 */
export async function initPush() {
  if (sender) return true;
  const file = config.firebaseServiceAccount;
  let account;
  try {
    account = JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (e) {
    const why = /** @type {any} */ (e)?.code === 'ENOENT' ? 'file not found' : 'file unreadable or not JSON';
    console.log(`[push] disabled: no Firebase service account at ${file} (${why})`);
    return false;
  }
  try {
    const { initializeApp, cert, getApps } = await import('firebase-admin/app');
    const { getMessaging } = await import('firebase-admin/messaging');
    const app = getApps().find((a) => a.name === 'gatebook') ?? initializeApp({ credential: cert(account) }, 'gatebook');
    const messaging = getMessaging(app);
    sender = (message) => messaging.sendEachForMulticast(message);
    console.log(`[push] enabled: Firebase project ${account.project_id ?? '(unknown)'}`);
    return true;
  } catch (e) {
    console.log(`[push] disabled: Firebase Admin could not start (${e instanceof Error ? e.message : e})`);
    return false;
  }
}

/** Replace the FCM sender (tests). `null` disables push. @param {Sender | null} fn */
export function setPushSenderForTests(fn) {
  sender = fn;
}

/** Resolves when all in-flight pushes have finished (tests). */
export async function pushIdle() {
  while (pending.size > 0) await Promise.allSettled([...pending]);
}

/** @param {Record<string, unknown> | undefined} data */
function stringifyData(data) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const [k, v] of Object.entries(data ?? {})) {
    if (v === undefined || v === null) continue;
    out[k] = typeof v === 'string' ? v : JSON.stringify(v);
  }
  return out;
}

/**
 * @param {string[]} userIds
 * @param {PushMessage} msg
 */
async function deliver(userIds, msg) {
  const send = sender;
  if (!send || userIds.length === 0) return;
  const devices = await Device.find({ user: { $in: userIds } }, { token: 1 }).lean();
  const tokens = [...new Set(devices.map((d) => d.token))];
  const invalid = [];
  for (let i = 0; i < tokens.length; i += CHUNK) {
    const chunk = tokens.slice(i, i + CHUNK);
    const res = await send({
      tokens: chunk,
      notification: { title: msg.title, body: msg.body },
      data: stringifyData(msg.data),
      android: { priority: 'high', notification: { channelId: 'gatebook_default', sound: 'default' } },
      apns: { payload: { aps: { sound: 'default' } } },
    });
    res.responses.forEach((r, j) => {
      if (r.success) return;
      if (r.error?.code && INVALID_TOKEN_CODES.has(r.error.code)) invalid.push(chunk[j]);
      else console.error(`[push] send failed: ${r.error?.code ?? ''} ${r.error?.message ?? ''}`.trim());
    });
  }
  if (invalid.length > 0) await Device.deleteMany({ token: { $in: invalid } });
}

/**
 * Fire-and-forget push to every device of these users. Never throws (the returned promise always resolves).
 * @param {Array<string | { toString(): string }> | Promise<Array<string | { toString(): string }>>} userIds
 *   ids, or a promise of them (e.g. a pending user query) so the whole push is tracked from the start
 * @param {PushMessage} msg
 */
export function sendToUsers(userIds, msg) {
  const p = Promise.resolve(userIds)
    .then((ids) => deliver([...new Set(ids.map(String))], msg))
    .catch((e) => console.error('[push] error:', e instanceof Error ? e.message : e));
  pending.add(p);
  p.finally(() => pending.delete(p));
  return p;
}
