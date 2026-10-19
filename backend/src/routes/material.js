import { Router } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { config } from '../config.js';
import { currentUser, isGateUser, requireAuth, requireModule, requireRole } from '../middleware/auth.js';
import { badRequest, conflict, forbidden, notFound } from '../middleware/error.js';
import { Expected } from '../models/Expected.js';
import { MP_CANCELLABLE, MP_GATE, MP_OPEN, MaterialPass } from '../models/MaterialPass.js';
import { RECIPIENT_FILTER, User } from '../models/User.js';
import { Visit } from '../models/Visit.js';
import { emitExpectedChanged, emitMaterialChanged } from '../realtime.js';
import { csvRow } from '../services/csv.js';
import { formatDateTime } from '../services/format.js';
import { gateStaffIds } from '../services/hostApproval.js';
import { PERSON_MAX_EDGE, deleteImage, storeImage } from '../services/images.js';
import { gatePassPdf } from '../services/gatePassPdf.js';
import { notify } from '../services/notify.js';
import { PACE_ID_PREFIX, upsertPaceRecipient } from '../services/pace.js';
import { paginate, parseListQuery, queryString, searchFilter } from '../services/pagination.js';
import { generatePassNumber } from '../services/passNumber.js';
import { outstanding, serializeMaterial } from '../services/serializeMaterial.js';
import { getSettings } from '../services/settings.js';
import { localDayStart } from './stats.js';

export const materialRouter = Router();
// Module access: Material gate passes. Employees can always answer their own pass (receipt / decision).
materialRouter.use(requireAuth);
const needMaterial = requireModule('material');
materialRouter.use((req, res, next) => {
  if (req.method === 'POST' && /^\/[^/]+\/(receipt|decision)$/.test(req.path)) return next();
  return needMaterial(req, res, next);
});

const canWrite = requireRole('security', 'admin');
const CHALLAN_MAX_EDGE = 1400;
const BOX_MAX_EDGE = 1100;
const DAY_MS = 86_400_000;
const EXPORT_CAP = 10_000;
const SEARCH_FIELDS = [
  'code',
  'carrier.name',
  'carrier.company',
  'carrier.phone',
  'carrier.vehicle',
  'carrier.visitBadge',
  'pickerName',
  'refNo',
  'ewaybill',
  'challanType',
  'authorisedBy.name',
];
const LIST_OPTS = { sortFields: ['createdAt', 'returnDue'], defaultSort: '-createdAt' };
const GATE_TABS = ['today', 'accept', 'gate', 'open', 'overdue', 'all'];
const MINE_TABS = ['todo', 'sent', 'in', 'all'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 12, fields: 60, fieldSize: 16 * 1024 },
}).fields([
  { name: 'challan', maxCount: 4 },
  { name: 'boxPhoto', maxCount: 6 },
  { name: 'carrier', maxCount: 1 },
  { name: 'returnPhoto', maxCount: 1 },
]);

// ---------------------------------------------------------------- helpers

/** @param {any} u */
const userRef = (u) => ({ id: u._id.toString(), name: u.name });
/** @param {any} user */
const isOperator = (user) => user.role === 'security' || user.role === 'admin';
/** @param {number} n */
const boxesText = (n) => `${n} box${n === 1 ? '' : 'es'}`;
/** @param {any} m */
const data = (m) => ({ type: 'material', id: m.code });
/** @param {any} m */
const carrierName = (m) => m.carrier?.name || m.pickerName || m.carrier?.company || 'the carrier';

/** @param {Record<string, unknown>} body */
const reader = (body) => (/** @type {string} */ k) => {
  const v = Array.isArray(body[k]) ? body[k][0] : body[k];
  return typeof v === 'string' ? v.trim() : '';
};

/** Stores a list of uploaded images; on failure removes the ones already stored. */
async function storeAll(
  /** @type {Express.Multer.File[]} */ files,
  /** @type {number} */ edge,
  /** @type {string} */ field,
) {
  /** @type {string[]} */
  const refs = [];
  try {
    for (const f of files) refs.push(await storeImage(f.buffer, edge, field));
  } catch (e) {
    await Promise.all(refs.map((r) => deleteImage(r)));
    throw e;
  }
  return refs;
}

