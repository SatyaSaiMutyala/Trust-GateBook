import bcrypt from 'bcryptjs';
import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { badRequest, conflict, notFound } from '../middleware/error.js';
import { getSettings } from '../services/settings.js';
import { Notification } from '../models/Notification.js';
import { ROLES, USER_STATUSES, User, serializeUser } from '../models/User.js';
import { Device } from '../models/Device.js';
import { disconnectUser, emitToUser } from '../realtime.js';
import { paginate, parseListQuery, queryString, searchFilter } from '../services/pagination.js';
import { cleanModules, moduleDefs } from '../services/modules.js';
import { deptField, locationField, phoneField } from '../services/profile.js';

const name = z.string({ error: 'Enter a name.' }).trim().min(1, 'Enter a name.').max(100, 'Name is too long.');
const password = z
  .string({ error: 'Enter a password.' })
  .min(6, 'Password must be at least 6 characters.')
  .max(200, 'Password is too long.');
const role = z.enum(ROLES, { error: 'Role must be admin, security, viewer or host.' });
const isHost = z.boolean({ error: 'isHost must be true or false.' });
const modules = z.array(z.string(), { error: 'modules must be a list.' }).max(50);
const reportsTo = z.string({ error: 'Choose who they report to.' }).nullable();
const designation = z.string({ error: 'Designation must be text.' }).trim().max(60, 'Designation is too long (max 60).');
const isSupervisor = z.boolean({ error: 'isSupervisor must be true or false.' });
const siteField = z.string({ error: 'Gate must be text.' }).trim().max(80);

/** '' (all gates) or a gate from Settings. @param {string | undefined} site */
async function checkedSite(site) {
  if (!site) return '';
  const { sites } = await getSettings();
  if (!sites.includes(site)) throw badRequest('Choose the gate from the list.', 'site');
  return site;
}

const createSchema = z.object({
  name,
  email: z.string({ error: 'Enter an email.' }).trim().toLowerCase().pipe(z.email({ error: 'Enter a valid email.' })),
  password,
  role,
  phone: phoneField.optional(),
  dept: deptField.optional(),
  location: locationField.optional(),
  isHost: isHost.optional(),
  canPreRegister: z.boolean({ error: 'canPreRegister must be true or false.' }).optional(),
  modules: modules.optional(),
  reportsTo: reportsTo.optional(),
  designation: designation.optional(),
  isSupervisor: isSupervisor.optional(),
  site: siteField.optional(),
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
    canPreRegister: z.boolean({ error: 'canPreRegister must be true or false.' }).optional(),
    modules: modules.optional(),
    reportsTo: reportsTo.optional(),
    designation: designation.optional(),
    isSupervisor: isSupervisor.optional(),
    site: siteField.optional(),
  })
  .strict();

const MAX_CHAIN = 20;

/**
 * The manager to store for `userId` (null = top of the chain): must be an active, other account, and must not
 * already report to `userId` (directly or through others), or the chain would loop.
 * @param {string | null} managerId
 * @param {string | null} userId  null for a new user
 */
async function checkedManager(managerId, userId) {
  if (!managerId) return null;
  if (!mongoose.isValidObjectId(managerId)) throw badRequest('Choose who they report to from the list.', 'reportsTo');
  if (managerId === userId) throw badRequest('Someone cannot report to themselves.', 'reportsTo');
  const mgr = await User.findOne({ _id: managerId, active: true, status: { $nin: ['pending', 'deleted'] } });
  if (!mgr) throw badRequest('Choose who they report to from the list.', 'reportsTo');
  if (userId) {
    let cur = mgr;
    for (let i = 0; i < MAX_CHAIN && cur?.reportsTo; i++) {
      if (cur.reportsTo.toString() === userId) {
        throw badRequest(`${mgr.name} already reports to this person (directly or through others). Pick someone higher up.`, 'reportsTo');
      }
      cur = await User.findById(cur.reportsTo);
    }
  }
  return mgr._id;
}

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
  // status: pending | active | deleted; default = active + pending (deleted accounts hidden).
  const statusQ = queryString(req.query, 'status');
  if (statusQ === undefined) {
    filter.status = { $ne: 'deleted' };
  } else {
    if (!USER_STATUSES.includes(/** @type {any} */ (statusQ))) {
      throw badRequest('status must be pending, active or deleted.', 'status');
    }
    filter.status = statusQ === 'active' ? { $nin: ['pending', 'deleted'] } : statusQ;
  }
  const activeQ = queryString(req.query, 'active');
  if (activeQ !== undefined) {
    if (activeQ !== 'true' && activeQ !== 'false') throw badRequest('active must be true or false.', 'active');
    filter.active = activeQ === 'true';
  }

  res.json(await paginate(User, filter, lq, serializeUser));
});

