import { Router } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { z } from 'zod';
import { config } from '../config.js';
import { currentUser, requireAuth, requireGate, requireModule, requireRole } from '../middleware/auth.js';
import { badRequest, conflict, notFound } from '../middleware/error.js';
import { FuelEntry, GenRun, Generator } from '../models/Generator.js';
import { emitOpsChanged } from '../realtime.js';
import { csvRow } from '../services/csv.js';
import { formatDateTime, zonedParts } from '../services/format.js';
import { checkDueAt, consumption, fuelEstimate, lastCheck, runHours } from '../services/gen.js';
import { COVER_MAX_EDGE, deleteImage, storeImage } from '../services/images.js';
import { paginate, parseListQuery, queryString } from '../services/pagination.js';
import { zonedTime } from '../services/patrol.js';
import { getSettings } from '../services/settings.js';
import { url as fileUrl } from '../services/storage.js';

/**
 * Generator & diesel (docs/API.md "Generator & diesel"). Gate users with the `gen` module; security and admins
 * start / stop runs and record diesel; admins add and edit generators.
 */
export const genRouter = Router();
genRouter.use(requireAuth, requireGate, requireModule('gen'));

const canWork = requireRole('security', 'admin');
const DAY = 86_400_000;
const EXPORT_CAP = 10_000;
const REASONS = ['Power cut', 'Weekly test run', 'Maintenance', 'Other'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 1, fields: 20, fieldSize: 4 * 1024 },
}).single('genPhoto');

/** @param {any} u */
const userRef = (u) => ({ id: u._id.toString(), name: u.name });
/** @param {Date | null | undefined} d */
const iso = (d) => (d ? new Date(d).toISOString() : null);
/** Optional number from a form / JSON field: '' → null, bad → NaN. @param {unknown} v */
const num = (v) => (v === undefined || v === null || v === '' ? null : Number(v));

/** @param {string} id */
async function findGen(id) {
  const g = mongoose.isValidObjectId(id) ? await Generator.findById(id) : null;
  if (!g) throw notFound('Generator not found.');
  return g;
}

/** @param {any} r */
const serializeRun = (r, nameOf = (/** @type {string} */ _id) => '') => ({
  id: r._id.toString(),
  genId: r.genId,
  genName: nameOf(r.genId),
  site: r.site,
  startAt: iso(r.startAt),
  stopAt: iso(r.stopAt),
  hours: Math.round(runHours([r], new Date(r.startAt).getTime(), Date.now()) * 100) / 100,
  reason: r.reason ?? '',
  hmStart: r.hmStart ?? null,
  hmEnd: r.hmEnd ?? null,
  startedBy: r.startedBy,
  stoppedBy: r.stoppedBy ?? null,
  note: r.note ?? '',
});
/** @param {any} f */
async function serializeFuel(f, nameOf = (/** @type {string} */ _id) => '') {
  return {
    id: f._id.toString(),
    genId: f.genId,
    genName: nameOf(f.genId),
    at: iso(f.at),
    kind: f.kind,
    litres: f.litres ?? null,
    levelL: f.levelL ?? null,
    hm: f.hm ?? null,
    vendor: f.vendor ?? '',
    billNo: f.billNo ?? '',
    amount: f.amount ?? null,
    photoUrl: f.photo ? await fileUrl(f.photo) : null,
    by: f.by,
    note: f.note ?? '',
  };
}

/** Start of this month (display time zone). @param {number} nowMs */
function monthStart(nowMs) {
  const p = zonedParts(new Date(nowMs));
  return zonedTime(p.year, p.month, 1, 0, 0);
}

/** A generator with its status: running, diesel estimate, level check, this month. @param {any} g @param {any} settings @param {number} nowMs */
async function genView(g, settings, nowMs) {
  const id = g._id.toString();
  const [fuel, runs] = await Promise.all([
    FuelEntry.find({ genId: id }).sort({ at: -1 }).limit(300).lean(),
    GenRun.find({ genId: id, $or: [{ stopAt: null }, { stopAt: { $gte: new Date(nowMs - 120 * DAY) } }] })
      .sort({ startAt: -1 })
      .lean(),
  ]);
  const running = runs.find((r) => !r.stopAt) ?? null;
  const est = fuelEstimate(g, fuel, runs, nowMs);
  const check = lastCheck(fuel);
  const due = checkDueAt(g, check, settings);
  const from = monthStart(nowMs);
  const hms = [...runs.flatMap((r) => [r.hmStart, r.hmEnd]), ...fuel.map((f) => f.hm)].filter(
    (x) => typeof x === 'number',
  );
  return {
    id,
    name: g.name,
    site: g.site,
    kva: g.kva ?? '',
    tankL: g.tankL,
    rateLph: g.rateLph ?? 0,
    lowPct: g.lowPct ?? 30,
    active: g.active !== false,
    running: running ? serializeRun(running) : null,
    estimate: est,
    low: !!(est && est.pct !== null && est.pct < (g.lowPct ?? 30)),
    lastCheck: check ? await serializeFuel(check) : null,
    checkDueAt: new Date(due).toISOString(),
    checkOverdue: nowMs >= due,
    month: {
      hours: Math.round(runHours(runs, from, nowMs) * 10) / 10,
      starts: runs.filter((r) => new Date(r.startAt).getTime() >= from).length,
      filledL: fuel
        .filter((f) => f.kind === 'fill' && new Date(f.at).getTime() >= from)
        .reduce((s, f) => s + (f.litres || 0), 0),
    },
    lastHm: hms.length ? Math.max(...hms) : null,
  };
}

