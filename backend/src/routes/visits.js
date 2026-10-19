import { Router } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { z } from 'zod';
import { config } from '../config.js';
import { currentUser, requireAuth, requireGate, requireModule, requireRole } from '../middleware/auth.js';
import { ApiError, badRequest, conflict, forbidden, notFound } from '../middleware/error.js';
import { RECIPIENT_FILTER, User, canSignIn } from '../models/User.js';
import { ID_TYPES, Visit } from '../models/Visit.js';
import { emitVisitCreated, emitVisitUpdated } from '../realtime.js';
import { visitsToCsv } from '../services/csv.js';
import { formatDateTime, formatTime, isoDay } from '../services/format.js';
import { notifyHostApproval } from '../services/hostApproval.js';
import { expectedForCheckIn, markExpectedArrived } from './expected.js';
import { createAgreement, createAgreementSoon } from '../services/agreement.js';
import { ID_PHOTO_MAX_EDGE, PHOTO_MAX_EDGE, deleteImage, storeImage } from '../services/images.js';
import { PACE_ID_PREFIX, upsertPaceRecipient } from '../services/pace.js';
import { paginate, parseListQuery, queryString, searchFilter } from '../services/pagination.js';
import { generatePassNumber } from '../services/passNumber.js';
import { serializeVisit, visitFields } from '../services/serialize.js';
import { getSettings } from '../services/settings.js';

export const visitsRouter = Router();
// The host routes (/mine, /:id/respond) are open to every signed-in user and scoped to their own visitors.
// Everything registered after `visitsRouter.use(requireGate)` below is for gate users only: Employee (`host`)
// accounts get 403 there.
visitsRouter.use(requireAuth);

const canWrite = requireRole('security', 'admin');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 2, fields: 40, fieldSize: 16 * 1024 },
}).fields([
  { name: 'photo', maxCount: 1 },
  { name: 'idPhoto', maxCount: 1 },
]);

const SEARCH_FIELDS = ['badge', 'name', 'phone', 'pass', 'company', 'host', 'vehicle', 'dept'];
const LIST_OPTS = { sortFields: ['inAt', 'outAt', 'name', 'badge'], defaultSort: '-inAt' };
const INSIDE_OPTS = { sortFields: ['inAt', 'name', 'badge'], defaultSort: 'inAt' };
const LOOKUP_OPTS = { sortFields: ['inAt'], defaultSort: '-inAt', defaultLimit: 5 };
const EXPORT_CAP = 10_000;
const STATUSES = ['all', 'in', 'out', 'over', 'waiting', 'declined', 'noreply'];
const MINE_SCOPES = ['all', 'waiting', 'current', 'earlier'];
const HOUR_MS = 3_600_000;

/** Open visits that need something from security now (the gate alert banner). */
const ATTENTION_FILTER = {
  $or: [
    { hostStatus: 'accepted', allowedAt: null }, // send in
    { hostStatus: 'declined' }, // record the exit
    { hostStatus: 'waiting', escalatedAt: { $ne: null }, allowedAt: null }, // call the host
    { hostStatus: 'manual', allowedAt: null }, // confirm by phone
  ],
};
/** Still at the gate: not let in yet and not declined (visits from before host approval have no hostStatus). */
const WAITING_FILTER = { outAt: null, allowedAt: null, hostStatus: { $in: ['waiting', 'manual', 'accepted'] } };

const ALREADY_INSIDE = 'This mobile number is already inside. Close the open entry first.';

// ---------------------------------------------------------------- helpers

/** @param {string} s */
const digitsOf = (s) => s.replace(/\D/g, '');
/** @param {string} phone */
const last10 = (phone) => digitsOf(phone).slice(-10);

/**
 * @param {Record<string, unknown>} query
 * @param {string} key
 */
function isoParam(query, key) {
  const raw = queryString(query, key);
  if (raw === undefined) return undefined;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) throw badRequest(`${key} must be an ISO date-time.`, key);
  return d;
}

/**
 * Filters shared by GET /api/visits and the CSV export: from, to, site, status, q.
 * @param {Record<string, unknown>} query
 * @param {string | undefined} q
 * @param {number} overstayHours
 * @param {number} nowMs
 */
