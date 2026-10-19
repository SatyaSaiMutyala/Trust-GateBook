import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { currentUser, isGateUser, requireAuth, requireModule, requireRole } from '../middleware/auth.js';
import { badRequest, conflict, forbidden, notFound } from '../middleware/error.js';
import { Expected } from '../models/Expected.js';
import { RECIPIENT_FILTER, User, canPreRegister } from '../models/User.js';
import { emitExpectedChanged, expectedPeople } from '../realtime.js';
import { formatDate, formatTime, isoDay } from '../services/format.js';
import { gateStaffIds } from '../services/hostApproval.js';
import { notify } from '../services/notify.js';
import { paginate, parseListQuery, queryString, searchFilter } from '../services/pagination.js';
import { generatePassNumber } from '../services/passNumber.js';
import { serializeExpected } from '../services/serializeExpected.js';
import { getSettings } from '../services/settings.js';
import { localDayStart } from './stats.js';

export const expectedRouter = Router();
expectedRouter.use(requireAuth, requireModule('expected'));

const canReceive = requireRole('security', 'admin');

const DAY_MS = 86_400_000;
const WHEN = ['all', 'today', 'upcoming', 'earlier'];
const SEARCH_FIELDS = ['code', 'name', 'phone', 'company', 'host.name', 'contact.name', 'challanNo', 'vehicle'];
const LIST_OPTS = { sortFields: ['expectedAt', 'createdAt'], defaultSort: 'expectedAt' };

// ---------------------------------------------------------------- helpers

/** @param {string} s */
const last10 = (s) => s.replace(/\D/g, '').slice(-10);
/** @param {any} user */
const userRef = (user) => ({ id: user._id.toString(), name: user.name });
/** @param {any} e */
const data = (e) => ({ type: 'expected', id: e.code });

/**
 * The client's local day as UTC instants (`tzOffset` = getTimezoneOffset(), default IST).
 * @param {Record<string, unknown>} query
 * @param {number} nowMs
 */