/** An active employee who can receive visitors / post (same list as GET /api/hosts). @param {string} id @param {string} field */
async function employee(id, field) {
  let user = null;
  if (id.startsWith(PACE_ID_PREFIX)) user = await upsertPaceRecipient(id, field);
  else if (mongoose.isValidObjectId(id)) user = await User.findOne({ _id: id, ...RECIPIENT_FILTER });
  if (!user) throw badRequest('Choose the employee from the list.', field);
  return user;
}

/** Visit by pass code, open (not checked out). @param {string} pass @param {string} field */
async function openVisit(pass, field) {
  const v = await Visit.findOne({ pass, outAt: null });
  if (!v) throw badRequest('That visitor is no longer inside.', field);
  return v;
}

/** @param {string} id @param {any} user */
async function findPass(id, user) {
  const m = await MaterialPass.findOne({ code: id.trim().toUpperCase() });
  if (!m) throw notFound('Gate pass not found.');
  const me = user._id.toString();
  if (!isGateUser(user) && m.authorisedBy?.id !== me && m.requestedBy?.id !== me)
    throw notFound('Gate pass not found.');
  return m;
}

/** Atomic status change: only from `from` statuses. @param {any} m @param {string[]} from @param {Record<string, unknown>} set @param {string} message */
async function transition(m, from, set, message, extra = {}) {
  const updated = await MaterialPass.findOneAndUpdate(
    { _id: m._id, status: { $in: from } },
    { $set: set, ...extra },
    { returnDocument: 'after' },
  );
  if (!updated) throw conflict(message);
  return updated;
}

/** The client's local day start (`tzOffset` = getTimezoneOffset(), default IST). @param {Record<string, unknown>} query */
function dayStart(query) {
  const raw = queryString(query, 'tzOffset');
  const tz = raw === undefined ? -330 : Number(raw);
  if (!Number.isInteger(tz) || Math.abs(tz) > 14 * 60)
    throw badRequest('tzOffset must be minutes from getTimezoneOffset().', 'tzOffset');
  return new Date(localDayStart(Date.now(), tz));
}

// ---------------------------------------------------------------- reads

/**
 * Filter for a list. Gate users: every pass; `tab` today | accept | gate | open | overdue | all (with `days`).
 * Others: their own; `tab` todo | sent | in | all. Both: `dir` in | out, `visitId`, `q`.
 * @param {Record<string, unknown>} query
 * @param {any} user
 */
function listFilter(query, user) {
  const gate = isGateUser(user);
  const tab = queryString(query, 'tab') ?? (gate ? 'all' : 'all');
  if (!(gate ? GATE_TABS : MINE_TABS).includes(tab))
    throw badRequest(`tab must be one of: ${(gate ? GATE_TABS : MINE_TABS).join(', ')}.`, 'tab');
  const now = new Date();
  /** @type {Record<string, unknown>[]} */
  const and = [];
  const site = queryString(query, 'site');
  if (site) and.push({ site });
  if (gate) {
    const start = dayStart(query);
    if (tab === 'today') {
      and.push({
        $or: [
          { createdAt: { $gte: start } },
          { releasedAt: { $gte: start } },
          { receivedAt: { $gte: start } },
          { status: { $in: [...MP_GATE, 'awaiting_receipt'] } },
        ],
      });
    } else if (tab === 'accept') and.push({ status: { $in: ['awaiting_receipt', 'disputed'] } });
    else if (tab === 'gate') and.push({ status: { $in: MP_GATE } });
    else if (tab === 'open') and.push({ status: { $in: MP_OPEN } });
    else if (tab === 'overdue') and.push({ status: { $in: MP_OPEN }, returnDue: { $ne: null, $lt: now } });
    else if (tab === 'all') {
      const days = Number(queryString(query, 'days') ?? 30);
      if (![7, 30, 120].includes(days)) throw badRequest('days must be 7, 30 or 120.', 'days');
      and.push({
        $or: [
          { createdAt: { $gte: new Date(Date.now() - days * DAY_MS) } },
          { status: { $in: [...MP_OPEN, ...MP_GATE] } },
        ],
      });
    }
  } else {
    const me = user._id.toString();
    and.push({ $or: [{ 'authorisedBy.id': me }, { 'requestedBy.id': me }] });
    if (tab === 'todo') {
      and.push({
        $or: [
          { status: 'awaiting_receipt', 'authorisedBy.id': me },
          { status: 'awaiting_approval', 'authorisedBy.id': me },
        ],
      });
    } else if (tab === 'sent') and.push({ direction: 'out' });
    else if (tab === 'in') and.push({ direction: 'in' });
  }
  const dir = queryString(query, 'dir');
  if (dir !== undefined) {
    if (dir !== 'in' && dir !== 'out') throw badRequest('dir must be in or out.', 'dir');
    and.push({ direction: dir });
  }
  const visitId = queryString(query, 'visitId');
  if (visitId) and.push({ $or: [{ visitId }, { 'carrier.visitId': visitId }] });
  const q = queryString(query, 'q');
  if (q) and.push(searchFilter(q, SEARCH_FIELDS));
  return { filter: and.length ? { $and: and } : {}, tab };
}

