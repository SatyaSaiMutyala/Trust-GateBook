import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { Device } from '../models/Device.js';
import { WebPushSub } from '../models/WebPush.js';
import { sendToUsers } from '../services/push.js';
import { sendWebPush, vapidKeys } from '../services/webpush.js';

/**
 * Web push (docs/API.md "Web push"): browsers subscribe for "Alerts on this device". Phones register FCM tokens with
 * /api/devices instead; both are listed by GET /api/push/devices.
 */
export const pushRouter = Router();

// GET /api/push/config — public: the VAPID public key the browser subscribes with
pushRouter.get('/config', async (_req, res) => {
  res.json({ publicKey: (await vapidKeys()).publicKey });
});

pushRouter.use(requireAuth);

const subSchema = z.object({
  subscription: z.object(
    {
      endpoint: z.url({ error: 'Not a push subscription.' }).max(2000),
      keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
    },
    { error: 'Not a push subscription.' },
  ),
  device: z.string().trim().max(80).optional(),
});

// POST /api/push/subscribe { subscription, device } — upsert by endpoint (moves to the caller)
pushRouter.post('/subscribe', async (req, res) => {
  const { subscription, device } = subSchema.parse(req.body ?? {});
  const now = new Date();
  const upsert = () =>
    WebPushSub.updateOne(
      { endpoint: subscription.endpoint },
      {
        $set: { user: currentUser(req)._id, keys: subscription.keys, device: device ?? '', lastSeenAt: now },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );
  try {
    await upsert();
  } catch (e) {
    if (/** @type {any} */ (e)?.code !== 11000) throw e;
    await upsert();
  }
  res.json({ ok: true });
});

// POST /api/push/unsubscribe { endpoint } — this browser stops getting alerts
pushRouter.post('/unsubscribe', async (req, res) => {
  const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint : '';
  await WebPushSub.deleteOne({ endpoint, user: currentUser(req)._id });
  res.json({ ok: true });
});

// GET /api/push/devices — the caller's devices that get alerts: { devices: [{ kind, name, lastSeenAt }] }
pushRouter.get('/devices', async (req, res) => {
  const me = currentUser(req)._id;
  const [web, phones] = await Promise.all([WebPushSub.find({ user: me }).lean(), Device.find({ user: me }).lean()]);
  res.json({
    devices: [
      ...web.map((w) => ({ kind: 'web', name: w.device || 'Browser', lastSeenAt: w.lastSeenAt.toISOString() })),
      ...phones.map((d) => ({
        kind: d.platform,
        name: d.platform === 'ios' ? 'iPhone app' : 'Android app',
        lastSeenAt: d.lastSeenAt.toISOString(),
      })),
    ],
  });
});

// POST /api/push/test — a test alert to every device of the caller: { sent } (browsers delivered + phones registered)
pushRouter.post('/test', async (req, res) => {
  const me = currentUser(req)._id.toString();
  const msg = { title: '🔔 Test alert', body: 'Alerts are working on this device.', data: { type: 'test', id: me } };
  const [web, phones] = await Promise.all([sendWebPush([me], msg), Device.countDocuments({ user: me })]);
  if (phones) void sendToUsers([me], msg);
  res.json({ sent: web + phones });
});