function logFilter(query, q, overstayHours, nowMs) {
  /** @type {Record<string, any>} */
  const filter = {};
  /** @type {Record<string, Date>} */
  const inAt = {};
  const from = isoParam(query, 'from');
  const to = isoParam(query, 'to');
  if (from) inAt.$gte = from;
  if (to) inAt.$lt = to;

  const site = queryString(query, 'site');
  if (site) filter.site = site;

  const status = queryString(query, 'status') ?? 'all';
  if (!STATUSES.includes(status)) throw badRequest(`status must be one of: ${STATUSES.join(', ')}.`, 'status');
  if (status === 'in') filter.outAt = null;
  if (status === 'waiting') Object.assign(filter, WAITING_FILTER);
  if (status === 'declined') filter.hostStatus = 'declined';
  if (status === 'noreply') filter.escalatedAt = { $ne: null };
  if (status === 'out') filter.outAt = { $ne: null };
  if (status === 'over') {
    filter.outAt = null;
    const cutoff = new Date(nowMs - overstayHours * HOUR_MS);
    if (!inAt.$lt || cutoff < inAt.$lt) inAt.$lt = cutoff;
  }
  if (Object.keys(inAt).length > 0) filter.inAt = inAt;
  return { ...filter, ...searchFilter(q, SEARCH_FIELDS) };
}

/** @param {any} v */
function badgeInUseMessage(v) {
  return `Pass ${v.badge} is with ${v.name} (inside since ${formatTime(v.inAt)}). Use another pass or check them out first.`;
}

/** @param {string} id */
async function findVisit(id) {
  const visit = await Visit.findOne({ pass: id.trim().toUpperCase() });
  if (!visit) throw notFound('Entry not found.');
  return visit;
}

/** @param {any} user */
const guardRef = (user) => ({ id: user._id.toString(), name: user.name });

// ---------------------------------------------------------------- host (any signed-in user, own visitors)

/** Filter for one scope of the caller's own visitors. @param {string} scope @param {string} me */
function mineFilter(scope, me) {
  if (scope === 'waiting') return { hostId: me, outAt: null, hostStatus: 'waiting' };
  if (scope === 'current') return { hostId: me, outAt: null, hostStatus: { $ne: 'waiting' } };
  if (scope === 'earlier') return { hostId: me, outAt: { $ne: null } };
  return { hostId: me };
}

// GET /api/visits/mine?scope=waiting|current|earlier|all — paginated visitors of the signed-in user + counts
visitsRouter.get('/mine', async (req, res) => {
  const now = Date.now();
  const me = currentUser(req)._id.toString();
  const scope = queryString(req.query, 'scope') ?? 'all';
  if (!MINE_SCOPES.includes(scope)) throw badRequest(`scope must be one of: ${MINE_SCOPES.join(', ')}.`, 'scope');
  // Waiting visitors oldest first (who has waited longest); everything else newest first.
  const lq = parseListQuery(req.query, { sortFields: ['inAt'], defaultSort: scope === 'waiting' ? 'inAt' : '-inAt' });
  const { overstayHours } = await getSettings();
  const [page, waiting, current] = await Promise.all([
    paginate(Visit, { ...mineFilter(scope, me), ...searchFilter(lq.q, SEARCH_FIELDS) }, lq, (v) =>
      serializeVisit(v, overstayHours, now),
    ),
    Visit.countDocuments(mineFilter('waiting', me)),
    Visit.countDocuments(mineFilter('current', me)),
  ]);
  res.json({ ...page, counts: { waiting, current } });
});

/**
 * Is `me` the host's manager, at any level up `reportsTo`? (Escalations about a visitor reach them.)
 * @param {string | null} hostId @param {string} me
 */
async function managesHost(hostId, me) {
  let cur = hostId ? await User.findById(hostId, { reportsTo: 1 }).lean() : null;
  for (let i = 0; i < 8 && cur?.reportsTo; i++) {
    if (cur.reportsTo.toString() === me) return true;
    cur = await User.findById(cur.reportsTo, { reportsTo: 1 }).lean();
  }
  return false;
}