/** KPI counts for the gate tabs, or "to do" for an employee. @param {any} user @param {Record<string, unknown>} query */
async function counts(user, query) {
  if (!isGateUser(user)) {
    const me = user._id.toString();
    return {
      todo: await MaterialPass.countDocuments({
        'authorisedBy.id': me,
        status: { $in: ['awaiting_receipt', 'awaiting_approval'] },
      }),
    };
  }
  const start = dayStart(query);
  const [inToday, outToday, accept, gate, open, overdue] = await Promise.all([
    MaterialPass.aggregate([
      { $match: { direction: 'in', createdAt: { $gte: start }, status: { $ne: 'cancelled' } } },
      { $group: { _id: null, n: { $sum: '$boxes' } } },
    ]),
    MaterialPass.aggregate([
      { $match: { direction: 'out', releasedAt: { $gte: start } } },
      { $group: { _id: null, n: { $sum: '$boxes' } } },
    ]),
    MaterialPass.countDocuments({ status: { $in: ['awaiting_receipt', 'disputed'] } }),
    MaterialPass.countDocuments({ status: { $in: MP_GATE } }),
    MaterialPass.countDocuments({ status: { $in: MP_OPEN } }),
    MaterialPass.countDocuments({ status: { $in: MP_OPEN }, returnDue: { $ne: null, $lt: new Date() } }),
  ]);
  return { boxesInToday: inToday[0]?.n ?? 0, boxesOutToday: outToday[0]?.n ?? 0, accept, gate, open, overdue };
}

// GET /api/material — paginated; response adds `counts`
materialRouter.get('/', async (req, res) => {
  const user = currentUser(req);
  const { filter, tab } = listFilter(req.query, user);
  const lq = parseListQuery(req.query, {
    ...LIST_OPTS,
    defaultSort: tab === 'open' || tab === 'overdue' ? 'returnDue' : '-createdAt',
  });
  const [page, c] = await Promise.all([
    paginate(MaterialPass, filter, lq, (d) => serializeMaterial(d)),
    counts(user, req.query),
  ]);
  res.json({ ...page, counts: c });
});

// GET /api/material/visitors — visitors inside now, to pick who carries the boxes (`mine` = visiting me)
materialRouter.get('/visitors', async (req, res) => {
  const me = currentUser(req)._id.toString();
  const visits = await Visit.find({ outAt: null }).sort({ inAt: -1 }).limit(300).lean();
  const list = visits.map((v) => ({
    id: v.pass,
    name: v.name,
    company: v.company ?? '',
    phone: isGateUser(currentUser(req)) ? v.phone : '',
    badge: v.badge ?? '',
    site: v.site,
    inAt: v.inAt.toISOString(),
    host: v.host,
    hostId: v.hostId ?? null,
    mine: v.hostId === me,
  }));
  list.sort((a, b) => Number(b.mine) - Number(a.mine));
  res.json({ data: list });
});

