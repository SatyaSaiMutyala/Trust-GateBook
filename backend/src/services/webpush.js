/**
 * Web push (docs/API.md "Web push"): notifications to browsers that turned on "Alerts on this device". Sent next
 * to the FCM pushes for every stored notification (services/notify.js). Never throws.
 */
import webpush from 'web-push';
import { config } from '../config.js';
import { AppSecret, WebPushSub } from '../models/WebPush.js';

/** @type {{ publicKey: string, privateKey: string } | null} */
let vapid = null;
/** @type {Promise<{ publicKey: string, privateKey: string }> | null} */
let loading = null;

/** @typedef {(sub: { endpoint: string, keys: { p256dh: string, auth: string } }, payload: string) => Promise<unknown>} WebPushSender */
/** @type {WebPushSender | null} */
let testSender = null;
const pending = new Set();

/** The VAPID key pair: from the environment, else made once and kept in the database. */
export async function vapidKeys() {
  if (vapid) return vapid;
  if (!loading) {
    loading = (async () => {
      if (config.webPush.publicKey && config.webPush.privateKey) {
        return { publicKey: config.webPush.publicKey, privateKey: config.webPush.privateKey };
      }
      const saved = await AppSecret.findOne({ key: 'vapid' }).lean();
      if (saved) return /** @type {any} */ (saved.value);
      const made = webpush.generateVAPIDKeys();
      try {
        await AppSecret.create({ key: 'vapid', value: made });
        return made;
      } catch (e) {
        // Another process made them first.
        if (/** @type {any} */ (e)?.code !== 11000) throw e;
        return /** @type {any} */ ((await AppSecret.findOne({ key: 'vapid' }).lean())?.value);
      }
    })();
  }
  try {
    vapid = await loading;
  } finally {
    loading = null;
  }
  return vapid;
}

/** Tests: replace the sender (no network). @param {WebPushSender | null} fn */
export function setWebPushSenderForTests(fn) {
  testSender = fn;
}

/** Resolves when all in-flight web pushes have finished (tests). */
export async function webPushIdle() {
  while (pending.size > 0) await Promise.allSettled([...pending]);
}

/**
 * @param {string[]} userIds
 * @param {{ title: string, body: string, data?: Record<string, unknown>, alarm?: boolean }} msg
 * @returns {Promise<number>} pushes delivered
 */
async function deliver(userIds, msg) {
  const subs = await WebPushSub.find({ user: { $in: userIds } }).lean();
  if (!subs.length) return 0;
  const keys = await vapidKeys();
  const payload = JSON.stringify({ title: msg.title, body: msg.body, data: msg.data ?? {}, alarm: !!msg.alarm });
  let sent = 0;
  const gone = [];
  for (const s of subs) {
    const sub = { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh ?? '', auth: s.keys.auth ?? '' } };
    try {
      if (testSender) await testSender(sub, payload);
      else
        await webpush.sendNotification(sub, payload, {
          vapidDetails: { subject: config.webPush.subject, publicKey: keys.publicKey, privateKey: keys.privateKey },
          TTL: 60 * 60,
          urgency: msg.alarm ? 'high' : 'normal',
        });
      sent++;
    } catch (e) {
      const status = /** @type {any} */ (e)?.statusCode;
      if (status === 404 || status === 410) gone.push(s.endpoint);
      else console.error(`[webpush] send failed: ${status ?? ''} ${e instanceof Error ? e.message : e}`.trim());
    }
  }
  if (gone.length) await WebPushSub.deleteMany({ endpoint: { $in: gone } });
  return sent;
}

/**
 * Fire-and-forget web push to every browser of these users. Resolves with the number delivered; never throws.
 * @param {Array<string | { toString(): string }>} userIds
 * @param {{ title: string, body: string, data?: Record<string, unknown>, alarm?: boolean }} msg
 */
export function sendWebPush(userIds, msg) {
  const p = deliver([...new Set(userIds.map(String))], msg).catch((e) => {
    console.error('[webpush] error:', e instanceof Error ? e.message : e);
    return 0;
  });
  pending.add(p);
  p.finally(() => pending.delete(p));
  return p;
}