// GET /api/visits/mine/:id — one of the signed-in user's own visitors (or of someone who reports to them)
visitsRouter.get('/mine/:id', async (req, res) => {
  const visit = await findVisit(String(req.params.id));
  const me = currentUser(req)._id.toString();
  if (visit.hostId !== me && !(await managesHost(visit.hostId, me))) throw notFound('Entry not found.');
  const { overstayHours } = await getSettings();
  res.json({ visit: await serializeVisit(visit, overstayHours) });
});

const respondSchema = z.object({
  status: z.enum(['accepted', 'declined'], { error: 'status must be accepted or declined.' }),
  note: z.string({ error: 'The message must be text.' }).trim().max(200, 'The message is too long (max 200).').optional(),
});

// POST /api/visits/:id/respond { status, note? } — the host (or an admin) accepts or declines a waiting visitor
visitsRouter.post('/:id/respond', async (req, res) => {
  const user = currentUser(req);
  const body = respondSchema.parse(req.body ?? {});
  const visit = await findVisit(String(req.params.id));
  if (visit.hostId !== user._id.toString() && user.role !== 'admin') throw forbidden('This visitor is not for you.');

  const { overstayHours } = await getSettings();
  const updated = await Visit.findOneAndUpdate(
    { _id: visit._id, outAt: null, hostStatus: 'waiting' },
    {
      $set: { hostStatus: body.status, hostAt: new Date(), hostBy: guardRef(user), hostVia: 'app', hostNote: body.note ?? '' },
    },
    { returnDocument: 'after' },
  );
  if (!updated) {
    const current = (await Visit.findById(visit._id)) ?? visit;
    const message = current.outAt ? `${visit.name} has already left.` : 'Security has already handled this visitor.';
    throw conflict(message, undefined, { visit: await serializeVisit(current, overstayHours) });
  }

  emitVisitUpdated(updated);
  void notifyHostApproval.replied(updated);
  res.json({ visit: await serializeVisit(updated, overstayHours) });
});

// Everything below is for gate users (admin / security / viewer) only.
visitsRouter.use(requireGate);
// Module access: the gate register needs Visitors (Overview / TRACK also reads it).
visitsRouter.use(requireModule('visitors', 'track'));

// ---------------------------------------------------------------- reads

// GET /api/visits — paginated log + summary over the whole filtered set
visitsRouter.get('/', async (req, res) => {
  const now = Date.now();
  const lq = parseListQuery(req.query, LIST_OPTS);
  const { overstayHours } = await getSettings();
  const filter = logFilter(req.query, lq.q, overstayHours, now);
  const [page, agg] = await Promise.all([
    paginate(Visit, filter, lq, (v) => serializeVisit(v, overstayHours, now)),
    Visit.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          persons: { $sum: { $ifNull: ['$persons', 1] } },
          inside: { $sum: { $cond: [{ $eq: [{ $ifNull: ['$outAt', null] }, null] }, 1, 0] } },
        },
      },
    ]),
  ]);
  res.json({ ...page, summary: { persons: agg[0]?.persons ?? 0, inside: agg[0]?.inside ?? 0 } });
});

// GET /api/visits/inside — paginated open visits; filters site, overstay, attention
visitsRouter.get('/inside', async (req, res) => {
  const now = Date.now();
  const lq = parseListQuery(req.query, INSIDE_OPTS);
  const { overstayHours } = await getSettings();
  /** @type {Record<string, any>} */
  const filter = { outAt: null };
  const site = queryString(req.query, 'site');
  if (site) filter.site = site;
  const overstay = queryString(req.query, 'overstay');
  if (overstay !== undefined) {
    if (overstay !== 'true' && overstay !== 'false') throw badRequest('overstay must be true or false.', 'overstay');
    const cutoff = new Date(now - overstayHours * HOUR_MS);
    filter.inAt = overstay === 'true' ? { $lt: cutoff } : { $gte: cutoff };
  }
  const attention = queryString(req.query, 'attention');
  if (attention !== undefined && attention !== 'true' && attention !== 'false') {
    throw badRequest('attention must be true or false.', 'attention');
  }
  // Both filters are `$or`s, so combine them with `$and`.
  const ors = [attention === 'true' ? ATTENTION_FILTER : null, searchFilter(lq.q, SEARCH_FIELDS)].filter(
    (f) => f && Object.keys(f).length > 0,
  );
  if (ors.length > 0) filter.$and = ors;
  res.json(await paginate(Visit, filter, lq, (v) => serializeVisit(v, overstayHours, now)));
});