// GET /api/material/export.csv — gate users; same filters as the list
materialRouter.get('/export.csv', requireRole('security', 'admin', 'viewer'), async (req, res) => {
  const { filter } = listFilter(req.query, currentUser(req));
  const rows = await MaterialPass.find(filter).sort({ createdAt: -1 }).limit(EXPORT_CAP).lean();
  const dt = (/** @type {Date | null | undefined} */ d) => (d ? formatDateTime(d) : '');
  const lines = [
    csvRow([
      'Pass no.',
      'IN / OUT',
      'Type',
      'Mode',
      'Date & time',
      'Gate',
      'Boxes',
      'Challan',
      'Challan no.',
      'E-way bill',
      'Carried by',
      'Company',
      'Phone',
      'Visitor pass',
      'Vehicle',
      'Employee',
      'Accepted by employee',
      'Boxes counted',
      'Counted at',
      'Counted by',
      'Released',
      'Status',
      'Return due',
      'Recorded by',
      'Remarks',
    ]),
    ...rows.map((m) =>
      csvRow([
        m.code,
        m.direction.toUpperCase(),
        m.returnable ? 'Returnable' : 'Non-returnable',
        m.mode,
        dt(m.createdAt),
        m.site,
        m.boxes,
        m.challanType,
        m.refNo,
        m.ewaybill,
        m.carrier?.name || m.pickerName,
        m.carrier?.company || m.pickerCompany,
        m.carrier?.phone || m.pickerPhone,
        m.carrier?.visitBadge,
        m.carrier?.vehicle,
        m.authorisedBy?.name ?? '',
        dt(m.receivedAt),
        m.checkedBoxes ?? '',
        dt(m.checkedAt),
        m.checkedBy?.name ?? '',
        dt(m.releasedAt),
        m.status,
        m.returnDue ? formatDateTime(m.returnDue) : '',
        m.createdBy?.name ?? '',
        m.remarks,
      ]),
    ),
  ];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="material-gate-passes.csv"');
  res.setHeader('Cache-Control', 'no-store');
  res.send(`${String.fromCharCode(0xfeff)}${lines.join('\r\n')}\r\n`);
});

// GET /api/material/:id
materialRouter.get('/:id', async (req, res) => {
  res.json({ pass: await serializeMaterial(await findPass(String(req.params.id), currentUser(req))) });
});

// GET /api/material/:id/pdf — the gate pass document
materialRouter.get('/:id/pdf', async (req, res) => {
  const m = await findPass(String(req.params.id), currentUser(req));
  const pdf = await gatePassPdf(m);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="gate-pass-${m.code}.pdf"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(pdf);
});

// ---------------------------------------------------------------- create

const UNIT_MAX = 20;

/**
 * POST /api/material (multipart): a new pass. Fields: direction (in | out; employees: out), mode (pickup for an
 * employee leaving boxes with security), boxes*, visitId, authorisedBy (employee id; gate users), challanType, refNo,
 * ewaybill, purpose, remarks, returnable, returnDue, items (JSON [{desc, qty, unit, serial}]), carrier fields
 * (carrierName, carrierCompany, carrierPhone, vehicle), pickup fields (pickerName, pickerCompany, pickerPhone),
 * expectedId. Files: challan (≤ 4), boxPhoto (≤ 6), carrier (1).
 */