// ---------------------------------------------------------------- status

// GET /api/gen?site= — every generator with its status, and the run reasons
genRouter.get('/', async (req, res) => {
  const site = queryString(req.query, 'site');
  const [gens, settings] = await Promise.all([
    Generator.find(site ? { site } : {})
      .sort({ site: 1, name: 1 })
      .lean(),
    getSettings(),
  ]);
  const nowMs = Date.now();
  res.json({
    generators: await Promise.all(gens.map((g) => genView(g, settings, nowMs))),
    reasons: REASONS,
    genCheckDays: settings.genCheckDays,
    genCheckHour: settings.genCheckHour,
  });
});

// ---------------------------------------------------------------- set-up (admin)

const genSchema = z.object({
  name: z.string().trim().max(60).optional(),
  site: z.string().trim().max(80).optional(),
  kva: z.union([z.string(), z.number()]).transform(String).optional(),
  tankL: z
    .number({ error: 'Tank capacity must be litres.' })
    .positive('Tank capacity must be more than 0.')
    .max(100000)
    .optional(),
  rateLph: z.number({ error: 'Rated use must be litres per hour.' }).min(0).max(1000).optional(),
  lowPct: z
    .number({ error: 'Low alert must be a percentage.' })
    .int()
    .min(5, 'Low alert: 5 to 90%.')
    .max(90, 'Low alert: 5 to 90%.')
    .optional(),
  active: z.boolean().optional(),
});
const REQUIRED = 'Name, gate/site and tank capacity are required';

/** @param {string} site */
async function checkSite(site) {
  const { sites } = await getSettings();
  if (!sites.includes(site)) throw badRequest('Choose the gate / site from the list.', 'site');
}

// POST /api/gen/generators
genRouter.post('/generators', requireRole('admin'), async (req, res) => {
  const b = genSchema.parse(req.body ?? {});
  if (!b.name || !b.site || !b.tankL) throw badRequest(REQUIRED);
  await checkSite(b.site);
  const g = await Generator.create({
    name: b.name,
    site: b.site,
    kva: b.kva ?? '',
    tankL: b.tankL,
    rateLph: b.rateLph ?? 0,
    lowPct: b.lowPct ?? 30,
  });
  emitOpsChanged('gen');
  res.status(201).json({ generator: await genView(g.toObject(), await getSettings(), Date.now()) });
});

// PATCH /api/gen/generators/:id
genRouter.patch('/generators/:id', requireRole('admin'), async (req, res) => {
  const g = await findGen(String(req.params.id));
  const b = genSchema.parse(req.body ?? {});
  if (b.name === '' || b.site === '') throw badRequest(REQUIRED);
  if (b.site !== undefined && b.site !== g.site) await checkSite(b.site);
  for (const [k, v] of Object.entries(b)) if (v !== undefined) g.set(k, v);
  await g.save();
  emitOpsChanged('gen');
  res.json({ generator: await genView(g.toObject(), await getSettings(), Date.now()) });
});

// ---------------------------------------------------------------- runs

const startSchema = z.object({
  reason: z.string().trim().max(80).optional(),
  hm: z.union([z.number(), z.string(), z.null()]).optional(),
});

// POST /api/gen/:id/start { reason, hm }
genRouter.post('/:id/start', canWork, async (req, res) => {
  const g = await findGen(String(req.params.id));
  if (!g.active) throw conflict(`${g.name} is not in use.`);
  const b = startSchema.parse(req.body ?? {});
  const hm = num(b.hm);
  if (hm !== null && (!Number.isFinite(hm) || hm < 0))
    throw badRequest('Enter the hour meter reading as a number.', 'hm');
  let run;
  try {
    run = await GenRun.create({
      genId: g._id.toString(),
      site: g.site,
      startAt: new Date(),
      reason: b.reason || 'Power cut',
      hmStart: hm,
      startedBy: userRef(currentUser(req)),
    });
  } catch (e) {
    if (/** @type {any} */ (e)?.code === 11000) throw conflict(`${g.name} is already running`);
    throw e;
  }
  emitOpsChanged('gen');
  res.status(201).json({ run: serializeRun(run) });
});