// GET /api/visits/lookup?phone= — open visit + paginated closed history (newest first)
visitsRouter.get('/lookup', async (req, res) => {
  const now = Date.now();
  const lq = parseListQuery(req.query, LOOKUP_OPTS);
  const phone10 = last10(queryString(req.query, 'phone') ?? '');
  if (phone10.length < 10) {
    res.json({
      open: null,
      data: [],
      pagination: { page: lq.page, limit: lq.limit, total: 0, totalPages: 0, hasNextPage: false, hasPrevPage: lq.page > 1 },
    });
    return;
  }
  const { overstayHours } = await getSettings();
  const map = (/** @type {any} */ v) => serializeVisit(v, overstayHours, now);
  const [open, history] = await Promise.all([
    Visit.findOne({ phone10, outAt: null }),
    paginate(Visit, { phone10, outAt: { $ne: null } }, lq, map),
  ]);
  res.json({ open: open ? await map(open) : null, ...history });
});

// GET /api/visits/badge-check?badge=&site= (site optional: defaults to the first gate)
visitsRouter.get('/badge-check', async (req, res) => {
  const badge = queryString(req.query, 'badge')?.toUpperCase();
  if (!badge) throw badRequest('Enter a pass number.', 'badge');
  const { overstayHours, sites } = await getSettings();
  const site = queryString(req.query, 'site') || sites[0];
  const visit = await Visit.findOne({ site, badge, outAt: null });
  res.json({ inUse: visit ? await serializeVisit(visit, overstayHours) : null });
});

// GET /api/visits/export.csv — same filters/q/sort as the log, not paginated, capped
visitsRouter.get('/export.csv', async (req, res) => {
  const now = Date.now();
  const { page: _p, limit: _l, ...rest } = req.query;
  const lq = parseListQuery(rest, LIST_OPTS);
  const { overstayHours } = await getSettings();
  const filter = logFilter(req.query, lq.q, overstayHours, now);
  const visits = await Visit.find(filter).sort(lq.sort).limit(EXPORT_CAP);
  const csv = visitsToCsv(visits.map((v) => visitFields(v, overstayHours, now)));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="visitor-log-${isoDay(new Date(now))}.csv"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(csv);
});

visitsRouter.get('/:id', async (req, res) => {
  const visit = await findVisit(String(req.params.id));
  const { overstayHours } = await getSettings();
  res.json({ visit: await serializeVisit(visit, overstayHours) });
});

// ---------------------------------------------------------------- check-in

/** @type {Record<string, string>} */
const FIELD_LABELS = {
  badge: 'Pass number',
  phone: 'Mobile number',
  name: 'Visitor name',
  purpose: 'Purpose',
  host: 'Whom to meet',
  site: 'Gate',
};
// `host` is also required unless `hostId` (a Gatebook employee) is given.
const REQUIRED = ['badge', 'phone', 'name', 'purpose'];
/** @type {Record<string, number>} */
const MAX_LEN = {
  name: 100, phone: 20, company: 120, purpose: 80, host: 100, dept: 80, vehicle: 20, items: 300, notes: 1000, site: 80,
};

/**
 * Validates multipart fields (contract rules 1–2 plus formats).
 * @param {Record<string, unknown>} body
 * @param {Record<string, Express.Multer.File[]>} files
 * @param {{ visitorPhotoRequired: boolean, visitorPassRequired: boolean }} rules  settings rules
 */