materialRouter.post('/', upload, async (req, res) => {
  const user = currentUser(req);
  if (user.role === 'viewer') throw forbidden('Your account is read-only. Ask an admin for security access.');
  const gate = isOperator(user);
  const files = /** @type {Record<string, Express.Multer.File[]>} */ (req.files ?? {});
  const text = reader(req.body ?? {});
  const settings = await getSettings();

  const boxes = Math.round(Number(text('boxes')));
  if (!Number.isFinite(boxes) || boxes < 1 || boxes > 9999) throw badRequest('Enter the number of boxes.', 'boxes');
  const direction = gate ? text('direction') : 'out';
  if (direction !== 'in' && direction !== 'out') throw badRequest('Choose material IN or OUT.', 'direction');
  if (settings.mpChallanPhotoRequired && !files.challan?.length)
    throw badRequest('Take a photo of the challan.', 'challan');

  const returnable = text('returnable') === 'true';
  let returnDue = null;
  if (returnable) {
    returnDue = new Date(text('returnDue'));
    if (!text('returnDue') || Number.isNaN(returnDue.getTime()))
      throw badRequest('Pick the date the boxes should be back.', 'returnDue');
  }

  // Who carries the boxes.
  const visitId = text('visitId');
  const visit = visitId ? await openVisit(visitId, 'visitId') : null;
  const pickup = direction === 'out' && text('mode') === 'pickup';
  const mode = pickup ? 'pickup' : visit ? 'visitor' : 'gate';
  if (!gate && !visit && !pickup)
    throw badRequest('Pick the visitor who takes the boxes, or leave them with security for pickup.', 'visitId');
  if (mode === 'gate' && !text('carrierName'))
    throw badRequest('Enter the name of the person carrying the boxes.', 'carrierName');
  if (mode === 'gate' && settings.mpCarrierPhotoRequired && !files.carrier?.length) {
    throw badRequest('Take a photo of the person carrying the boxes.', 'carrier');
  }
  if (pickup && !text('pickerName')) throw badRequest('Enter who will collect the boxes.', 'pickerName');

  // The employee: receiving (IN) / sending (OUT). Employees making a pass are the sender themselves.
  let authorised = null;
  if (gate) {
    const id = text('authorisedBy') || (direction === 'in' && visit?.hostId ? visit.hostId : '');
    if (id) authorised = await employee(id, 'authorisedBy');
    if (direction === 'out' && !authorised && settings.mpAuthRequiredOut)
      throw badRequest('Pick the employee sending the boxes.', 'authorisedBy');
  } else authorised = user;

  /** @type {{ desc: string, qty: number, unit: string, serial: string }[]} */
  let extra = [];
  if (text('items')) {
    let parsed;
    try {
      parsed = JSON.parse(text('items'));
    } catch {
      throw badRequest('items must be a JSON list.', 'items');
    }
    if (!Array.isArray(parsed) || parsed.length > 30) throw badRequest('At most 30 item lines.', 'items');
    extra = parsed
      .filter((i) => i && typeof i.desc === 'string' && i.desc.trim())
      .map((i) => ({
        desc: String(i.desc).trim().slice(0, 200),
        qty: Number(i.qty) > 0 ? Number(i.qty) : 1,
        unit: String(i.unit ?? '')
          .trim()
          .slice(0, UNIT_MAX),
        serial: String(i.serial ?? '')
          .trim()
          .slice(0, 80),
      }));
  }

  const now = new Date();
  const needsApproval =
    direction === 'out' &&
    gate &&
    !!authorised &&
    authorised._id.toString() !== user._id.toString() &&
    settings.mpApprovalInApp;
  /** @type {string} */
  let status;
  if (direction === 'in') status = authorised ? 'awaiting_receipt' : returnable ? 'pending_return' : 'received';
  else if (needsApproval) status = 'awaiting_approval';
  else if (pickup) status = 'awaiting_drop';
  else if (mode === 'visitor') status = 'ready';
  else status = returnable ? 'pending_return' : 'done';
  const released = direction === 'out' && mode === 'gate' && !needsApproval;
  const counted = (direction === 'in' && gate) || released;
  const me = userRef(user);

  // Photos last, after every check.
  const challanPhotos = await storeAll(files.challan ?? [], CHALLAN_MAX_EDGE, 'challan');
  /** @type {string[]} */
  let photos = [];
  /** @type {string[]} */ // set below, after the challan photos
  let carrierPhoto;
  try {
    photos = await storeAll(files.boxPhoto ?? [], BOX_MAX_EDGE, 'boxPhoto');
    carrierPhoto = mode === 'gate' ? await storeAll(files.carrier ?? [], PERSON_MAX_EDGE, 'carrier') : [];
  } catch (e) {
    await Promise.all([...challanPhotos, ...photos].map((r) => deleteImage(r)));
    throw e;
  }

  const carrier =
    mode === 'visitor' && visit
      ? {
          name: visit.name,
          company: visit.company ?? '',
          phone: visit.phone ?? '',
          vehicle: (text('vehicle') || visit.vehicle || '').toUpperCase(),
          visitId: visit.pass,
          visitBadge: visit.badge ?? '',
          photo: visit.photo || null,
        }
      : mode === 'gate'
        ? {
            name: text('carrierName'),
            company: text('carrierCompany'),
            phone: text('carrierPhone'),
            vehicle: text('vehicle').toUpperCase(),
            visitId: null,
            visitBadge: '',
            photo: carrierPhoto[0] ?? null,
          }
        : { name: '', company: '', phone: '', vehicle: '', visitId: null, visitBadge: '', photo: null };

  /** @type {any} */
  let m = null;
  for (let attempt = 0; attempt < 8 && !m; attempt++) {
    try {
      m = await MaterialPass.create({
        code: generatePassNumber(now, /** @type {any} */ ('MP')),
        site: visit?.site ?? (settings.sites.includes(text('site')) ? text('site') : settings.sites[0]),
        direction,
        mode,
        boxes,
        items: [{ desc: 'Boxes', qty: boxes, unit: 'Box', serial: '' }, ...extra],
        challanType: text('challanType').slice(0, 60),
        refNo: text('refNo').toUpperCase().slice(0, 60),
        ewaybill: text('ewaybill').slice(0, 20),
        challanPhotos,
        photos,
        carrier,
        purpose: text('purpose').slice(0, 80),
        remarks: text('remarks').slice(0, 500),
        returnable,
        returnDue,
        status,
        visitId: visit?.pass ?? null,
        authorisedBy: authorised ? userRef(authorised) : null,
        requestedBy: gate ? null : me,
        createdBy: me,
        pickerName: pickup ? text('pickerName') : '',
        pickerCompany: pickup ? text('pickerCompany') : '',
        pickerPhone: pickup ? text('pickerPhone') : '',
        ...(counted ? { checkedBoxes: boxes, checkedAt: now, checkedBy: me } : {}),
        ...(released ? { releasedAt: now, releasedBy: me } : {}),
        ...(direction === 'in' && !authorised ? { receivedAt: now, receivedBy: me, receiptVia: 'security' } : {}),
      });
    } catch (err) {
      if (/** @type {any} */ (err)?.code === 11000) continue;
      await Promise.all([...challanPhotos, ...photos, ...carrierPhoto].map((r) => deleteImage(r)));
      throw err;
    }
  }
  if (!m) throw conflict('Could not allocate a gate pass number. Try again.');

  // A pre-registered delivery / visitor with boxes: link it (a delivery is now in).
  const expectedId = text('expectedId');
  if (expectedId) {
    const e = await Expected.findOneAndUpdate(
      { code: expectedId.toUpperCase() },
      { $set: { mpId: m.code } },
      { returnDocument: 'after' },
    );
    if (e) {
      m.expectedId = e.code;
      await m.save();
      if (e.kind === 'delivery' && e.status === 'expected') {
        const arrived = await Expected.findOneAndUpdate(
          { _id: e._id, status: 'expected' },
          { $set: { status: 'arrived', arrivedAt: now, arrivedBy: me } },
          { returnDocument: 'after' },
        );
        if (arrived) emitExpectedChanged(arrived);
      } else emitExpectedChanged(e);
    }
  }

  void emitMaterialChanged(m);
  if (status === 'awaiting_receipt') {
    void notify([m.authorisedBy.id], {
      event: 'material_in',
      title: `📦 ${boxesText(boxes)} brought in for you`,
      body: `${carrierName(m)}${m.challanType ? ` · ${m.challanType} ${m.refNo}`.trimEnd() : ''} · tap Received once you have them`,
      data: data(m),
    });
  }
  if (status === 'awaiting_approval') {
    void notify([m.authorisedBy.id], {
      event: 'material_approval',
      title: `📦 Approve gate pass: ${boxesText(boxes)} going out`,
      body: `${m.pickerName || carrierName(m)} · raised by ${user.name} · ${m.code}`,
      data: data(m),
    });
  }
  res.status(201).json({ pass: await serializeMaterial(m) });
});