const stopSchema = z.object({
  hm: z.union([z.number(), z.string(), z.null()]).optional(),
  note: z.string().trim().max(300).optional(),
});

// POST /api/gen/runs/:id/stop { hm, note }
genRouter.post('/runs/:id/stop', canWork, async (req, res) => {
  const id = String(req.params.id);
  const run = mongoose.isValidObjectId(id) ? await GenRun.findById(id) : null;
  if (!run) throw notFound('Run not found.');
  const b = stopSchema.parse(req.body ?? {});
  const hm = num(b.hm);
  if (hm !== null && (!Number.isFinite(hm) || hm < 0))
    throw badRequest('Enter the hour meter reading as a number.', 'hm');
  if (hm !== null && run.hmStart !== null && hm < run.hmStart)
    throw badRequest(`Hour meter can't be lower than at start (${run.hmStart})`, 'hm');
  const updated = await GenRun.findOneAndUpdate(
    { _id: run._id, stopAt: null },
    { $set: { stopAt: new Date(), hmEnd: hm, note: b.note ?? '', stoppedBy: userRef(currentUser(req)) } },
    { returnDocument: 'after' },
  );
  if (!updated) throw conflict('This run has already been stopped.');
  emitOpsChanged('gen');
  res.json({ run: serializeRun(updated) });
});

/** @param {Record<string, unknown>} query */
function runFilter(query) {
  const days = Number(queryString(query, 'days') ?? 30);
  if (!Number.isInteger(days) || days < 1 || days > 366) throw badRequest('days must be from 1 to 366.', 'days');
  const genId = queryString(query, 'genId');
  const since = new Date(Date.now() - days * DAY);
  return {
    filter: {
      ...(genId ? { genId } : {}),
      $or: [{ stopAt: null }, { startAt: { $gte: since } }, { stopAt: { $gte: since } }],
    },
    since,
  };
}

/** Generator names by id. */
async function names() {
  const gens = await Generator.find({}, { name: 1 }).lean();
  const m = new Map(gens.map((g) => [g._id.toString(), g.name]));
  return (/** @type {string} */ id) => m.get(id) ?? 'Removed generator';
}

// GET /api/gen/runs?days=30&genId= — the run log, newest first; adds `hours` (run within the period)
genRouter.get('/runs', async (req, res) => {
  const { filter, since } = runFilter(req.query);
  const lq = parseListQuery(req.query, { sortFields: ['startAt'], defaultSort: '-startAt' });
  const nameOf = await names();
  const [page, all] = await Promise.all([
    paginate(GenRun, filter, lq, (r) => serializeRun(r, nameOf)),
    GenRun.find(filter).lean(),
  ]);
  res.json({ ...page, hours: Math.round(runHours(all, since.getTime(), Date.now()) * 10) / 10 });
});

// GET /api/gen/runs.csv
genRouter.get('/runs.csv', async (req, res) => {
  const { filter } = runFilter(req.query);
  const nameOf = await names();
  const rows = await GenRun.find(filter).sort({ startAt: -1 }).limit(EXPORT_CAP).lean();
  const dt = (/** @type {Date | null} */ d) => (d ? formatDateTime(d) : '');
  const lines = [
    csvRow([
      'Generator',
      'Start',
      'Stop',
      'Hours',
      'Reason',
      'Hour meter start',
      'Hour meter end',
      'Started by',
      'Stopped by',
      'Note',
    ]),
    ...rows.map((r) =>
      csvRow([
        nameOf(r.genId),
        dt(r.startAt),
        dt(r.stopAt),
        runHours([r], r.startAt.getTime(), Date.now()).toFixed(2),
        r.reason,
        r.hmStart ?? '',
        r.hmEnd ?? '',
        r.startedBy?.name ?? '',
        r.stoppedBy?.name ?? '',
        r.note,
      ]),
    ),
  ];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="generator-runs.csv"');
  res.setHeader('Cache-Control', 'no-store');
  res.send(`${String.fromCharCode(0xfeff)}${lines.join('\r\n')}\r\n`);
});

// ---------------------------------------------------------------- diesel