function parseCheckIn(body, files, rules) {
  /** @param {string} k */
  const text = (k) => {
    const v = body[k];
    const s = Array.isArray(v) ? v[0] : v;
    return typeof s === 'string' ? s.trim() : '';
  };

  // Rule 1: required fields
  for (const f of REQUIRED) {
    if (f === 'badge' && !rules.visitorPassRequired) continue;
    if (!text(f)) throw badRequest(`${FIELD_LABELS[f]} is required.`, f);
  }
  if (!text('host') && !text('hostId')) throw badRequest(`${FIELD_LABELS.host} is required.`, 'host');
  if (rules.visitorPhotoRequired && !files.photo?.[0]) throw badRequest('Take the visitor photo.', 'photo');

  for (const [k, max] of Object.entries(MAX_LEN)) {
    if (text(k).length > max) throw badRequest(`${k} is too long (max ${max} characters).`, k);
  }

  const badge = text('badge').toUpperCase();
  if (badge && !/^[A-Z0-9-]{1,12}$/.test(badge)) {
    throw badRequest('Pass number can only use letters, digits and "-" (max 12).', 'badge');
  }

  // Rule 2: phone has at least 10 digits
  const phone = text('phone');
  if (digitsOf(phone).length < 10) throw badRequest('Enter a mobile number with at least 10 digits.', 'phone');

  const personsRaw = text('persons');
  const persons = personsRaw === '' ? 1 : Number(personsRaw);
  if (!Number.isInteger(persons) || persons < 1 || persons > 50) {
    throw badRequest('No. of persons must be a whole number from 1 to 50.', 'persons');
  }

  const idType = text('idType') || 'Aadhaar';
  if (!ID_TYPES.includes(/** @type {any} */ (idType))) throw badRequest('Choose a valid ID type.', 'idType');

  const idLast4 = text('idLast4');
  if (!/^\d{0,4}$/.test(idLast4)) throw badRequest('ID last 4 must be up to 4 digits.', 'idLast4');

  return {
    badge,
    phone,
    phone10: last10(phone),
    name: text('name'),
    company: text('company'),
    persons,
    purpose: text('purpose'),
    host: text('host'),
    hostId: text('hostId'),
    expectedId: text('expectedId'),
    termsAccepted: text('termsAccepted') === 'true',
    dept: text('dept'),
    idType,
    idLast4,
    vehicle: text('vehicle').toUpperCase(),
    items: text('items'),
    notes: text('notes'),
    site: text('site'),
  };
}

/** Rules 4 and 5. @param {{ phone10: string, site: string, badge: string }} input */
async function assertNoOpenConflicts(input) {
  if (await Visit.exists({ phone10: input.phone10, outAt: null })) {
    throw new ApiError(409, 'already_inside', ALREADY_INSIDE, 'phone');
  }
  if (!input.badge) return; // no pass given (allowed by settings)
  const holder = await Visit.findOne({ site: input.site, badge: input.badge, outAt: null });
  if (holder) throw new ApiError(409, 'badge_in_use', badgeInUseMessage(holder), 'badge');
}

/** @param {unknown} e @returns {{ keyPattern?: Record<string, unknown> } | null} */
function asDupKey(e) {
  return typeof e === 'object' && e !== null && /** @type {any} */ (e).code === 11000 ? /** @type {any} */ (e) : null;
}

/**
 * Who is being visited. A picked employee (`hostId`, same ids as GET /api/hosts) who can sign in is asked to
 * accept (`waiting`); a typed name, or an employee who can't sign in, is confirmed by phone (`manual`).
 * @param {{ hostId: string, host: string, dept: string }} input
 */
async function resolveHost(input) {
  if (!input.hostId) {
    return { hostId: null, host: input.host, dept: input.dept, hostPhone: '', hostLocation: '', hostStatus: 'manual' };
  }
  let user;
  if (input.hostId.startsWith(PACE_ID_PREFIX)) {
    user = await upsertPaceRecipient(input.hostId, 'hostId');
  } else {
    user = mongoose.isValidObjectId(input.hostId) ? await User.findOne({ _id: input.hostId, ...RECIPIENT_FILTER }) : null;
  }
  if (!user) throw badRequest('Choose the employee from the list, or type their name.', 'hostId');
  const signsIn = canSignIn(user);
  return {
    hostId: user._id.toString(),
    host: user.name,
    dept: input.dept || (user.dept ?? ''),
    hostPhone: user.phone ?? '',
    hostLocation: user.location ?? '',
    hostStatus: signsIn ? 'waiting' : 'manual',
  };
}