// ---------------------------------------------------------------- actions

// POST /api/material/:id/receipt { ok, note } — the receiving employee (or security, "on paper", with a note)
materialRouter.post('/:id/receipt', async (req, res) => {
  const user = currentUser(req);
  const m = await findPass(String(req.params.id), user);
  const me = user._id.toString();
  const body = req.body ?? {};
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : '';
  const mine = m.authorisedBy?.id === me;
  if (!mine && !isOperator(user)) throw forbidden('Only the employee receiving it, or security, can record this.');
  if (body.ok === false) {
    if (!mine) throw forbidden('Only the employee receiving it can say it did not arrive.');
    const updated = await transition(
      m,
      ['awaiting_receipt'],
      { status: 'disputed', receiptNote: note || 'Not received' },
      'This gate pass is no longer waiting for you.',
    );
    void emitMaterialChanged(updated);
    void notify(gateStaffIds(), {
      event: 'material_disputed',
      title: `⚠️ ${m.authorisedBy.name} says boxes not received`,
      body: `${boxesText(m.boxes)} · brought by ${carrierName(m)} · ${m.code}${note ? ` · “${note}”` : ''}`,
      data: data(m),
    });
    return res.json({ pass: await serializeMaterial(updated) });
  }
  if (!mine && !note) throw badRequest('Say how the receipt was confirmed.', 'note');
  const updated = await transition(
    m,
    mine ? ['awaiting_receipt'] : ['awaiting_receipt', 'disputed'],
    {
      status: m.returnable ? 'pending_return' : 'received',
      receivedAt: new Date(),
      receivedBy: m.authorisedBy ?? userRef(user),
      receiptNote: note,
      receiptVia: mine ? 'app' : 'security',
    },
    'Already recorded.',
  );
  void emitMaterialChanged(updated);
  res.json({ pass: await serializeMaterial(updated) });
});