function dayBounds(query, nowMs) {
  let tzOffset = -330;
  const raw = queryString(query, 'tzOffset');
  if (raw !== undefined) {
    tzOffset = Number(raw);
    if (!Number.isInteger(tzOffset) || Math.abs(tzOffset) > 14 * 60) {
      throw badRequest('tzOffset must be minutes from getTimezoneOffset().', 'tzOffset');
    }
  }
  const start = new Date(localDayStart(nowMs, tzOffset));
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

/** Gate users see every pre-registration; everyone else only the ones they are concerned with. @param {any} user */
function scopeFilter(user) {
  if (isGateUser(user)) return {};
  const me = user._id.toString();
  return { $or: [{ 'createdBy.id': me }, { 'host.id': me }, { 'contact.id': me }, { 'also.id': me }] };
}

/** @param {string} id @param {any} user */
async function findExpected(id, user) {
  const e = await Expected.findOne({ code: id.trim().toUpperCase(), ...scopeFilter(user) });
  if (!e) throw notFound('Expected visitor not found.');
  return e;
}

/** May change or cancel it: gate operators, an admin, whoever registered it, or the host. @param {any} e @param {any} user */
function canManage(e, user) {
  const me = user._id.toString();
  return ['security', 'admin'].includes(user.role) || e.createdBy.id === me || e.host.id === me;
}

/**
 * Active employees who can receive visitors / post, by id (same list as GET /api/hosts).
 * @param {string[]} ids
 * @param {string} field the input to point a validation error at
 */
async function receivers(ids, field) {
  const unique = [...new Set(ids)];
  if (unique.some((id) => !mongoose.isValidObjectId(id))) throw badRequest('Choose employees from the list.', field);
  const users = await User.find({ _id: { $in: unique }, ...RECIPIENT_FILTER });
  if (users.length !== unique.length) throw badRequest('Choose employees from the list.', field);
  const byId = new Map(users.map((u) => [u._id.toString(), u]));
  return unique.map((id) => userRef(byId.get(id)));
}

/** "today 3:00 pm" / "21 Oct 2026, 3:00 pm". @param {Date} at */
function whenText(at) {
  return isoDay(at) === isoDay(new Date()) ? `today ${formatTime(at)}` : `${formatDate(at)}, ${formatTime(at)}`;
}
/** @param {any} e */
const who = (e) => (e.kind === 'delivery' ? `Delivery from ${e.company}` : e.name);
/** @param {any} e */
const boxesText = (e) => (e.boxes ? ` · ${e.boxes} box${e.boxes === 1 ? '' : 'es'}` : '');

// ---------------------------------------------------------------- input

const text = (/** @type {string} */ label, /** @type {number} */ max) =>
  z.string({ error: `${label} must be text.` }).trim().max(max, `${label} is too long (max ${max}).`);
const isoDate = (/** @type {string} */ label) =>
  z
    .string({ error: `${label} must be a date-time.` })
    .refine((s) => !Number.isNaN(new Date(s).getTime()), `${label} must be a date-time.`)
    .transform((s) => new Date(s));

const fieldsSchema = z.object({
  kind: z.enum(['visitor', 'delivery'], { error: 'kind must be visitor or delivery.' }),
  name: text('Name', 100),
  phone: text('Mobile number', 20).regex(/^[0-9+\-\s()]*$/, 'Mobile number can only use digits, spaces and +.'),
  company: text('Company', 120),
  purpose: text('Purpose', 80),
  persons: z.number({ error: 'No. of persons must be a number.' }).int('No. of persons must be a whole number.').min(1).max(50),
  hostId: z.string({ error: 'Choose the employee.' }).min(1, 'Choose the employee.'),
  contactId: z.string().nullable(),
  alsoIds: z.array(z.string(), { error: 'alsoIds must be a list.' }).max(10, 'At most 10 more employees.'),
  expectedAt: isoDate('Expected time'),
  untilAt: isoDate('Until').nullable(),
  vehicle: text('Vehicle number', 20),
  items: text('Items', 300),
  notes: text('Note for security', 500),
  preapproved: z.boolean({ error: 'preapproved must be true or false.' }),
  boxes: z.number({ error: 'Boxes must be a number.' }).int('Boxes must be a whole number.').min(0).max(9999),
  challanType: text('Challan type', 60),
  challanNo: text('Challan number', 60),
});
const createSchema = fieldsSchema.partial().required({ kind: true, hostId: true, expectedAt: true });
const patchSchema = fieldsSchema.partial().omit({ kind: true });

/**
 * Validates the merged fields of a new or edited pre-registration and resolves the employees.
 * @param {Record<string, any>} f
 * @param {{ purposes: string[] }} settings
 */
async function resolveFields(f, settings) {
  const delivery = f.kind === 'delivery';
  if (delivery && !f.company) throw badRequest('Enter who the delivery is from.', 'company');
  if (delivery && !(f.boxes > 0)) throw badRequest('Enter how many boxes are coming.', 'boxes');
  if (!delivery && !f.name) throw badRequest("Enter the visitor's name.", 'name');
  if (!delivery && f.purpose && !settings.purposes.includes(f.purpose)) {
    throw badRequest(`"${f.purpose}" is not a purpose in settings.`, 'purpose');
  }
  if (f.expectedAt.getTime() < Date.now() - DAY_MS) throw badRequest('The expected time is in the past.', 'expectedAt');
  if (f.untilAt && f.untilAt.getTime() <= f.expectedAt.getTime()) {
    throw badRequest('"Until" must be after the expected time.', 'untilAt');
  }
  const [host] = await receivers([f.hostId], 'hostId');
  const contact = f.contactId && f.contactId !== f.hostId ? (await receivers([f.contactId], 'contactId'))[0] : null;
  const alsoIds = delivery ? [] : (f.alsoIds ?? []).filter((/** @type {string} */ id) => id !== f.hostId && id !== f.contactId);
  const also = alsoIds.length ? await receivers(alsoIds, 'alsoIds') : [];
  return {
    name: f.name ?? '',
    phone: f.phone ?? '',
    phone10: f.phone ? last10(f.phone) : '',
    company: f.company ?? '',
    purpose: delivery ? '' : (f.purpose ?? ''),
    persons: delivery ? 1 : (f.persons ?? 1),
    host,
    contact: delivery ? null : contact,
    also,
    expectedAt: f.expectedAt,
    untilAt: f.untilAt ?? null,
    vehicle: (f.vehicle ?? '').toUpperCase(),
    items: delivery ? '' : (f.items ?? ''),
    notes: f.notes ?? '',
    // Deliveries are received by security, never "let in".
    preapproved: delivery ? false : !!f.preapproved,
    boxes: f.boxes ?? 0,
    challanType: f.challanType ?? '',
    challanNo: (f.challanNo ?? '').toUpperCase(),
  };
}

/** Plain field values of a document, in the shape `resolveFields` takes. @param {any} e */
const currentFields = (e) => ({
  kind: e.kind,
  name: e.name,
  phone: e.phone,
  company: e.company,
  purpose: e.purpose,
  persons: e.persons,
  hostId: e.host.id,
  contactId: e.contact?.id ?? null,
  alsoIds: (e.also ?? []).map((/** @type {any} */ a) => a.id),
  expectedAt: e.expectedAt,
  untilAt: e.untilAt,
  vehicle: e.vehicle,
  items: e.items,
  notes: e.notes,
  preapproved: e.preapproved,
  boxes: e.boxes,
  challanType: e.challanType,
  challanNo: e.challanNo,
});

// ---------------------------------------------------------------- reads

// GET /api/expected?when=today|upcoming|earlier|all — paginated, scoped; counts.today = still expected today
expectedRouter.get('/', async (req, res) => {
  const now = Date.now();
  const user = currentUser(req);
  const when = queryString(req.query, 'when') ?? 'all';
  if (!WHEN.includes(when)) throw badRequest(`when must be one of: ${WHEN.join(', ')}.`, 'when');
  const { start, end } = dayBounds(req.query, now);
  const lq = parseListQuery(req.query, {
    ...LIST_OPTS,
    defaultSort: when === 'earlier' ? '-expectedAt' : 'expectedAt',
  });

  /** @type {Record<string, any>[]} */
  const and = [scopeFilter(user)];
  if (when === 'today') and.push({ expectedAt: { $gte: start, $lt: end } });
  if (when === 'upcoming') and.push({ status: 'expected', expectedAt: { $gte: start } });
  if (when === 'earlier') and.push({ $or: [{ expectedAt: { $lt: start } }, { status: { $ne: 'expected' }, expectedAt: { $lt: end } }] });
  const kind = queryString(req.query, 'kind');
  if (kind !== undefined) {
    if (kind !== 'visitor' && kind !== 'delivery') throw badRequest('kind must be visitor or delivery.', 'kind');
    and.push({ kind });
  }
  and.push(searchFilter(lq.q, SEARCH_FIELDS));
  const filter = { $and: and.filter((f) => Object.keys(f).length > 0) };
  if (filter.$and.length === 0) delete (/** @type {any} */ (filter)).$and;

  const [page, today] = await Promise.all([
    paginate(Expected, filter, lq, (e) => serializeExpected(e, now)),
    Expected.countDocuments({ ...scopeFilter(user), status: 'expected', expectedAt: { $gte: start, $lt: end } }),
  ]);
  res.json({ ...page, counts: { today } });
});

// GET /api/expected/match?phone= — today's open expected visitor with this mobile number (check-in prefill)
expectedRouter.get('/match', requireRole('admin', 'security', 'viewer'), async (req, res) => {
  const now = Date.now();
  const phone10 = last10(queryString(req.query, 'phone') ?? '');
  if (phone10.length < 10) {
    res.json({ expected: null });
    return;
  }
  const { start, end } = dayBounds(req.query, now);
  const e = await Expected.findOne({
    phone10,
    kind: 'visitor',
    status: 'expected',
    expectedAt: { $gte: new Date(start.getTime() - DAY_MS), $lt: end },
  }).sort({ expectedAt: 1 });
  res.json({ expected: e ? serializeExpected(e, now) : null });
});

expectedRouter.get('/:id', async (req, res) => {
  const e = await findExpected(String(req.params.id), currentUser(req));
  res.json({ expected: serializeExpected(e) });
});

// ---------------------------------------------------------------- create / edit / cancel

expectedRouter.post('/', async (req, res) => {
  const user = currentUser(req);
  if (user.role === 'viewer') throw forbidden('Your account is read-only. Ask an admin for security access.');
  if (!canPreRegister(user)) {
    throw forbidden('You have not been given the right to pre-register visitors. Ask an admin.');
  }
  const body = createSchema.parse(req.body ?? {});
  const settings = await getSettings();
  const fields = await resolveFields(
    { preapproved: body.kind === 'visitor' ? settings.expectedPreapproved : false, ...body },
    settings,
  );

  let e = null;
  for (let attempt = 0; attempt < 8 && !e; attempt++) {
    try {
      e = await Expected.create({
        ...fields,
        code: generatePassNumber(new Date(), 'EX'),
        kind: body.kind,
        site: settings.sites[0],
        status: 'expected',
        createdBy: userRef(user),
      });
    } catch (err) {
      if (/** @type {any} */ (err)?.code === 11000) continue; // code collision: retry
      throw err;
    }
  }
  if (!e) throw conflict('Could not allocate a reference number. Try again.');

  emitExpectedChanged(e);
  const me = user._id.toString();
  const title = `📅 Expected: ${who(e)} ${whenText(e.expectedAt)}`;
  void notify(
    gateStaffIds().then((ids) => ids.filter((id) => id !== me)),
    {
      event: 'expected_new',
      title,
      body: `For ${e.host.name}${e.company && e.kind === 'visitor' ? ` · ${e.company}` : ''}${boxesText(e)}${
        e.preapproved ? ' · pre-approved' : ''
      }`,
      data: data(e),
    },
  );
  // The people it's for hear about it when someone else registered it.
  const others = [e.host.id, e.contact?.id, ...e.also.map((/** @type {any} */ a) => a.id)].filter(
    (id) => id && id !== me,
  );
  if (others.length) {
    void notify(others, {
      event: 'expected_new',
      title,
      body: `Registered by ${user.name}${e.kind === 'visitor' ? ` for ${e.host.name}` : ''}`,
      data: data(e),
    });
  }
  res.status(201).json({ expected: serializeExpected(e) });
});

expectedRouter.patch('/:id', async (req, res) => {
  const user = currentUser(req);
  const e = await findExpected(String(req.params.id), user);
  if (!canManage(e, user)) throw forbidden('Only security, an admin, whoever registered it or the host can change it.');
  if (e.status !== 'expected') throw conflict('It has already arrived or been cancelled.');
  const body = patchSchema.parse(req.body ?? {});
  const settings = await getSettings();
  const fields = await resolveFields({ ...currentFields(e), ...body }, settings);
  const updated = await Expected.findOneAndUpdate(
    { _id: e._id, status: 'expected' },
    { $set: fields },
    { returnDocument: 'after' },
  );
  if (!updated) throw conflict('It has just arrived or been cancelled. Refresh to see it.');
  emitExpectedChanged(updated);
  res.json({ expected: serializeExpected(updated) });
});

expectedRouter.post('/:id/cancel', async (req, res) => {
  const user = currentUser(req);
  const e = await findExpected(String(req.params.id), user);
  if (!canManage(e, user)) throw forbidden('Only security, an admin, whoever registered it or the host can cancel it.');
  const updated = await Expected.findOneAndUpdate(
    { _id: e._id, status: 'expected' },
    { $set: { status: 'cancelled', cancelledAt: new Date(), cancelledBy: userRef(user) } },
    { returnDocument: 'after' },
  );
  if (!updated) throw conflict('It has already arrived or been cancelled.');
  emitExpectedChanged(updated);
  const me = user._id.toString();
  void notify(
    Promise.all([gateStaffIds(), expectedPeople(updated)]).then(([gate, people]) =>
      [...gate, ...people].filter((id) => id !== me),
    ),
    {
      event: 'expected_cancelled',
      title: `🚫 Cancelled: ${who(updated)} ${whenText(updated.expectedAt)}`,
      body: `Cancelled by ${user.name}`,
      data: data(updated),
    },
  );
  res.json({ expected: serializeExpected(updated) });
});

// POST /api/expected/:id/received — security received an expected delivery (boxes only, nobody checked in)
expectedRouter.post('/:id/received', canReceive, async (req, res) => {
  const user = currentUser(req);
  const e = await findExpected(String(req.params.id), user);
  if (e.kind !== 'delivery') throw conflict('Expected visitors are checked in, not received.');
  const updated = await Expected.findOneAndUpdate(
    { _id: e._id, status: 'expected' },
    { $set: { status: 'arrived', arrivedAt: new Date(), arrivedBy: userRef(user) } },
    { returnDocument: 'after' },
  );
  if (!updated) throw conflict('It has already been received or cancelled.');
  emitExpectedChanged(updated);
  void notify(expectedPeople(updated), {
    event: 'expected_arrived',
    title: `📦 ${who(updated)} received`,
    body: `At the gate${boxesText(updated)} · received by ${user.name}`,
    data: data(updated),
  });
  res.json({ expected: serializeExpected(updated) });
});

// ---------------------------------------------------------------- used by check-in (routes/visits.js)

/**
 * The open expected visitor a check-in refers to, or a validation error.
 * @param {string} code
 */
export async function expectedForCheckIn(code) {
  const e = await Expected.findOne({ code: code.trim().toUpperCase() });
  if (!e || e.kind !== 'visitor') throw badRequest('Expected visitor not found.', 'expectedId');
  if (e.status !== 'expected') {
    throw badRequest(
      e.status === 'arrived' ? 'This expected visitor has already been checked in.' : 'This pre-registration was cancelled.',
      'expectedId',
    );
  }
  return e;
}

/**
 * After a check-in from an expected visitor: mark it arrived, link the visit, and tell the people concerned
 * (the host is told by the check-in itself when they still have to answer).
 * @param {any} expected Expected document
 * @param {any} visit Visit document
 * @param {any} guard
 */
export async function markExpectedArrived(expected, visit, guard) {
  const updated = await Expected.findOneAndUpdate(
    { _id: expected._id, status: 'expected' },
    { $set: { status: 'arrived', arrivedAt: visit.inAt, arrivedBy: userRef(guard), visitId: visit.pass } },
    { returnDocument: 'after' },
  );
  if (!updated) return;
  emitExpectedChanged(updated);
  const askedInApp = visit.hostStatus === 'waiting' ? visit.hostId : null;
  const people = expectedPeople(updated).filter((id) => id !== askedInApp && id !== guard._id.toString());
  if (people.length) {
    void notify(people, {
      event: 'expected_arrived',
      title: `✅ ${visit.name} has arrived`,
      body:
        visit.hostVia === 'preapproved'
          ? `Pre-approved · pass ${visit.badge} · meeting ${visit.host}`
          : `Pass ${visit.badge} · meeting ${visit.host}`,
      // Opens the entry: the visit itself is only readable by the employee it was checked in to.
      data: data(updated),
    });
  }
}