visitsRouter.post('/', canWrite, upload, async (req, res) => {
  const guard = currentUser(req);
  const files = /** @type {Record<string, Express.Multer.File[]>} */ (req.files ?? {});
  const settings = await getSettings();
  const input = parseCheckIn(req.body ?? {}, files, settings);
  if (settings.terms.required && !input.termsAccepted) {
    throw badRequest('The visitor must agree to the terms and conditions.', 'terms');
  }

  // Rule 3. `site` is optional: with a single gate the apps don't send it, so default to the first gate.
  if (!input.site) input.site = settings.sites[0];
  if (!settings.sites.includes(input.site)) throw badRequest(`"${input.site}" is not a gate in settings.`, 'site');
  if (!settings.purposes.includes(input.purpose)) {
    throw badRequest(`"${input.purpose}" is not a purpose in settings.`, 'purpose');
  }
  const host = await resolveHost(input);
  // Checked in from a pre-registration: pre-approved visitors meeting the expected employee skip the host question.
  const expected = input.expectedId ? await expectedForCheckIn(input.expectedId) : null;
  /** @type {Record<string, unknown>} */
  let preapproval = {};
  if (
    expected?.preapproved &&
    host.hostStatus === 'waiting' &&
    (host.hostId === expected.host.id || host.hostId === expected.contact?.id)
  ) {
    preapproval = { hostStatus: 'accepted', hostVia: 'preapproved', hostAt: new Date(), hostBy: expected.createdBy };
  }

  // Rules 4, 5
  await assertNoOpenConflicts(input);

  // Rule 6
  const photo = files.photo?.[0] ? await storeImage(files.photo[0].buffer, PHOTO_MAX_EDGE, 'photo') : '';
  let idPhoto = null;
  try {
    if (files.idPhoto?.[0]) idPhoto = await storeImage(files.idPhoto[0].buffer, ID_PHOTO_MAX_EDGE, 'idPhoto');
  } catch (e) {
    await deleteImage(photo);
    throw e;
  }

  const guardIn = { id: guard._id.toString(), name: guard.name };
  let visit = null;
  for (let attempt = 0; attempt < 8 && !visit; attempt++) {
    const now = new Date();
    try {
      visit = await Visit.create({
        ...input,
        ...host,
        ...preapproval,
        expectedId: expected ? expected.code : null,
        // Accepted with the photo at check-in: the agreement PDF is made right after.
        ...(input.termsAccepted ? { termsVersion: settings.terms.version, termsAt: now } : {}),
        pass: generatePassNumber(now),
        passReturned: null,
        inAt: now,
        outAt: null,
        photo,
        idPhoto,
        guardIn,
        guardOut: null,
        exitNote: '',
      });
    } catch (e) {
      const dup = asDupKey(e);
      if (dup?.keyPattern && 'pass' in dup.keyPattern) continue; // pass-number collision: retry
      await Promise.all([deleteImage(photo), deleteImage(idPhoto)]);
      if (dup) {
        // Lost a race with a concurrent check-in (partial unique index): report it like the pre-checks would.
        await assertNoOpenConflicts(input);
        throw conflict('This entry clashes with another check-in. Try again.');
      }
      throw e;
    }
  }
  if (!visit) {
    await Promise.all([deleteImage(photo), deleteImage(idPhoto)]);
    throw new ApiError(500, 'internal', 'Could not allocate an entry number. Try again.');
  }

  emitVisitCreated(visit);
  if (visit.hostStatus === 'waiting') void notifyHostApproval.arrived(visit);
  if (expected) await markExpectedArrived(expected, visit, guard);
  if (visit.termsAt) createAgreementSoon(visit.pass);
  res.status(201).json({ visit: await serializeVisit(visit, settings.overstayHours) });
});

// POST /api/visits/:id/agreement — (re)create the agreement PDF of a visit that accepted the terms → { visit }
visitsRouter.post('/:id/agreement', canWrite, async (req, res) => {
  const visit = await findVisit(String(req.params.id));
  if (!visit.termsAt) throw conflict('This visitor did not accept the terms, so there is no agreement.');
  const updated = await createAgreement(visit.pass);
  const { overstayHours } = await getSettings();
  res.json({ visit: await serializeVisit(updated ?? visit, overstayHours) });
});

// ---------------------------------------------------------------- exit

const exitSchema = z.object({
  outAt: z.string({ error: 'Exit time must be a date-time.' }).optional(),
  exitNote: z.string({ error: 'Exit remarks must be text.' }).max(1000, 'Exit remarks are too long.').optional(),
  passReturned: z.boolean({ error: 'passReturned must be true or false.' }).optional(),
});

