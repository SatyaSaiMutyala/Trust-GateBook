import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { currentUser, requireAuth, requireGate, requireModule, requireRole } from '../middleware/auth.js';
import { badRequest, conflict, notFound } from '../middleware/error.js';
import { Key, KeyMove } from '../models/Key.js';
import { User } from '../models/User.js';
import { emitKeysChanged, emitToUser } from '../realtime.js';
import { csvRow } from '../services/csv.js';
import { formatDateTime, formatDuration, formatTime } from '../services/format.js';
import { notify } from '../services/notify.js';
import { PACE_ID_PREFIX, upsertPaceRecipient } from '../services/pace.js';
import { paginate, parseListQuery, queryString, searchFilter } from '../services/pagination.js';
import { moveState, serializeKey, serializeMove } from '../services/serializeOps.js';
import { getSettings } from '../services/settings.js';
import { localDayStart } from './stats.js';

/**
 * Key register (docs/API.md "Key register"): `/api/keys` (the key board) and `/api/keymoves` (the key diary).
 * Gate users with the `keys` module; security and admins issue and take back keys, admins add and edit keys.
 */
export const keysRouter = Router();
export const keyMovesRouter = Router();
for (const r of [keysRouter, keyMovesRouter]) r.use(requireAuth, requireGate, requireModule('keys'));
/** `/api/mykeys`: the keys issued to the signed-in person (any role, read only). */
export const myKeysRouter = Router();
myKeysRouter.use(requireAuth);

const canWork = requireRole('security', 'admin');
const DAY_MS = 86_400_000;
const MAX_DUE_MS = 30 * DAY_MS;
const EXPORT_CAP = 10_000;
const PERIODS = /** @type {Record<string, number>} */ ({ today: 0, '7d': 7, '30d': 30, '90d': 90 });
const STATES = ['all', 'out', 'overdue', 'returned'];
const SEARCH_FIELDS = [
  'key.number',
  'key.name',
  'key.location',
  'taker.name',
  'taker.phone',
  'purpose',
  'returnedByName',
];

/** @param {any} u */
const userRef = (u) => ({ id: u._id.toString(), name: u.name });
/** @param {string} label @param {number} max */
const text = (label, max) =>
  z
    .string({ error: `${label} must be text.` })
    .trim()
    .max(max, `${label} is too long (max ${max}).`);

/** A key with its open moves, as the API shows it. @param {any} key */
async function keyView(key) {
  const open = await KeyMove.find({ 'key.id': key._id.toString(), returnedAt: null }).sort({ issuedAt: 1 }).lean();
  return serializeKey(key, open);
}

/** @param {string} id */
async function findKey(id) {
  const key = mongoose.isValidObjectId(id) ? await Key.findById(id) : null;
  if (!key) throw notFound('Key not found.');
  return key;
}

/** Sends the board's new view of a key to the gate. @param {any} key */
async function changed(key) {
  const view = await keyView(key);
  emitKeysChanged(view);
  return view;
}

/** Tells the holder (when on Gatebook) that their keys changed. @param {any} move */
function holderChanged(move) {
  if (move.taker?.id) emitToUser(move.taker.id, 'mykeys:changed', { move: serializeMove(move) });
}

/** Duplicate key number at the site → 409. @param {unknown} e @param {string} number @param {string} site */
function duplicate(e, number, site) {
  if (/** @type {any} */ (e)?.code === 11000)
    return conflict(`Key number ${number} already exists at ${site}.`, 'number');
  return e;
}

// ---------------------------------------------------------------- the key board

// GET /api/keys?site=&q= — every key with the copies out now; `counts` over the keys in use
keysRouter.get('/', async (req, res) => {
  const site = queryString(req.query, 'site');
  const q = queryString(req.query, 'q');
  /** @type {Record<string, unknown>} */
  const filter = { ...(site ? { site } : {}), ...searchFilter(q, ['number', 'name', 'location']) };
  const [keys, open] = await Promise.all([
    Key.find(filter).sort({ site: 1, number: 1 }).limit(2000).lean(),
    KeyMove.find({ returnedAt: null, ...(site ? { site } : {}) })
      .sort({ issuedAt: 1 })
      .lean(),
  ]);
  /** @type {Map<string, any[]>} */
  const byKey = new Map();
  for (const m of open) byKey.set(m.key.id, [...(byKey.get(m.key.id) ?? []), m]);
  const nowMs = Date.now();
  const data = keys.map((k) => serializeKey(k, byKey.get(k._id.toString()) ?? [], nowMs));
  const inUse = data.filter((k) => k.active);
  res.json({
    keys: data,
    counts: {
      total: inUse.length,
      out: inUse.filter((k) => k.out.length).length,
      available: inUse.filter((k) => k.out.length < k.copies).length,
      overdue: inUse.filter((k) => k.out.some((m) => m.state === 'overdue')).length,
    },
  });
});

