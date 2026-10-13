import bcrypt from 'bcryptjs';
import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { badRequest, conflict, notFound } from '../middleware/error.js';
import { ROLES, User, serializeUser } from '../models/User.js';
import { disconnectUser } from '../realtime.js';
import { paginate, parseListQuery, queryString, searchFilter } from '../services/pagination.js';
import { deptField, locationField, phoneField } from '../services/profile.js';

const name = z.string({ error: 'Enter a name.' }).trim().min(1, 'Enter a name.').max(100, 'Name is too long.');
const password = z
  .string({ error: 'Enter a password.' })
  .min(6, 'Password must be at least 6 characters.')
  .max(200, 'Password is too long.');
const role = z.enum(ROLES, { error: 'Role must be admin, security, viewer or host.' });
const isHost = z.boolean({ error: 'isHost must be true or false.' });

const createSchema = z.object({
  name,
  email: z.string({ error: 'Enter an email.' }).trim().toLowerCase().pipe(z.email({ error: 'Enter a valid email.' })),
  password,
  role,
  phone: phoneField.optional(),
  dept: deptField.optional(),
  location: locationField.optional(),
  isHost: isHost.optional(),
});

const patchSchema = z
  .object({
    name: name.optional(),
    role: role.optional(),
    password: password.optional(),
    active: z.boolean({ error: 'active must be true or false.' }).optional(),
    phone: phoneField.optional(),
    dept: deptField.optional(),
    location: locationField.optional(),
    isHost: isHost.optional(),
  })
  .strict();

/** @param {unknown} e */
const isDuplicateKey = (e) => typeof e === 'object' && e !== null && /** @type {any} */ (e).code === 11000;

export const usersRouter = Router();
usersRouter.use(requireAuth, requireRole('admin'));

// GET /api/users — paginated; q over name/email/phone/dept; filters role, active; sort name|email|createdAt
usersRouter.get('/', async (req, res) => {
  const lq = parseListQuery(req.query, { sortFields: ['name', 'email', 'createdAt'], defaultSort: 'name' });
  /** @type {Record<string, unknown>} */
  const filter = { ...searchFilter(lq.q, ['name', 'email', 'phone', 'dept']) };

  const roleQ = queryString(req.query, 'role');
  if (roleQ !== undefined) {
    if (!ROLES.includes(/** @type {any} */ (roleQ))) throw badRequest('role must be admin, security, viewer or host.', 'role');
    filter.role = roleQ;
  }
  const activeQ = queryString(req.query, 'active');
  if (activeQ !== undefined) {
    if (activeQ !== 'true' && activeQ !== 'false') throw badRequest('active must be true or false.', 'active');
    filter.active = activeQ === 'true';
  }

  res.json(await paginate(User, filter, lq, serializeUser));
});

usersRouter.post('/', async (req, res) => {
  const body = createSchema.parse(req.body ?? {});
  if (await User.exists({ email: body.email })) throw conflict('A user with this email already exists.', 'email');
  try {
    const user = await User.create({
      name: body.name,
      email: body.email,
      role: body.role,
      passwordHash: await bcrypt.hash(body.password, 10),
      active: true,
      phone: body.phone ?? '',
      dept: body.dept ?? '',
      location: body.location ?? '',
      isHost: body.role === 'host' || body.isHost === true,
    });
    res.status(201).json({ user: serializeUser(user) });
  } catch (e) {
    if (isDuplicateKey(e)) throw conflict('A user with this email already exists.', 'email');
    throw e;
  }
});

usersRouter.patch('/:id', async (req, res) => {
  const id = String(req.params.id);
  if (!mongoose.isValidObjectId(id)) throw notFound('User not found.');
  const body = patchSchema.parse(req.body ?? {});
  const user = await User.findById(id);
  if (!user) throw notFound('User not found.');

  const losesAdmin =
    user.role === 'admin' && user.active && ((body.role !== undefined && body.role !== 'admin') || body.active === false);
  if (losesAdmin) {
    const otherAdmins = await User.countDocuments({ _id: { $ne: user._id }, role: 'admin', active: true });
    if (otherAdmins === 0) throw conflict('Keep at least one active admin.');
  }

  const roleChanged = body.role !== undefined && body.role !== user.role;
  if (body.name !== undefined) user.name = body.name;
  if (body.role !== undefined) user.role = body.role;
  if (body.phone !== undefined) user.phone = body.phone;
  if (body.dept !== undefined) user.dept = body.dept;
  if (body.location !== undefined) user.location = body.location;
  if (body.isHost !== undefined) user.isHost = body.isHost;
  if (user.role === 'host') user.isHost = true;
  if (body.active !== undefined) user.active = body.active;
  if (body.password !== undefined) user.passwordHash = await bcrypt.hash(body.password, 10);
  await user.save();
  // Sockets join rooms by role at connect time: make them reconnect with the new role.
  if (!user.active || roleChanged) disconnectUser(user._id.toString());
  res.json({ user: serializeUser(user) });
});