// GET /api/users/modules — the module registry for the person editor: { modules: ModuleDef[] }
usersRouter.get('/modules', (_req, res) => {
  res.json({ modules: moduleDefs() });
});

// GET /api/users/org — everyone (active and pending, not deleted) for the org chart and the escalation chains,
// unpaginated and minimal: { users: [{ id, name, role, designation, dept, location, reportsTo, isSupervisor, active }] }
usersRouter.get('/org', async (_req, res) => {
  const users = await User.find({ status: { $ne: 'deleted' } }).sort({ name: 1 }).limit(5000);
  res.json({
    users: users.map((u) => {
      const s = serializeUser(u);
      return { id: s.id, name: s.name, role: s.role, designation: s.designation, dept: s.dept, location: s.location, reportsTo: s.reportsTo, isSupervisor: s.isSupervisor, site: s.site, active: s.active && s.status === 'active' };
    }),
  });
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
      canPreRegister: body.canPreRegister ?? true,
      ...(body.modules ? { modules: cleanModules(body.modules, body.role) } : {}),
      reportsTo: await checkedManager(body.reportsTo ?? null, null),
      designation: body.designation ?? '',
      isSupervisor: body.role !== 'host' && body.isSupervisor === true,
      site: await checkedSite(body.site),
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
  if (body.canPreRegister !== undefined) user.canPreRegister = body.canPreRegister;
  // Modules: ticks are kept per role; a new role without new ticks starts from its defaults.
  if (body.modules !== undefined) user.modules = cleanModules(body.modules, user.role);
  else if (roleChanged) user.modules = undefined;
  if (body.reportsTo !== undefined) user.reportsTo = await checkedManager(body.reportsTo, user._id.toString());
  if (body.designation !== undefined) user.designation = body.designation;
  if (body.isSupervisor !== undefined) user.isSupervisor = body.isSupervisor;
  if (user.role === 'host') user.isSupervisor = false;
  if (body.site !== undefined) user.site = await checkedSite(body.site);
  if (body.active !== undefined) user.active = body.active;
  if (body.password !== undefined) user.passwordHash = await bcrypt.hash(body.password, 10);
  await user.save();
  // Sockets join rooms by role at connect time: make them reconnect with the new role.
  if (!user.active || roleChanged) disconnectUser(user._id.toString());
  // A deactivated user's phones must stop getting pushes.
  if (!user.active) await Device.deleteMany({ user: user._id });
  // Their open apps update nav (modules) and profile without signing in again.
  else emitToUser(user._id.toString(), 'me:updated', { user: serializeUser(user) });
  res.json({ user: serializeUser(user) });
});

// ---------------------------------------------------------------- sign-up approvals

/** @param {string} id */
async function findPending(id) {
  if (!mongoose.isValidObjectId(id)) throw notFound('User not found.');
  const user = await User.findById(id);
  if (!user || user.status === 'deleted') throw notFound('User not found.');
  if (user.status !== 'pending') throw conflict('This account is not waiting for approval.');
  return user;
}

const approveSchema = z.object({ role: role.optional() });

// POST /api/users/:id/approve { role? } — pending sign-up → active account (default Employee).
usersRouter.post('/:id/approve', async (req, res) => {
  const body = approveSchema.parse(req.body ?? {});
  const user = await findPending(String(req.params.id));
  user.role = body.role ?? 'host';
  user.isHost = user.role === 'host';
  user.active = true;
  user.status = 'active';
  await user.save();
  res.json({ user: serializeUser(user) });
});

// POST /api/users/:id/reject — pending sign-up only; removes the account.
usersRouter.post('/:id/reject', async (req, res) => {
  const user = await findPending(String(req.params.id));
  await Promise.all([
    User.deleteOne({ _id: user._id }),
    Notification.deleteMany({ user: user._id }),
    Device.deleteMany({ user: user._id }),
  ]);
  res.json({ ok: true });
});