visitsRouter.post('/:id/exit', canWrite, async (req, res) => {
  const user = currentUser(req);
  const body = exitSchema.parse(req.body ?? {});
  const visit = await findVisit(String(req.params.id));

  const wasClosed = visit.outAt != null;
  if (wasClosed && user.role !== 'admin') {
    throw conflict(`${visit.name} has already exited. Only an admin can correct the exit time.`);
  }

  const now = Date.now();
  let outAt = new Date(now);
  if (body.outAt !== undefined && body.outAt !== '') {
    outAt = new Date(body.outAt);
    if (Number.isNaN(outAt.getTime())) throw badRequest('Exit time must be a valid date-time.', 'outAt');
  }
  if (outAt.getTime() < visit.inAt.getTime()) {
    throw badRequest(`Exit time cannot be before check-in (${formatDateTime(visit.inAt)}).`, 'outAt');
  }
  if (outAt.getTime() > now + 5 * 60_000) throw badRequest('Exit time cannot be in the future.', 'outAt');

  const passReturned =
    body.passReturned ?? (wasClosed && typeof visit.passReturned === 'boolean' ? visit.passReturned : Boolean(visit.badge));
  const exitNote = body.exitNote !== undefined ? body.exitNote.trim() : wasClosed ? (visit.exitNote ?? '') : '';

  // Conditional update guards against two guards closing the same visit at once.
  const updated = await Visit.findOneAndUpdate(
    { _id: visit._id, outAt: wasClosed ? visit.outAt : null },
    { $set: { outAt, passReturned, exitNote, guardOut: { id: user._id.toString(), name: user.name } } },
    { returnDocument: 'after' },
  );
  if (!updated) throw conflict(`${visit.name}'s exit was just recorded by someone else. Refresh to see it.`);

  emitVisitUpdated(updated);
  const { overstayHours } = await getSettings();
  res.json({ visit: await serializeVisit(updated, overstayHours) });
});

// ---------------------------------------------------------------- allow in

const allowSchema = z.object({
  /** true = security confirmed with the host by phone (host not on Gatebook, or no reply in the app). */
  viaPhone: z.boolean({ error: 'viaPhone must be true or false.' }).optional(),
});

// POST /api/visits/:id/allow { viaPhone? } — security lets the visitor in
visitsRouter.post('/:id/allow', canWrite, async (req, res) => {
  const user = currentUser(req);
  const { viaPhone = false } = allowSchema.parse(req.body ?? {});
  const visit = await findVisit(String(req.params.id));
  const { overstayHours } = await getSettings();

  if (visit.outAt) throw conflict(`${visit.name} has already left.`);
  // Visits from before host approval were let in at check-in.
  if (visit.allowedAt || !visit.hostStatus) throw conflict(`${visit.name} has already been let in.`);
  if (visit.hostStatus === 'declined') {
    throw conflict(`${visit.host} declined this visitor. Collect the pass and record the exit.`);
  }
  if (!viaPhone && visit.hostStatus !== 'accepted') {
    throw conflict(`${visit.host} has not accepted yet. Call them, then use "Confirmed by phone".`);
  }

  const now = new Date();
  const by = guardRef(user);
  /** @type {Record<string, unknown>} */
  const set = { allowedAt: now, allowedBy: by };
  /** @type {Record<string, unknown>} */
  const where = { _id: visit._id, outAt: null, allowedAt: null };
  if (viaPhone && visit.hostStatus !== 'accepted') {
    Object.assign(set, { hostStatus: 'accepted', hostAt: now, hostBy: by, hostVia: 'phone' });
    where.hostStatus = { $in: ['waiting', 'manual'] };
  } else {
    where.hostStatus = 'accepted';
  }

  const updated = await Visit.findOneAndUpdate(where, { $set: set }, { returnDocument: 'after' });
  if (!updated) {
    const current = (await Visit.findById(visit._id)) ?? visit;
    throw conflict(`${visit.name}'s entry was just changed by someone else. Refresh to see it.`, undefined, {
      visit: await serializeVisit(current, overstayHours),
    });
  }

  emitVisitUpdated(updated);
  res.json({ visit: await serializeVisit(updated, overstayHours) });
});