const keySchema = z.object({
  number: text('Key number', 20).transform((s) => s.toUpperCase()),
  name: text('What it opens', 120),
  location: text('Location', 120).default(''),
  site: text('Gate / site', 80),
  copies: z.number({ error: 'Copies must be a whole number from 1 to 20.' }).int().min(1).max(20).default(1),
  restricted: z.boolean({ error: 'restricted must be true or false.' }).default(false),
  authorised: text('Who may take it', 200).default(''),
});
const REQUIRED_MSG = 'Key number, what it opens and gate/site are required.';
/** PATCH: only the fields sent (no defaults). */
const keyPatchSchema = z.object({
  number: keySchema.shape.number.optional(),
  name: text('What it opens', 120).optional(),
  location: text('Location', 120).optional(),
  site: text('Gate / site', 80).optional(),
  copies: z.number({ error: 'Copies must be a whole number from 1 to 20.' }).int().min(1).max(20).optional(),
  restricted: z.boolean({ error: 'restricted must be true or false.' }).optional(),
  authorised: text('Who may take it', 200).optional(),
  active: z.boolean({ error: 'active must be true or false.' }).optional(),
});

/** Site must be one from Settings. @param {string} site */
async function checkSite(site) {
  const { sites } = await getSettings();
  if (!sites.includes(site)) throw badRequest('Choose the gate / site from the list.', 'site');
}

// POST /api/keys — admin adds a key
keysRouter.post('/', requireRole('admin'), async (req, res) => {
  const body = req.body ?? {};
  if (![body.number, body.name, body.site].every((v) => typeof v === 'string' && v.trim()))
    throw badRequest(REQUIRED_MSG);
  const k = keySchema.parse(body);
  await checkSite(k.site);
  let key;
  try {
    key = await Key.create(k);
  } catch (e) {
    throw duplicate(e, k.number, k.site);
  }
  res.status(201).json({ key: await changed(key) });
});

// PATCH /api/keys/:id — admin edits a key, or takes it out of use (`active: false`)
keysRouter.patch('/:id', requireRole('admin'), async (req, res) => {
  const key = await findKey(String(req.params.id));
  const body = keyPatchSchema.parse(req.body ?? {});
  for (const f of /** @type {const} */ (['number', 'name', 'site']))
    if (body[f] === '') throw badRequest(REQUIRED_MSG, f);
  if (body.site !== undefined && body.site !== key.site) await checkSite(body.site);
  if (body.copies !== undefined && body.copies < key.outCount)
    throw conflict(`${key.outCount} copies of key ${key.number} are out now. Take them back first.`, 'copies');
  if (body.active === false && key.outCount > 0)
    throw conflict(`Key ${key.number} is out. Take it back first.`, 'active');
  // Guarded on outCount so a key issued meanwhile is not over-limited.
  /** @type {any} */
  const cond = { _id: key._id };
  if (body.copies !== undefined) cond.outCount = { $lte: body.copies };
  if (body.active === false) cond.outCount = 0;
  let updated;
  try {
    updated = await Key.findOneAndUpdate(cond, { $set: body }, { returnDocument: 'after', runValidators: true });
  } catch (e) {
    throw duplicate(e, body.number ?? key.number, body.site ?? key.site);
  }
  if (!updated) throw conflict(`Key ${key.number} was just issued. Try again.`);
  // Open moves keep the old text; the diary shows what the tag said when it went out.
  res.json({ key: await changed(updated) });
});

const issueSchema = z.object({
  takerId: z.string().trim().nullish(),
  takerName: text('Name', 120).default(''),
  takerPhone: text('Phone', 20).default(''),
  purpose: text('Purpose', 200).default(''),
  dueAt: z.union([z.string({ error: 'Return-by must be a date and time.' }), z.null()]).optional(),
});