// POST /api/material/:id/decision { approve, note } — the employee named on a security-made OUT pass
materialRouter.post('/:id/decision', async (req, res) => {
  const user = currentUser(req);
  const m = await findPass(String(req.params.id), user);
  if (m.authorisedBy?.id !== user._id.toString() && user.role !== 'admin')
    throw forbidden('Only the employee named on the pass can approve it.');
  const body = req.body ?? {};
  if (typeof body.approve !== 'boolean') throw badRequest('approve must be true or false.', 'approve');
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : '';
  const updated = await transition(
    m,
    ['awaiting_approval'],
    {
      status: body.approve ? (m.mode === 'pickup' ? 'awaiting_drop' : 'ready') : 'rejected',
      approvedAt: new Date(),
      approvedBy: userRef(user),
      approvalNote: note,
    },
    'Already decided.',
  );
  void emitMaterialChanged(updated);
  void notify(gateStaffIds(), {
    event: 'material_decision',
    title: body.approve
      ? `✅ Gate pass approved: ${boxesText(m.boxes)} can go`
      : `❌ Gate pass rejected: do not release`,
    body: `${user.name} · ${m.code}${note ? ` · “${note}”` : ''}`,
    data: data(m),
  });
  res.json({ pass: await serializeMaterial(updated) });
});

/** The count must match the pass. @param {any} m @param {unknown} raw @param {string} msg */
function checkCount(m, raw, msg) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n !== m.boxes)
    throw badRequest(msg.replace('{n}', String(Number.isFinite(n) ? n : 0)), 'boxes');
  return n;
}

// POST /api/material/:id/drop { boxes } — security: the employee handed the boxes in for pickup
materialRouter.post('/:id/drop', canWrite, async (req, res) => {
  const user = currentUser(req);
  const m = await findPass(String(req.params.id), user);
  const n = checkCount(m, req.body?.boxes, `The pass says ${m.boxes} boxes. You counted {n}.`);
  const updated = await transition(
    m,
    ['awaiting_drop'],
    { status: 'ready_for_pickup', droppedAt: new Date(), droppedBy: userRef(user), droppedBoxes: n },
    'These boxes are not waiting to be handed in.',
  );
  void emitMaterialChanged(updated);
  res.json({ pass: await serializeMaterial(updated) });
});

// POST /api/material/:id/release (multipart) { boxes, vehicle, pickerVisitId?, pickerName?, pickerPhone? } + carrier photo
materialRouter.post('/:id/release', canWrite, upload, async (req, res) => {
  const user = currentUser(req);
  const m = await findPass(String(req.params.id), user);
  const text = reader(req.body ?? {});
  const files = /** @type {Record<string, Express.Multer.File[]>} */ (req.files ?? {});
  if (!['ready', 'ready_for_pickup'].includes(m.status)) throw conflict('Not ready to release.');
  const n = checkCount(m, text('boxes'), `The pass is for ${m.boxes} boxes but you counted {n}. Do not release.`);
  const settings = await getSettings();
  /** @type {Record<string, unknown>} */
  const set = {};
  /** @type {string[]} */
  let stored = [];
  if (m.status === 'ready_for_pickup') {
    const pickerVisit = text('pickerVisitId') ? await openVisit(text('pickerVisitId'), 'pickerVisitId') : null;
    if (pickerVisit) {
      set.carrier = {
        name: pickerVisit.name,
        company: pickerVisit.company ?? '',
        phone: pickerVisit.phone ?? '',
        vehicle: text('vehicle').toUpperCase(),
        visitId: pickerVisit.pass,
        visitBadge: pickerVisit.badge ?? '',
        photo: pickerVisit.photo || null,
      };
    } else {
      const name = text('pickerName') || m.pickerName;
      if (!name) throw badRequest('Enter the name of the person collecting.', 'pickerName');
      if (!files.carrier?.length && settings.mpCarrierPhotoRequired)
        throw badRequest('Take a photo of the person collecting.', 'carrier');
      stored = await storeAll(files.carrier ?? [], PERSON_MAX_EDGE, 'carrier');
      set.carrier = {
        name,
        company: m.pickerCompany,
        phone: text('pickerPhone') || m.pickerPhone,
        vehicle: text('vehicle').toUpperCase(),
        visitId: null,
        visitBadge: '',
        photo: stored[0] ?? null,
      };
    }
  } else if (text('vehicle')) set['carrier.vehicle'] = text('vehicle').toUpperCase();
  const now = new Date();
  let updated;
  try {
    updated = await transition(
      m,
      [m.status],
      {
        ...set,
        status: m.returnable ? 'pending_return' : 'done',
        releasedAt: now,
        releasedBy: userRef(user),
        checkedBoxes: n,
        checkedAt: now,
        checkedBy: userRef(user),
      },
      'Not ready to release.',
    );
  } catch (e) {
    await Promise.all(stored.map((r) => deleteImage(r)));
    throw e;
  }
  void emitMaterialChanged(updated);
  res.json({ pass: await serializeMaterial(updated) });
});

