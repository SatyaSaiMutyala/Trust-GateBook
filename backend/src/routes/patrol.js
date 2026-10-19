import crypto from 'node:crypto';
import { Router } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { z } from 'zod';
import { config } from '../config.js';
import { currentUser, requireAuth, requireGate, requireModule, requireRole } from '../middleware/auth.js';
import { badRequest, notFound } from '../middleware/error.js';
import { Escalation } from '../models/Escalation.js';
import { Checkpoint, PatrolRound, PatrolScan } from '../models/Patrol.js';
import { emitOpsChanged } from '../realtime.js';
import { csvRow } from '../services/csv.js';
import { formatDate } from '../services/format.js';
import { COVER_MAX_EDGE, deleteImage, storeImage } from '../services/images.js';
import { paginate, parseListQuery, queryString } from '../services/pagination.js';
import {
  LOG_STATUS_LABEL,
  hhmm,
  logStatus,
  matchSlot,
  normTimes,
  slotProgress,
  slotsBetween,
} from '../services/patrol.js';
import { getSettings } from '../services/settings.js';
import { url as fileUrl } from '../services/storage.js';

/**
 * Patrols (docs/API.md "Patrols"). Gate users with the `patrol` module; security and admins scan; admins set up
 * checkpoints and rounds. Checkpoint codes are only shown to admins (printing the QR stickers).
 */
export const patrolRouter = Router();
patrolRouter.use(requireAuth, requireGate, requireModule('patrol'));

const canScan = requireRole('security', 'admin');
const adminOnly = requireRole('admin');
const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_RE = /^[A-Z0-9]{6}$/;
const NO_CODE = 'This code does not match any active checkpoint';
const LOG_DAYS = [1, 7, 30, 90];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 1, fields: 10, fieldSize: 4 * 1024 },
}).single('scanPhoto');

/** @param {any} u */
const userRef = (u) => ({ id: u._id.toString(), name: u.name });
/** @param {string} label @param {number} max */
const text = (label, max) =>
  z
    .string({ error: `${label} must be text.` })
    .trim()
    .max(max, `${label} is too long (max ${max}).`);
