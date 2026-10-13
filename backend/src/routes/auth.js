import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth, signToken } from '../middleware/auth.js';
import { forbidden, unauthorized } from '../middleware/error.js';
import { User, serializeUser } from '../models/User.js';
import { deptField, locationField, phoneField } from '../services/profile.js';

const loginSchema = z.object({
  email: z.string({ error: 'Enter your email.' }).trim().min(1, 'Enter your email.').max(200),
  password: z.string({ error: 'Enter your password.' }).min(1, 'Enter your password.').max(200),
});

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  const { email, password } = loginSchema.parse(req.body ?? {});
  const user = await User.findOne({ email: email.toLowerCase() });
  const ok = user ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!user || !ok) throw unauthorized('Wrong email or password.');
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