// POST /api/material/:id/return (multipart) { lines: JSON [{i, qty}], note } + returnPhoto — security
materialRouter.post('/:id/return', canWrite, upload, async (req, res) => {
  const user = currentUser(req);
  const m = await findPass(String(req.params.id), user);
  if (!['pending_return', 'partly_returned'].includes(m.status)) throw conflict('Nothing is outstanding on this pass.');
  const text = reader(req.body ?? {});
  const files = /** @type {Record<string, Express.Multer.File[]>} */ (req.files ?? {});
  /** @type {{ i: number, qty: number }[]} */
  let lines;
  if (text('lines')) {
    try {
      lines = JSON.parse(text('lines'));
    } catch {
      throw badRequest('lines must be a JSON list.', 'lines');
    }
    if (!Array.isArray(lines)) throw badRequest('lines must be a JSON list.', 'lines');
    lines = lines
      .map((l) => ({ i: Number(l?.i), qty: Number(l?.qty) }))
      .filter((l) => Number.isInteger(l.i) && l.qty > 0);
  } else {
    lines = m.items.map((_, i) => ({ i, qty: outstanding(m, i) })).filter((l) => l.qty > 0);
  }
  if (!lines.length) throw badRequest('Enter at least one quantity.', 'lines');
  for (const l of lines) {
    if (l.i < 0 || l.i >= m.items.length) throw badRequest('Unknown item line.', 'lines');
    const left = outstanding(m, l.i);
    if (l.qty > left) throw badRequest(`Only ${left} outstanding for ${m.items[l.i].desc}.`, 'lines');
  }
  const photo = (await storeAll(files.returnPhoto ?? [], BOX_MAX_EDGE, 'returnPhoto'))[0] ?? null;
  const now = new Date();
  const entry = { at: now, by: userRef(user), lines, note: text('note').slice(0, 500), photo };
  const after = { ...m.toObject(), returns: [...m.returns.map((r) => r.toObject?.() ?? r), entry] };
  const allBack = m.items.every((_, i) => outstanding(after, i) === 0);
  let updated;
  try {
    updated = await transition(
      m,
      ['pending_return', 'partly_returned'],
      allBack
        ? { status: 'returned', returnedAt: now, returnedBy: userRef(user), returnNote: entry.note }
        : { status: 'partly_returned' },
      'This pass changed meanwhile. Reload and try again.',
      { $push: { returns: entry } },
    );
  } catch (e) {
    if (photo) await deleteImage(photo);
    throw e;
  }
  void emitMaterialChanged(updated);
  res.json({ pass: await serializeMaterial(updated) });
});

// POST /api/material/:id/cancel — security, or the employee who made it, while nothing has moved
materialRouter.post('/:id/cancel', async (req, res) => {
  const user = currentUser(req);
  const m = await findPass(String(req.params.id), user);
  if (!isOperator(user) && m.requestedBy?.id !== user._id.toString())
    throw forbidden('Only security or the employee who made it can cancel this pass.');
  const updated = await transition(
    m,
    MP_CANCELLABLE,
    { status: 'cancelled', cancelledAt: new Date(), cancelledBy: userRef(user) },
    'This pass can no longer be cancelled.',
  );
  void emitMaterialChanged(updated);
  res.json({ pass: await serializeMaterial(updated) });
});

// POST /api/material/:id/remind — security reminds the receiving employee
materialRouter.post('/:id/remind', canWrite, async (req, res) => {
  const m = await findPass(String(req.params.id), currentUser(req));
  if (m.status !== 'awaiting_receipt' || !m.authorisedBy) throw conflict('Nobody is being asked to accept this pass.');
  void notify([m.authorisedBy.id], {
    event: 'material_in',
    title: `⏰ Reminder: ${boxesText(m.boxes)} waiting for you to accept`,
    body: `${carrierName(m)} · ${m.code} · tap Received once you have them`,
    data: data(m),
  });
  res.json({ ok: true });
});