// POST /api/keys/:id/issue — hand a copy to someone (a Gatebook user, or anyone by name)
keysRouter.post('/:id/issue', canWork, async (req, res) => {
  const me = currentUser(req);
  const key = await findKey(String(req.params.id));
  const body = issueSchema.parse(req.body ?? {});
  let taker = { id: /** @type {string | null} */ (null), name: body.takerName, phone: body.takerPhone };
  if (body.takerId) {
    const u = body.takerId.startsWith(PACE_ID_PREFIX)
      ? await upsertPaceRecipient(body.takerId, 'takerId')
      : mongoose.isValidObjectId(body.takerId)
        ? await User.findOne({ _id: body.takerId, active: true, status: { $nin: ['pending', 'deleted'] } })
        : null;
    if (!u) throw badRequest('Choose the person from the list.', 'takerId');
    taker = { id: u._id.toString(), name: body.takerName || u.name, phone: body.takerPhone || u.phone || '' };
  }
  if (!taker.name) throw badRequest('Who is taking the key?', 'takerName');

  const nowMs = Date.now();
  let dueAt = null;
  if (body.dueAt === undefined) {
    const { keyReturnHours } = await getSettings();
    if (keyReturnHours > 0) dueAt = new Date(nowMs + keyReturnHours * 3_600_000);
  } else if (body.dueAt !== null) {
    dueAt = new Date(body.dueAt);
    if (Number.isNaN(dueAt.getTime())) throw badRequest('Return-by must be a date and time.', 'dueAt');
    if (dueAt.getTime() < nowMs - 60_000) throw badRequest('Return-by must be later than now.', 'dueAt');
    if (dueAt.getTime() > nowMs + MAX_DUE_MS) throw badRequest('Return-by can be at most 30 days away.', 'dueAt');
  }

  if (!key.active) throw conflict(`Key ${key.number} is not in use.`);
  // Take a copy atomically: only while fewer than `copies` are out.
  const taken = await Key.findOneAndUpdate(
    { _id: key._id, active: true, $expr: { $lt: ['$outCount', '$copies'] } },
    { $inc: { outCount: 1 } },
    { returnDocument: 'after' },
  );
  if (!taken) {
    throw conflict(
      key.copies > 1
        ? `All ${key.copies} copies of key ${key.number} are already out.`
        : `Key ${key.number} is already out.`,
    );
  }
  let move;
  try {
    move = await KeyMove.create({
      key: { id: key._id.toString(), number: key.number, name: key.name, location: key.location },
      site: key.site,
      issuedAt: new Date(nowMs),
      issuedBy: userRef(me),
      taker,
      purpose: body.purpose,
      dueAt,
    });
  } catch (e) {
    await Key.updateOne({ _id: key._id, outCount: { $gt: 0 } }, { $inc: { outCount: -1 } });
    throw e;
  }
  if (taker.id && taker.id !== me._id.toString()) {
    void notify([taker.id], {
      event: 'key_issued',
      title: `🔑 Key ${key.number} issued to you`,
      body: `${key.name}${dueAt ? ` · please return by ${formatTime(dueAt)}` : ''}`,
      data: { type: 'key', id: move._id.toString() },
    });
  }
  holderChanged(move);
  res.status(201).json({ move: serializeMove(move), key: await changed(taken) });
});

// ---------------------------------------------------------------- the key diary

/** @param {Record<string, unknown>} query */
function diaryFilter(query) {
  const period = queryString(query, 'period') ?? '7d';
  if (!Object.hasOwn(PERIODS, period))
    throw badRequest(`period must be one of: ${Object.keys(PERIODS).join(', ')}.`, 'period');
  const state = queryString(query, 'state') ?? 'all';
  if (!STATES.includes(state)) throw badRequest(`state must be one of: ${STATES.join(', ')}.`, 'state');
  const raw = queryString(query, 'tzOffset');
  const tz = raw === undefined ? -330 : Number(raw);
  if (!Number.isInteger(tz) || Math.abs(tz) > 14 * 60)
    throw badRequest('tzOffset must be minutes from getTimezoneOffset().', 'tzOffset');
  const nowMs = Date.now();
  const since = new Date(localDayStart(nowMs, tz) - PERIODS[period] * DAY_MS);
  const site = queryString(query, 'site');
  const now = new Date(nowMs);
  /** @type {Record<string, unknown>[]} */
  const and = [searchFilter(queryString(query, 'q'), SEARCH_FIELDS)];
  if (site) and.push({ site });
  if (state === 'out') and.push({ returnedAt: null });
  else if (state === 'overdue') and.push({ returnedAt: null, dueAt: { $ne: null, $lt: now } });
  else if (state === 'returned') and.push({ returnedAt: { $ne: null } });
  // Keys still out always show, however long ago they went.
  and.push({ $or: [{ issuedAt: { $gte: since } }, { returnedAt: { $gte: since } }, { returnedAt: null }] });
  return { $and: and };
}

