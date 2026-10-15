import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth, signToken } from '../middleware/auth.js';
import { ApiError, conflict, forbidden, unauthorized } from '../middleware/error.js';
import { config } from '../config.js';
import { Device } from '../models/Device.js';
import { Notification } from '../models/Notification.js';
import { User, serializeUser } from '../models/User.js';
import { disconnectUser } from '../realtime.js';
import { notify } from '../services/notify.js';
import { deptField, locationField, phoneField } from '../services/profile.js';

const loginSchema = z.object({
  email: z.string({ error: 'Enter your email.' }).trim().min(1, 'Enter your email.').max(200),
  password: z.string({ error: 'Enter your password.' }).min(1, 'Enter your password.').max(200),
});

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  const { email, password } = loginSchema.parse(req.body ?? {});
  const found = await User.findOne({ email: email.toLowerCase() });
  // Deleted (anonymised) accounts look exactly like unknown ones.
  const user = found && found.status !== 'deleted' ? found : null;
  if (user && !user.passwordHash) {
    // Pace-linked employees exist without a password until an admin sets one.
    throw unauthorized("This account can't sign in yet. Ask an admin to set a password.");
  }
  const ok = user?.passwordHash ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!user || !ok) throw unauthorized('Wrong email or password.');
  if (user.status === 'pending') throw forbidden('Your account is waiting for admin approval.');
  if (!user.active) throw forbidden('This account has been deactivated. Ask an admin.');
  res.json({ token: signToken(user._id.toString()), user: serializeUser(user) });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: serializeUser(currentUser(req)) });
});

const profileSchema = z
  .object({ phone: phoneField.optional(), dept: deptField.optional(), location: locationField.optional() })
  .strict();

// PATCH /api/auth/me — own phone / dept / location only.
authRouter.patch('/me', requireAuth, async (req, res) => {
  const body = profileSchema.parse(req.body ?? {});
  const user = currentUser(req);
  if (body.phone !== undefined) user.phone = body.phone;
  if (body.dept !== undefined) user.dept = body.dept;
  if (body.location !== undefined) user.location = body.location;
  await user.save();
  res.json({ user: serializeUser(user) });
});

// ---------------------------------------------------------------- feature switches

/** 404 feature_disabled when a server switch is off. @param {'signup' | 'accountDeletion'} name */
function requireFeature(name) {
  /** @type {import('express').RequestHandler} */
  return (_req, _res, next) => {
    if (!config.features[name]) throw new ApiError(404, 'feature_disabled', 'This feature is turned off on this server.');
    next();
  };
}

// ---------------------------------------------------------------- sign-up

/**
 * In-memory sliding window per client IP (req.ip honours the app's `trust proxy` setting).
 * Counts sign-ups that pass validation, so a typo doesn't use up an attempt.
 */
/** @type {Map<string, number[]>} */
const signupHits = new Map();

/** For tests. */
export function resetSignupLimiter() {
  signupHits.clear();
}

/** Throws 429 rate_limited when this IP has used its sign-ups for the hour. @param {import('express').Request} req */
function checkSignupRate(req) {
  const { max, windowMs } = config.signupRateLimit;
  const now = Date.now();
  const ip = req.ip ?? 'unknown';
  const recent = (signupHits.get(ip) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    signupHits.set(ip, recent);
    throw new ApiError(429, 'rate_limited', 'Too many sign-ups from this network. Try again later.');
  }
  recent.push(now);
  signupHits.set(ip, recent);
  if (signupHits.size > 10_000) {
    for (const [k, v] of signupHits) if (v.every((t) => now - t >= windowMs)) signupHits.delete(k);
  }
}

const signupSchema = z.object({
  name: z.string({ error: 'Enter your full name.' }).trim().min(1, 'Enter your full name.').max(100, 'Name is too long.'),
  email: z
    .string({ error: 'Enter your email.' })
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: 'Enter a valid email.' }))
    .pipe(z.string().max(200, 'Email is too long.')),
  phone: phoneField.refine((p) => p.replace(/\D/g, '').length >= 10, 'Enter a mobile number with at least 10 digits.'),
  password: z
    .string({ error: 'Enter a password.' })
    .min(8, 'Password must be at least 8 characters.')
    .max(100, 'Password is too long (max 100 characters).'),
  dept: deptField.optional(),
});

const EMAIL_TAKEN = 'An account with this email already exists.';

// POST /api/auth/signup — creates a pending Employee account for an admin to approve.
authRouter.post('/signup', requireFeature('signup'), async (req, res) => {
  const body = signupSchema.parse(req.body ?? {});
  checkSignupRate(req);
  if (await User.exists({ email: body.email })) throw conflict(EMAIL_TAKEN, 'email');
  let user;
  try {
    user = await User.create({
      name: body.name,
      email: body.email,
      phone: body.phone,
      dept: body.dept ?? '',
      passwordHash: await bcrypt.hash(body.password, 10),
      role: 'host',
      isHost: true,
      active: false,
      status: 'pending',
    });
  } catch (e) {
    if (/** @type {any} */ (e)?.code === 11000) throw conflict(EMAIL_TAKEN, 'email');
    throw e;
  }
  await notify(
    User.find({ active: true, role: 'admin', status: { $nin: ['pending', 'deleted'] } }, { _id: 1 })
      .lean()
      .then((admins) => admins.map((a) => a._id.toString())),
    {
      event: 'signup_request',
      title: '🙋 New account request',
      body: `${user.name} · ${user.email}`,
      data: { type: 'user', id: user._id.toString() },
    },
  );
  res.status(201).json({ message: "Account requested. An admin will approve it — you can sign in once it's approved." });
});

// ---------------------------------------------------------------- account deletion

const deleteSchema = z.object({
  password: z.string({ error: 'Enter your password.' }).min(1, 'Enter your password.').max(200),
});

// DELETE /api/auth/me { password } — anonymise the caller's account (gate records are kept).
authRouter.delete('/me', requireFeature('accountDeletion'), requireAuth, async (req, res) => {
  const { password } = deleteSchema.parse(req.body ?? {});
  const user = currentUser(req);
  if (!(await bcrypt.compare(password, user.passwordHash ?? ''))) throw unauthorized('Wrong password.');
  if (user.role === 'admin' && user.active) {
    const otherAdmins = await User.countDocuments({
      _id: { $ne: user._id },
      role: 'admin',
      active: true,
      status: { $nin: ['pending', 'deleted'] },
    });
    if (otherAdmins === 0) {
      throw conflict("You're the last admin. Make someone else an admin before deleting your account.");
    }
  }
  const id = user._id.toString();
  user.name = 'Deleted user';
  user.email = `deleted-${id}@deleted.invalid`;
  user.phone = '';
  user.dept = '';
  user.location = '';
  user.passwordHash = undefined;
  user.paceEmpCode = undefined; // never re-linked from the HR directory
  user.isHost = false;
  user.active = false;
  user.status = 'deleted';
  user.deletedAt = new Date();
  await user.save();
  await Promise.all([Device.deleteMany({ user: user._id }), Notification.deleteMany({ user: user._id })]);
  disconnectUser(id);
  res.json({ ok: true });
});
