import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { provisioningGuard } from '../middleware/provisioning.js';
import { fromZod } from '../middleware/error.js';
import { writeToken } from '../services/provisioningToken.js';
import { User } from '../models/User.js';

/*
 * PACE identity-hub provisioning. Lets PACE create / link / enable / disable one
 * person's TruSentinel (GateBook) login, matched across apps by match_uuid.
 * Guarded by the X-Provisioning-Token shared secret (not JWT).
 *
 *   GET  /api/provisioning/ping
 *   POST /api/provisioning/rotate-token    { token }
 *   GET  /api/provisioning/users/lookup    ?email= | ?match_uuid=
 *   POST /api/provisioning/users           { match_uuid, email, name, password?, phone? }
 *   POST /api/provisioning/users/enable    { match_uuid? , email? }
 *   POST /api/provisioning/users/disable   { match_uuid? , email? }
 *
 * Provisioned accounts are ordinary employees → role "host", isHost true.
 */

const APP = 'trusentinel';

/** Minimal, stable view of a user for PACE. @param {any} u */
const view = (u) =>
  u && {
    match_uuid: u.matchUuid ?? null,
    id: u._id.toString(),
    name: u.name,
    email: u.email ?? null,
    status: u.status ?? 'active',
    active: Boolean(u.active),
  };

const cleanEmail = (e) => (typeof e === 'string' ? e.trim().toLowerCase() : '');

/** Find by match_uuid first (the stable key), then by email. @param {{match_uuid?: any, email?: any}} q */
async function findUser({ match_uuid: matchUuid, email }) {
  if (matchUuid) {
    const u = await User.findOne({ matchUuid: String(matchUuid) });
    if (u) return u;
  }
  const e = cleanEmail(email);
  if (e) return User.findOne({ email: e });
  return null;
}

const storeSchema = z.object({
  match_uuid: z.string().trim().max(64).optional(),
  email: z.string().trim().toLowerCase().pipe(z.email()).pipe(z.string().max(200)),
  name: z.string().trim().min(1).max(100),
  password: z.string().min(8).max(100).optional(),
  phone: z.string().trim().max(40).optional(),
});

const targetSchema = z.object({
  match_uuid: z.string().trim().max(64).optional(),
  email: z.string().trim().max(200).optional(),
});

export const provisioningRouter = Router();
provisioningRouter.use(provisioningGuard); // every route below requires the token

provisioningRouter.get('/ping', (_req, res) => {
  res.json({ ok: true, app: APP, time: new Date().toISOString() });
});

provisioningRouter.post('/rotate-token', (req, res) => {
  const token = req.body?.new_token ?? req.body?.token; // PACE sends `new_token`
  if (!token || String(token).trim().length < 16) {
    res.status(400).json({ error: { code: 'validation', message: 'A new token of at least 16 characters is required.' } });
    return;
  }
  writeToken(token);
  res.json({ ok: true, app: APP });
});

provisioningRouter.get('/users/lookup', async (req, res) => {
  const u = await findUser({ match_uuid: req.query.match_uuid, email: req.query.email });
  res.json({ found: Boolean(u), user: view(u) });
});

provisioningRouter.post('/users', async (req, res) => {
  const parsed = storeSchema.safeParse(req.body ?? {});
  if (!parsed.success) throw fromZod(parsed.error);
  const b = parsed.data;
  const matchUuid = b.match_uuid ? String(b.match_uuid) : null;

  // Link an existing account (by match_uuid or email) rather than duplicating.
  let user = await findUser({ match_uuid: matchUuid, email: b.email });
  let passwordSet = false;

  if (user) {
    user.name = b.name;
    user.email = b.email;
    if (matchUuid) user.matchUuid = matchUuid;
    if (b.phone) user.phone = b.phone;
    if (b.password) {
      user.passwordHash = await bcrypt.hash(b.password, 10);
      passwordSet = true;
    }
    // Re-provisioning re-enables a previously disabled account.
    if (user.status !== 'deleted') {
      user.active = true;
      if (user.status === 'pending') user.status = 'active';
    }
    await user.save();
    res.json({ user: view(user), created: false, password_set: passwordSet });
    return;
  }

  // New account. A password is required to be able to sign in.
  if (!b.password) {
    res.status(400).json({ error: { code: 'validation', message: 'password is required when creating a new user.', field: 'password' } });
    return;
  }
  try {
    user = await User.create({
      name: b.name,
      email: b.email,
      ...(b.phone ? { phone: b.phone } : {}),
      role: 'host',
      isHost: true,
      active: true,
      status: 'active',
      matchUuid,
      passwordHash: await bcrypt.hash(b.password, 10),
    });
  } catch (e) {
    if (/** @type {any} */ (e)?.code === 11000) {
      res.status(409).json({ error: { code: 'conflict', message: 'A TruSentinel account with this email already exists.' } });
      return;
    }
    throw e;
  }
  res.status(201).json({ user: view(user), created: true, password_set: true });
});

provisioningRouter.post('/users/enable', async (req, res) => {
  const b = targetSchema.parse(req.body ?? {});
  const u = await findUser(b);
  if (!u) {
    res.status(404).json({ error: { code: 'not_found', message: 'No matching user to enable.' } });
    return;
  }
  u.active = true;
  if (u.status === 'pending') u.status = 'active';
  await u.save();
  res.json({ user: view(u) });
});

provisioningRouter.post('/users/disable', async (req, res) => {
  const b = targetSchema.parse(req.body ?? {});
  const u = await findUser(b);
  if (!u) {
    res.status(404).json({ error: { code: 'not_found', message: 'No matching user to disable.' } });
    return;
  }
  u.active = false;
  await u.save();
  res.json({ user: view(u) });
});