// GET /api/keymoves?period=today|7d|30d|90d&state=&site=&q=&page=&limit= — paginated, newest first; adds `counts`
keyMovesRouter.get('/', async (req, res) => {
  const filter = diaryFilter(req.query);
  const lq = parseListQuery(req.query, { sortFields: ['issuedAt', 'dueAt'], defaultSort: '-issuedAt' });
  const now = new Date();
  const [page, out, overdue] = await Promise.all([
    paginate(KeyMove, filter, lq, (m) => serializeMove(m)),
    KeyMove.countDocuments({ returnedAt: null }),
    KeyMove.countDocuments({ returnedAt: null, dueAt: { $ne: null, $lt: now } }),
  ]);
  res.json({ ...page, counts: { out, overdue } });
});

const STATE_LABEL = { out: 'Out', overdue: 'Overdue', returned: 'Returned', returned_late: 'Returned late' };

// GET /api/keymoves/export.csv — the key diary (same filters)
keyMovesRouter.get('/export.csv', async (req, res) => {
  const rows = await KeyMove.find(diaryFilter(req.query)).sort({ issuedAt: -1 }).limit(EXPORT_CAP).lean();
  const dt = (/** @type {Date | null | undefined} */ d) => (d ? formatDateTime(d) : '');
  const nowMs = Date.now();
  const lines = [
    csvRow([
      'Key no.',
      'Opens',
      'Location',
      'Gate',
      'Taken by',
      'Phone',
      'Purpose',
      'Issued',
      'Issued by',
      'Return by',
      'Returned',
      'Returned by',
      'Received by',
      'Out for',
      'Status',
      'Note',
    ]),
    ...rows.map((m) =>
      csvRow([
        m.key.number,
        m.key.name,
        m.key.location ?? '',
        m.site,
        m.taker.name,
        m.taker.phone ?? '',
        m.purpose ?? '',
        dt(m.issuedAt),
        m.issuedBy.name,
        dt(m.dueAt),
        dt(m.returnedAt),
        m.returnedByName ?? '',
        m.receivedBy?.name ?? '',
        formatDuration((m.returnedAt?.getTime() ?? nowMs) - m.issuedAt.getTime()),
        STATE_LABEL[moveState(m, nowMs)],
        m.returnNote ?? '',
      ]),
    ),
  ];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="key-diary.csv"');
  res.setHeader('Cache-Control', 'no-store');
  res.send(`${String.fromCharCode(0xfeff)}${lines.join('\r\n')}\r\n`);
});

const returnSchema = z.object({
  returnedByName: text('Returned by', 120).default(''),
  note: text('Note', 300).default(''),
});

// POST /api/keymoves/:id/return — the key is back at the desk
keyMovesRouter.post('/:id/return', canWork, async (req, res) => {
  const me = currentUser(req);
  const id = String(req.params.id);
  const body = returnSchema.parse(req.body ?? {});
  const move = mongoose.isValidObjectId(id) ? await KeyMove.findById(id) : null;
  if (!move) throw notFound('Key issue not found.');
  const updated = await KeyMove.findOneAndUpdate(
    { _id: move._id, returnedAt: null },
    {
      $set: {
        returnedAt: new Date(),
        returnedByName: body.returnedByName || move.taker.name,
        receivedBy: userRef(me),
        returnNote: body.note,
      },
    },
    { returnDocument: 'after' },
  );
  if (!updated) throw conflict('This key has already been returned.');
  const key = await Key.findOneAndUpdate(
    { _id: move.key.id, outCount: { $gt: 0 } },
    { $inc: { outCount: -1 } },
    { returnDocument: 'after' },
  );
  holderChanged(updated);
  res.json({ move: serializeMove(updated), key: key ? await changed(key) : null });
});

// ---------------------------------------------------------------- my keys

// GET /api/mykeys — keys issued to me: `data` still with me (overdue / due soonest first), `returned` in the last 7 days
myKeysRouter.get('/', async (req, res) => {
  const me = currentUser(req)._id.toString();
  const nowMs = Date.now();
  const [open, returned] = await Promise.all([
    KeyMove.find({ 'taker.id': me, returnedAt: null }).sort({ issuedAt: 1 }).lean(),
    KeyMove.find({ 'taker.id': me, returnedAt: { $gte: new Date(nowMs - 7 * DAY_MS) } })
      .sort({ returnedAt: -1 })
      .limit(20)
      .lean(),
  ]);
  // No return time goes last.
  const due = (/** @type {any} */ m) => (m.dueAt ? m.dueAt.getTime() : Infinity);
  open.sort((a, b) => due(a) - due(b));
  res.json({
    data: open.map((m) => serializeMove(m, nowMs)),
    returned: returned.map((m) => serializeMove(m, nowMs)),
    counts: { out: open.length, overdue: open.filter((m) => due(m) < nowMs).length },
  });
});