/** POST /api/gen/:id/fuel — multipart: kind fill | check, litres, levelL, hm, vendor, billNo, amount, note, at; file genPhoto */
genRouter.post('/:id/fuel', canWork, upload, async (req, res) => {
  const g = await findGen(String(req.params.id));
  const b = req.body ?? {};
  const kind = b.kind === 'check' ? 'check' : 'fill';
  const litres = num(b.litres);
  const levelL = num(b.levelL);
  const hm = num(b.hm);
  const amount = num(b.amount);
  if (kind === 'fill' && !(litres !== null && Number.isFinite(litres) && litres > 0))
    throw badRequest('Enter the litres filled', 'litres');
  if (kind === 'check' && (levelL === null || !Number.isFinite(levelL)))
    throw badRequest('Enter the level reading in litres', 'levelL');
  if (kind === 'check' && !req.file) throw badRequest('A photo of the gauge or dipstick is required', 'genPhoto');
  if (levelL !== null && (!Number.isFinite(levelL) || levelL < 0 || levelL > g.tankL * 1.05))
    throw badRequest(`Level must be between 0 and the tank capacity (${g.tankL} L)`, 'levelL');
  if (hm !== null && (!Number.isFinite(hm) || hm < 0))
    throw badRequest('Enter the hour meter reading as a number.', 'hm');
  if (amount !== null && (!Number.isFinite(amount) || amount < 0))
    throw badRequest('Enter the amount as a number.', 'amount');
  const nowMs = Date.now();
  let at = nowMs;
  if (b.at) {
    const t = new Date(String(b.at)).getTime();
    if (Number.isNaN(t)) throw badRequest('Pick the date and time of the fill.', 'at');
    at = Math.min(nowMs, t);
  }
  const s = (/** @type {string} */ k, max = 120) =>
    String(b[k] ?? '')
      .trim()
      .slice(0, max);
  const photo = req.file ? await storeImage(req.file.buffer, COVER_MAX_EDGE, 'genPhoto') : '';
  let entry;
  try {
    entry = await FuelEntry.create({
      genId: g._id.toString(),
      site: g.site,
      at: new Date(at),
      kind,
      litres: kind === 'fill' ? litres : null,
      levelL,
      hm,
      vendor: kind === 'fill' ? s('vendor') : '',
      billNo: kind === 'fill' ? s('billNo', 40) : '',
      amount: kind === 'fill' ? amount : null,
      photo,
      by: userRef(currentUser(req)),
      note: s('note', 300),
    });
  } catch (e) {
    await deleteImage(photo);
    throw e;
  }
  emitOpsChanged('gen');
  res.status(201).json({ entry: await serializeFuel(entry.toObject()) });
});

/** @param {Record<string, unknown>} query */
function fuelFilter(query) {
  const days = Number(queryString(query, 'days') ?? 90);
  if (!Number.isInteger(days) || days < 1 || days > 366) throw badRequest('days must be from 1 to 366.', 'days');
  const genId = queryString(query, 'genId');
  return { ...(genId ? { genId } : {}), at: { $gte: new Date(Date.now() - days * DAY) } };
}

// GET /api/gen/fuel?genId=&days=90 — the diesel log, newest first; with `genId` adds `consumption` between readings
genRouter.get('/fuel', async (req, res) => {
  const filter = fuelFilter(req.query);
  const lq = parseListQuery(req.query, { sortFields: ['at'], defaultSort: '-at' });
  const nameOf = await names();
  const page = await paginate(FuelEntry, filter, lq, (f) => serializeFuel(f, nameOf));
  const genId = queryString(req.query, 'genId');
  let use = null;
  if (genId && mongoose.isValidObjectId(genId)) {
    const g = await Generator.findById(genId).lean();
    if (g) {
      const [fuel, runs] = await Promise.all([
        FuelEntry.find({ genId }).sort({ at: -1 }).limit(300).lean(),
        GenRun.find({ genId }).sort({ startAt: -1 }).limit(1000).lean(),
      ]);
      use = consumption(g, fuel, runs).slice(0, 6);
    }
  }
  res.json({ ...page, consumption: use });
});

// GET /api/gen/fuel.csv
genRouter.get('/fuel.csv', async (req, res) => {
  const nameOf = await names();
  const rows = await FuelEntry.find(fuelFilter(req.query)).sort({ at: -1 }).limit(EXPORT_CAP).lean();
  const lines = [
    csvRow([
      'Generator',
      'Date & time',
      'Entry',
      'Litres filled',
      'Level (L)',
      'Hour meter',
      'Vendor',
      'Bill no.',
      'Amount',
      'Recorded by',
      'Note',
    ]),
    ...rows.map((f) =>
      csvRow([
        nameOf(f.genId),
        formatDateTime(f.at),
        f.kind === 'fill' ? 'Fill' : 'Level check',
        f.litres ?? '',
        f.levelL ?? '',
        f.hm ?? '',
        f.vendor,
        f.billNo,
        f.amount ?? '',
        f.by?.name ?? '',
        f.note,
      ]),
    ),
  ];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="diesel-log.csv"');
  res.setHeader('Cache-Control', 'no-store');
  res.send(`${String.fromCharCode(0xfeff)}${lines.join('\r\n')}\r\n`);
});