const newCode = () => Array.from({ length: 6 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join('');
/** Scans as the slot maths wants them. @param {any[]} scans */
const scanRows = (scans) =>
  scans.map((s) => ({
    ...s,
    checkpointId: String(s.checkpointId),
    slotAt: s.slotAt ? new Date(s.slotAt).getTime() : null,
    at: new Date(s.at).getTime(),
  }));

/** @param {any} c @param {any} user */
const serializeCheckpoint = (c, user) => ({
  id: c._id.toString(),
  site: c.site,
  name: c.name,
  location: c.location ?? '',
  photoRequired: !!c.photoRequired,
  active: c.active !== false,
  sort: c.sort ?? 0,
  ...(user.role === 'admin' ? { code: c.code } : {}),
});
/** @param {any} r */
const serializeRound = (r) => ({
  id: r._id.toString(),
  site: r.site,
  name: r.name,
  times: r.times ?? [],
  windowMin: r.windowMin ?? 45,
  onTimeMin: r.onTimeMin ?? 10,
  checkpointIds: (r.checkpointIds ?? []).map(String),
  active: r.active !== false,
});
/** @param {any} s @param {Map<string, any>} roundsById */
async function serializeScan(s, roundsById) {
  return {
    id: s._id.toString(),
    checkpointId: String(s.checkpointId),
    checkpoint: { name: s.checkpoint?.name ?? 'Removed checkpoint', location: s.checkpoint?.location ?? '' },
    site: s.site,
    by: s.by,
    at: new Date(s.at).toISOString(),
    status: s.status,
    note: s.note ?? '',
    photoUrl: s.photo ? await fileUrl(s.photo) : null,
    manual: !!s.manual,
    roundId: s.roundId ?? null,
    roundName: s.roundId ? (roundsById.get(String(s.roundId))?.name ?? 'Removed round') : null,
    slotAt: s.slotAt ? new Date(s.slotAt).toISOString() : null,
  };
}

/** One slot with its progress for the apps. */
function slotView(
  /** @type {any} */ sl,
  /** @type {any} */ r,
  /** @type {any[]} */ scans,
  /** @type {Map<string, any>} */ cps,
  nowMs,
  /** @type {any[]} */ events,
) {
  const p = slotProgress(sl, r, scans, nowMs);
  return {
    key: sl.key,
    roundId: sl.roundId,
    roundName: r.name,
    site: sl.site,
    at: new Date(sl.at).toISOString(),
    end: new Date(sl.end).toISOString(),
    onTimeTill: new Date(sl.at + p.graceMin * MIN).toISOString(),
    status: p.status,
    logStatus: nowMs > sl.end ? logStatus(p) : null,
    done: p.done,
    total: p.total,
    late: p.late,
    lateMin: p.lateMin,
    graceMin: p.graceMin,
    firstAt: p.firstAt ? new Date(p.firstAt).toISOString() : null,
    lastAt: p.lastAt ? new Date(p.lastAt).toISOString() : null,
    checkpoints: (r.checkpointIds ?? []).map((/** @type {string} */ id) => {
      const sc = p.got.get(String(id));
      return {
        id: String(id),
        name: cps.get(String(id))?.name ?? 'Removed checkpoint',
        scannedAt: sc ? new Date(sc.at).toISOString() : null,
        by: sc?.by?.name ?? null,
        status: sc?.status ?? null,
      };
    }),
    missing: p.missing.map((id) => cps.get(id)?.name ?? 'Removed checkpoint'),
    guards: [...new Set([...p.got.values()].map((sc) => sc.by?.name).filter(Boolean))],
    escalations: events
      .filter((e) => e.ref === sl.key)
      .map((e) => ({
        at: e.at.toISOString(),
        label: e.label || e.title,
        targetName: e.targetName,
        recipients: e.recipients.map((/** @type {any} */ x) => x.name),
      })),
  };
}

/** Rounds, checkpoints, and slots + scans between `from` and `to`. @param {number} from @param {number} to */
async function loadWindow(from, to, site = '') {
  const where = site ? { site } : {};
  const [rounds, checkpoints] = await Promise.all([
    PatrolRound.find(where).lean(),
    Checkpoint.find(where).sort({ site: 1, sort: 1, name: 1 }).lean(),
  ]);
  const slots = slotsBetween(rounds, from, to);
  const keys = slots.map((s) => s.key);
  const [scans, events] = slots.length
    ? await Promise.all([
        PatrolScan.find({
          roundId: { $ne: null },
          slotAt: { $gte: new Date(slots[0].at), $lte: new Date(slots[slots.length - 1].at) },
        }).lean(),
        Escalation.find({ matrix: 'patrol', ref: { $in: keys } })
          .sort({ at: 1 })
          .lean(),
      ])
    : [[], []];
  return {
    rounds,
    checkpoints,
    slots,
    scans: scanRows(scans),
    events,
    roundsById: new Map(rounds.map((r) => [r._id.toString(), r])),
    cps: new Map(checkpoints.map((c) => [c._id.toString(), c])),
  };
}

// ---------------------------------------------------------------- reads

// GET /api/patrol?site= — set-up and the rounds from 12 h ago to 12 h ahead (due now · coming up · last 12 hours)
patrolRouter.get('/', async (req, res) => {
  const user = currentUser(req);
  const nowMs = Date.now();
  const w = await loadWindow(nowMs - 12 * HOUR, nowMs + 12 * HOUR, queryString(req.query, 'site') ?? '');
  res.json({
    checkpoints: w.checkpoints.map((c) => serializeCheckpoint(c, user)),
    rounds: w.rounds.map(serializeRound),
    slots: w.slots.map((sl) => slotView(sl, w.roundsById.get(sl.roundId), w.scans, w.cps, nowMs, w.events)),
    now: new Date(nowMs).toISOString(),
  });
});

/** Ended slots of the last `days` days (newest first) and the summary. @param {Record<string, unknown>} query */
async function patrolLog(query) {
  const days = Number(queryString(query, 'days') ?? 7);
  if (!LOG_DAYS.includes(days)) throw badRequest(`days must be one of: ${LOG_DAYS.join(', ')}.`, 'days');
  const filter = queryString(query, 'filter') ?? 'problems';
  if (!['problems', 'all'].includes(filter)) throw badRequest('filter must be problems or all.', 'filter');
  const nowMs = Date.now();
  const w = await loadWindow(nowMs - days * DAY, nowMs, queryString(query, 'site') ?? '');
  const all = w.slots
    .filter((sl) => sl.end < nowMs)
    .map((sl) => slotView(sl, w.roundsById.get(sl.roundId), w.scans, w.cps, nowMs, w.events))
    .reverse();
  const late = all.filter((r) => r.firstAt && r.lateMin > r.graceMin);
  const summary = {
    rounds: all.length,
    onTime: all.filter((r) => r.logStatus === 'on_time').length,
    late: all.filter((r) => r.logStatus === 'late').length,
    partial: all.filter((r) => r.logStatus === 'partial').length,
    missed: all.filter((r) => r.logStatus === 'missed').length,
    avgLateMin: late.length ? Math.round(late.reduce((s, r) => s + r.lateMin, 0) / late.length) : null,
  };
  return { data: filter === 'all' ? all : all.filter((r) => r.logStatus !== 'on_time'), summary };
}

// GET /api/patrol/log?days=1|7|30|90&filter=problems|all — the late & missed log
patrolRouter.get('/log', async (req, res) => {
  res.json(await patrolLog(req.query));
});

// GET /api/patrol/log.csv
patrolRouter.get('/log.csv', async (req, res) => {
  const { data } = await patrolLog(req.query);
  const t = (/** @type {string | null} */ iso) => (iso ? hhmm(new Date(iso).getTime()) : '');
  const lines = [
    csvRow([
      'Date',
      'Round',
      'Gate',
      'Start time',
      'On-time grace (min)',
      'Started',
      'Minutes after start time',
      'Finished',
      'Scanned',
      'Missed checkpoints',
      'Status',
      'Escalations',
      'Guards',
    ]),
    ...data.map((r) =>
      csvRow([
        formatDate(new Date(r.at)),
        r.roundName,
        r.site,
        t(r.at),
        r.graceMin,
        t(r.firstAt),
        r.firstAt ? r.lateMin : '',
        r.done === r.total ? t(r.lastAt) : '',
        `${r.done}/${r.total}`,
        r.missing.join('; '),
        LOG_STATUS_LABEL[/** @type {keyof typeof LOG_STATUS_LABEL} */ (r.logStatus)],
        r.escalations.map((e) => `${e.label} → ${e.recipients.join(', ')}`).join('; '),
        r.guards.join(', '),
      ]),
    ),
  ];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="patrol-late-log.csv"');
  res.setHeader('Cache-Control', 'no-store');
  res.send(`${String.fromCharCode(0xfeff)}${lines.join('\r\n')}\r\n`);
});

// GET /api/patrol/scans?days=3&page=&limit= — the scan log, newest first
patrolRouter.get('/scans', async (req, res) => {
  const days = Number(queryString(req.query, 'days') ?? 3);
  if (!Number.isInteger(days) || days < 1 || days > 92) throw badRequest('days must be from 1 to 92.', 'days');
  const lq = parseListQuery(req.query, { sortFields: ['at'], defaultSort: '-at' });
  const rounds = await PatrolRound.find({}, { name: 1 }).lean();
  const byId = new Map(rounds.map((r) => [r._id.toString(), r]));
  res.json(
    await paginate(PatrolScan, { at: { $gte: new Date(Date.now() - days * DAY) } }, lq, (s) => serializeScan(s, byId)),
  );
});

/** Active checkpoint by code, else 404. @param {unknown} raw */
async function checkpointByCode(raw) {
  const code = String(raw ?? '')
    .trim()
    .toUpperCase();
  const cp = CODE_RE.test(code) ? await Checkpoint.findOne({ code, active: true }).lean() : null;
  if (!cp) throw notFound(NO_CODE);
  return cp;
}

/** The open slot a scan at `cp` now counts towards (the oldest that still needs it). @param {any} cp @param {number} nowMs */
async function pickSlot(cp, nowMs) {
  const rounds = await PatrolRound.find({ active: true, site: cp.site }).lean();
  const earlier = scanRows(
    await PatrolScan.find({ checkpointId: cp._id.toString(), roundId: { $ne: null }, at: { $gte: new Date(nowMs - 6 * HOUR) } }).lean(),
  );
  return { rounds, sl: matchSlot(rounds, { id: cp._id.toString(), site: cp.site }, nowMs, earlier) };
}

/** Progress of the slot a scan at `cp` counts towards. @param {any} cp @param {number} nowMs @param {Awaited<ReturnType<typeof pickSlot>>} [picked] */
async function slotFor(cp, nowMs, picked) {
  const { rounds, sl } = picked ?? (await pickSlot(cp, nowMs));
  if (!sl) return { slot: null, round: null, done: 0, total: 0, missing: [] };
  const r = /** @type {any} */ (rounds.find((x) => x._id.toString() === sl.roundId));
  const scans = scanRows(await PatrolScan.find({ roundId: sl.roundId, slotAt: new Date(sl.at) }).lean());
  const p = slotProgress(sl, r, scans, nowMs);
  const cps = await Checkpoint.find({ _id: { $in: p.missing } }, { name: 1 }).lean();
  return {
    slot: { roundId: sl.roundId, at: new Date(sl.at).toISOString(), end: new Date(sl.end).toISOString() },
    round: { id: r._id.toString(), name: r.name },
    done: p.done,
    total: p.total,
    missing: cps.map((c) => c.name),
  };
}

// GET /api/patrol/lookup?code= — what a code is and which round it would count for
patrolRouter.get('/lookup', async (req, res) => {
  const cp = await checkpointByCode(req.query.code);
  res.json({ checkpoint: serializeCheckpoint(cp, { role: 'security' }), ...(await slotFor(cp, Date.now())) });
});

// ---------------------------------------------------------------- scan

/** POST /api/patrol/scan — multipart: code*, status ok | issue, note, manual; file scanPhoto */
patrolRouter.post('/scan', canScan, upload, async (req, res) => {
  const me = currentUser(req);
  const b = req.body ?? {};
  const cp = await checkpointByCode(b.code);
  const status = b.status === 'issue' ? 'issue' : 'ok';
  const note = String(b.note ?? '')
    .trim()
    .slice(0, 500);
  if (status === 'issue' && !note) throw badRequest('Describe the issue in the note', 'note');
  if (cp.photoRequired && !req.file) throw badRequest('A photo is required at this checkpoint', 'scanPhoto');
  const nowMs = Date.now();
  const picked = await pickSlot(cp, nowMs);
  const { rounds, sl } = picked;
  const photo = req.file ? await storeImage(req.file.buffer, COVER_MAX_EDGE, 'scanPhoto') : '';
  let scan;
  try {
    scan = await PatrolScan.create({
      checkpointId: cp._id.toString(),
      checkpoint: { name: cp.name, location: cp.location },
      site: cp.site,
      by: userRef(me),
      at: new Date(nowMs),
      status,
      note,
      photo,
      manual: b.manual === true || b.manual === 'true',
      roundId: sl?.roundId ?? null,
      slotAt: sl ? new Date(sl.at) : null,
    });
  } catch (e) {
    await deleteImage(photo);
    throw e;
  }
  emitOpsChanged('patrol');
  const roundsById = new Map(rounds.map((r) => [r._id.toString(), r]));
  res
    .status(201)
    .json({
      scan: await serializeScan(scan.toObject(), roundsById),
      checkpoint: serializeCheckpoint(cp, { role: 'security' }),
      ...(await slotFor(cp, nowMs, picked)),
    });
});

// ---------------------------------------------------------------- set-up (admin)

/** @param {string} site */
async function checkSite(site) {
  const { sites } = await getSettings();
  if (!sites.includes(site)) throw badRequest('Choose the gate / site from the list.', 'site');
}

const cpSchema = z.object({
  site: text('Gate / site', 80).optional(),
  name: text('Checkpoint name', 120).optional(),
  location: text('Floor / location', 120).optional(),
  photoRequired: z.boolean({ error: 'photoRequired must be true or false.' }).optional(),
  active: z.boolean({ error: 'active must be true or false.' }).optional(),
  sort: z.number().int().optional(),
  newCode: z.boolean().optional(),
});

/** A unique 6-character code. */
async function uniqueCode() {
  for (let i = 0; i < 20; i++) {
    const code = newCode();
    if (!(await Checkpoint.exists({ code }))) return code;
  }
  throw new Error('Could not make a checkpoint code.');
}

// POST /api/patrol/checkpoints
patrolRouter.post('/checkpoints', adminOnly, async (req, res) => {
  const b = cpSchema.parse(req.body ?? {});
  if (!b.name || !b.site) throw badRequest('Name and gate/site are required');
  await checkSite(b.site);
  const count = await Checkpoint.countDocuments({ site: b.site });
  const cp = await Checkpoint.create({
    site: b.site,
    name: b.name,
    location: b.location ?? '',
    photoRequired: !!b.photoRequired,
    sort: b.sort ?? count,
    code: await uniqueCode(),
  });
  emitOpsChanged('patrol');
  res.status(201).json({ checkpoint: serializeCheckpoint(cp, currentUser(req)) });
});

// PATCH /api/patrol/checkpoints/:id — `newCode: true` issues a new code (the old printed QR stops working)
patrolRouter.patch('/checkpoints/:id', adminOnly, async (req, res) => {
  const id = String(req.params.id);
  const cp = mongoose.isValidObjectId(id) ? await Checkpoint.findById(id) : null;
  if (!cp) throw notFound('Checkpoint not found.');
  const b = cpSchema.parse(req.body ?? {});
  if (b.name === '') throw badRequest('Name and gate/site are required', 'name');
  if (b.site !== undefined && b.site !== cp.site) await checkSite(b.site);
  for (const k of /** @type {const} */ (['site', 'name', 'location', 'photoRequired', 'active', 'sort']))
    if (b[k] !== undefined) cp.set(k, b[k]);
  if (b.newCode) cp.code = await uniqueCode();
  await cp.save();
  emitOpsChanged('patrol');
  res.json({ checkpoint: serializeCheckpoint(cp, currentUser(req)) });
});

const roundSchema = z.object({
  site: text('Gate / site', 80).optional(),
  name: text('Round name', 120).optional(),
  times: z.union([z.array(z.string()), z.string()]).optional(),
  windowMin: z
    .number({ error: 'Time allowed must be minutes.' })
    .int()
    .min(10, 'Allow at least 10 minutes.')
    .max(240, 'At most 240 minutes.')
    .optional(),
  onTimeMin: z
    .number({ error: 'On-time minutes must be a number.' })
    .int()
    .min(0)
    .max(120, 'At most 120 minutes.')
    .optional(),
  checkpointIds: z.array(z.string()).optional(),
  active: z.boolean().optional(),
});

/** Checks times / checkpoints and returns the cleaned values. @param {any} b @param {string} site */
async function roundFields(b, site) {
  /** @type {Record<string, unknown>} */
  const out = {};
  if (b.times !== undefined) {
    const times = normTimes(b.times);
    if (!times.length) throw badRequest('Add at least one start time, like 22:00', 'times');
    out.times = times;
  }
  if (b.checkpointIds !== undefined) {
    const ids = [...new Set(b.checkpointIds.filter((/** @type {string} */ x) => mongoose.isValidObjectId(x)))];
    const found = ids.length ? await Checkpoint.countDocuments({ _id: { $in: ids }, site }) : 0;
    if (!ids.length || found !== ids.length) throw badRequest('Pick at least one checkpoint', 'checkpointIds');
    out.checkpointIds = ids;
  }
  for (const k of ['windowMin', 'onTimeMin', 'active']) if (b[k] !== undefined) out[k] = b[k];
  return out;
}

// POST /api/patrol/rounds
patrolRouter.post('/rounds', adminOnly, async (req, res) => {
  const b = roundSchema.parse(req.body ?? {});
  if (!b.name) throw badRequest('Give the round a name', 'name');
  if (!b.site) throw badRequest('Choose the gate / site from the list.', 'site');
  await checkSite(b.site);
  if (b.times === undefined) throw badRequest('Add at least one start time, like 22:00', 'times');
  if (b.checkpointIds === undefined) throw badRequest('Pick at least one checkpoint', 'checkpointIds');
  const fields = await roundFields(b, b.site);
  const r = await PatrolRound.create({ site: b.site, name: b.name, ...fields, activeFrom: new Date() });
  emitOpsChanged('patrol');
  res.status(201).json({ round: serializeRound(r) });
});

// PATCH /api/patrol/rounds/:id — a schedule change (times, time allowed, checkpoints, active) restarts judging from now
patrolRouter.patch('/rounds/:id', adminOnly, async (req, res) => {
  const id = String(req.params.id);
  const r = mongoose.isValidObjectId(id) ? await PatrolRound.findById(id) : null;
  if (!r) throw notFound('Round not found.');
  const b = roundSchema.parse(req.body ?? {});
  if (b.name === '') throw badRequest('Give the round a name', 'name');
  const site = b.site ?? r.site;
  if (b.site !== undefined && b.site !== r.site) {
    await checkSite(b.site);
    if (b.checkpointIds === undefined) throw badRequest('Pick at least one checkpoint', 'checkpointIds');
  }
  const fields = await roundFields(b, site);
  const scheduleChanged = ['times', 'windowMin', 'checkpointIds', 'active'].some(
    (k) => k in fields && JSON.stringify(fields[k]) !== JSON.stringify(/** @type {any} */ (r.toObject())[k]),
  );
  r.set({ ...(b.name ? { name: b.name } : {}), ...(b.site ? { site: b.site } : {}), ...fields });
  if (scheduleChanged) r.activeFrom = new Date();
  await r.save();
  emitOpsChanged('patrol');
  res.json({ round: serializeRound(r) });
});
