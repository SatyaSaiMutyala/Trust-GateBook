import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { Device, PLATFORMS } from '../models/Device.js';

const deviceSchema = z.object({
  token: z.string({ error: 'token is required.' }).trim().min(1, 'token is required.').max(4096, 'token is too long.'),
  platform: z.enum(PLATFORMS, { error: 'platform must be android or ios.' }),
});

export const devicesRouter = Router();
devicesRouter.use(requireAuth);

// POST /api/devices — register this phone's FCM token (upsert by token; moves to the caller).
devicesRouter.post('/', async (req, res) => {
  const { token, platform } = deviceSchema.parse(req.body ?? {});
  const user = currentUser(req);
  const now = new Date();
  const upsert = () =>
    Device.updateOne(
      { token },
      { $set: { user: user._id, platform, lastSeenAt: now }, $setOnInsert: { createdAt: now } },
      { upsert: true },
    );
  try {
    await upsert();
  } catch (e) {
    // Two registrations of a new token at once: the second upsert races on the unique index.
    if (/** @type {any} */ (e)?.code !== 11000) throw e;
    await upsert();
  }
  res.json({ ok: true });
});

// DELETE /api/devices/:token — sign-out; only the caller's own token, 200 even if absent.
devicesRouter.delete('/:token', async (req, res) => {
  await Device.deleteOne({ token: String(req.params.token), user: currentUser(req)._id });
  res.json({ ok: true });
});
