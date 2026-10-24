import { Router } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { z } from 'zod';
import { config } from '../config.js';
import { currentUser, requireAuth, requireGate, requireModule, requireRole } from '../middleware/auth.js';
import { ApiError, badRequest, conflict, forbidden, notFound } from '../middleware/error.js';
import { MAIL_STATUSES, MAIL_STATUS_LABELS, MailItem } from '../models/MailItem.js';
import { RECIPIENT_FILTER, User, canSignIn } from '../models/User.js';
import { emitMailCreated, emitMailReminder, emitMailUpdated } from '../realtime.js';
import { mailToCsv } from '../services/csv.js';
import { isoDay } from '../services/format.js';
import { COVER_MAX_EDGE, PERSON_MAX_EDGE, deleteImage, storeImage } from '../services/images.js';
import { PACE_ID_PREFIX, upsertPaceRecipient } from '../services/pace.js';
import { notify } from '../services/notify.js';
import { paginate, parseListQuery, queryString, searchFilter } from '../services/pagination.js';
import { generatePassNumber } from '../services/passNumber.js';
import { mailFields, serializeMail } from '../services/serializeMail.js';
import { getSettings } from '../services/settings.js';

export const mailRouter = Router();
mailRouter.use(requireAuth);
// Module access: Post room. A receiver can always confirm their own item, and an employee open it (from a
// notification; GET /:id is scoped to their own items).
const needPost = requireModule('post');
mailRouter.use((req, res, next) => {
  const confirm = req.method === 'POST' && /^\/[^/]+\/confirm$/.test(req.path);
  const ownItem = req.method === 'GET' && /^\/(?!export\.csv$)[^/]+$/.test(req.path) && currentUser(req).role === 'host';
  if (confirm || ownItem) return next();
  return needPost(req, res, next);
});

const canWrite = requireRole('security', 'admin');

const EXPORT_CAP = 10_000;
const LIST_OPTS = { sortFields: ['receivedAt', 'handedAt'], defaultSort: '-receivedAt' };
const SEARCH_FIELDS = [
  'code', 'refNo', 'sender', 'carrier', 'broughtBy', 'broughtPhone', 'recipientName', 'dept', 'kind', 'collectedBy',
];
const NOT_YOURS = 'This item is not addressed to you';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 3, fields: 40, fieldSize: 16 * 1024 },
}).fields([
  { name: 'cover', maxCount: 1 },
  { name: 'coverBack', maxCount: 1 },
  { name: 'person', maxCount: 1 },
]);

// ---------------------------------------------------------------- helpers

/**
 * Notifications (docs/API.md "What is pushed" + "In-app notifications"): stored per user, sent over the
 * user's socket room and pushed to their phones. Storing is awaited; pushes are fire-and-forget.
 * @param {any} item
 */
const mailData = (item) => ({ type: 'mail', id: item.code });
const notifyMail = {
  /** @param {any} item */
  logged: (item) =>
    notify([item.recipient.id], {
      event: 'mail_logged',
      title: `📬 ${item.kind} for you`,
      body: `From ${item.sender} · collect it at the gate`,
      data: mailData(item),
    }),
  /** @param {any} item */
  reminder: (item) =>
    notify([item.recipient.id], {
      event: 'mail_reminder',
      title: `⏰ Reminder: ${item.kind} waiting`,
      body: `From ${item.sender} · still at the gate`,
      data: mailData(item),
    }),
  /** @param {any} item */
  handed: (item) =>
    notify([item.recipient.id], {
      event: 'mail_confirm',
      title: '✅ Please confirm collection',
      body: `${item.kind} from ${item.sender} was handed to ${item.collectedBy}. Did you get it?`,
      data: mailData(item),
    }),
  /** All active security + admin users. @param {any} item */
  disputed: (item) =>
    notify(
      User.find({ active: true, role: { $in: ['security', 'admin'] } }, { _id: 1 })
        .lean()
        .then((staff) => staff.map((u) => u._id.toString())),
      {
        event: 'mail_disputed',
        title: `⚠️ ${item.recipientName} didn't get it`,
        body: `${item.kind} from ${item.sender} · ${item.disputeNote}`,
        data: mailData(item),
      },
    ),
};

/** @param {any} user */
const isHostRole = (user) => user.role === 'host';

/** @param {Record<string, unknown>} query @param {string} key */
function isoParam(query, key) {
  const raw = queryString(query, key);
  if (raw === undefined) return undefined;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) throw badRequest(`${key} must be an ISO date-time.`, key);
  return d;
}

/**
 * Site + recipient scope (what `counts` is computed over). A `host` is always limited to their own items.
 * @param {Record<string, unknown>} query
 * @param {any} user
 */
function scopeFilter(query, user) {
  /** @type {Record<string, unknown>} */
  const filter = {};
  const site = queryString(query, 'site');
  if (site) filter.site = site;
  const myId = user._id.toString();
  if (isHostRole(user)) {
    filter['recipient.id'] = myId;
  } else {
    const recipient = queryString(query, 'recipient');
    if (recipient !== undefined) {
      if (recipient === 'me') filter['recipient.id'] = myId;
      else if (mongoose.isValidObjectId(recipient)) filter['recipient.id'] = recipient;
      else throw badRequest('recipient must be "me" or a user id.', 'recipient');
    }
  }
  return filter;
}

/**
 * Scope + status, dates and search (the list / export filter).
 * @param {Record<string, unknown>} query
 * @param {Record<string, unknown>} scope
 * @param {string | undefined} q
 */
function listFilter(query, scope, q) {
  /** @type {Record<string, any>} */
  const filter = { ...scope };
  const status = queryString(query, 'status');
  if (status !== undefined) {
    const statuses = [...new Set(status.split(',').map((s) => s.trim()).filter(Boolean))];
    const bad = statuses.find((s) => !MAIL_STATUSES.includes(/** @type {any} */ (s)));
    if (bad !== undefined || statuses.length === 0) {
      throw badRequest(`status must be one or more of: ${MAIL_STATUSES.join(', ')}.`, 'status');
    }
    filter.status = statuses.length === 1 ? statuses[0] : { $in: statuses };
  }
  const from = isoParam(query, 'from');
  const to = isoParam(query, 'to');
  if (from || to) filter.receivedAt = { ...(from ? { $gte: from } : {}), ...(to ? { $lt: to } : {}) };
  return { ...filter, ...searchFilter(q, SEARCH_FIELDS) };
}

/** @param {Record<string, unknown>} scope */
async function statusCounts(scope) {
  const rows = await MailItem.aggregate([
    { $match: { ...scope, status: { $in: ['lodged', 'handed', 'disputed'] } } },
    { $group: { _id: '$status', n: { $sum: 1 } } },
  ]);
  /** @type {{ lodged: number, handed: number, disputed: number }} */
  const counts = { lodged: 0, handed: 0, disputed: 0 };
  for (const r of rows) counts[/** @type {'lodged'|'handed'|'disputed'} */ (r._id)] = r.n;
  return counts;
}

/** @param {string} id */
async function findItem(id) {
  const item = await MailItem.findOne({ code: id.trim().toUpperCase() });
  if (!item) throw notFound('Post item not found.');
  return item;
}

/** @param {any} user */
const guardRef = (user) => ({ id: user._id.toString(), name: user.name });

/**
 * Atomic status transition: only applies if the item is still in `from`.
 * @param {any} item
 * @param {string} from
 * @param {Record<string, unknown>} set
 */
async function transition(item, from, set) {
  return MailItem.findOneAndUpdate({ _id: item._id, status: from }, { $set: set }, { returnDocument: 'after' });
}

// ---------------------------------------------------------------- reads

// GET /api/mail — paginated + counts
mailRouter.get('/', async (req, res) => {
  const now = Date.now();
  const user = currentUser(req);
  const lq = parseListQuery(req.query, LIST_OPTS);
  const scope = scopeFilter(req.query, user);
  const filter = listFilter(req.query, scope, lq.q);
  const [page, counts] = await Promise.all([
    paginate(MailItem, filter, lq, (m) => serializeMail(m, now)),
    statusCounts(scope),
  ]);
  res.json({ ...page, counts });
});

// GET /api/mail/export.csv — gate users; same filters/q/sort, not paginated
mailRouter.get('/export.csv', requireGate, async (req, res) => {
  const now = Date.now();
  const user = currentUser(req);
  const { page: _p, limit: _l, ...rest } = req.query;
  const lq = parseListQuery(rest, LIST_OPTS);
  const filter = listFilter(req.query, scopeFilter(req.query, user), lq.q);
  const items = await MailItem.find(filter).sort(lq.sort).limit(EXPORT_CAP);
  const csv = mailToCsv(items.map((m) => mailFields(m, now)), MAIL_STATUS_LABELS);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="post-register-${isoDay(new Date(now))}.csv"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(csv);
});

mailRouter.get('/:id', async (req, res) => {
  const user = currentUser(req);
  const item = await findItem(String(req.params.id));
  if (isHostRole(user) && item.recipient?.id !== user._id.toString()) throw forbidden(NOT_YOURS);
  res.json({ item: await serializeMail(item) });
});

// ---------------------------------------------------------------- create

/** @type {Record<string, string>} */
const LABELS = { kind: 'Type', sender: 'From (sender)', broughtBy: "Delivery person's name", site: 'Gate' };
/** @type {Record<string, number>} */
const MAX_LEN = {
  kind: 80, sender: 150, broughtBy: 100, recipientName: 100, site: 80, refNo: 60, carrier: 80, broughtPhone: 20,
  dept: 80, notes: 1000,
};

mailRouter.post('/', canWrite, upload, async (req, res) => {
  const guard = currentUser(req);
  const files = /** @type {Record<string, Express.Multer.File[]>} */ (req.files ?? {});
  const body = /** @type {Record<string, unknown>} */ (req.body ?? {});
  /** @param {string} k */
  const text = (k) => {
    const v = Array.isArray(body[k]) ? body[k][0] : body[k];
    return typeof v === 'string' ? v.trim() : '';
  };

  const rules = await getSettings();
  // Required fields, in form order.
  for (const f of ['kind', 'sender', 'broughtBy']) {
    if (!text(f)) throw badRequest(`${LABELS[f]} is required.`, f);
  }
  const recipientId = text('recipientId');
  if (!recipientId && !text('recipientName')) throw badRequest('Choose who it is for, or type their name.', 'recipientName');
  // Photo rules (settings): cover front + back, delivery person.
  if (rules.mailCoverRequired && !files.cover?.[0]) throw badRequest('Take a photo of the cover.', 'cover');
  if (rules.mailCoverRequired && !files.coverBack?.[0]) throw badRequest('Take a photo of the back of the cover.', 'coverBack');
  if (rules.mailPersonPhotoRequired && !files.person?.[0]) throw badRequest('Take a photo of the delivery person.', 'person');

  for (const [k, max] of Object.entries(MAX_LEN)) {
    if (text(k).length > max) throw badRequest(`${k} is too long (max ${max} characters).`, k);
  }
  const broughtPhone = text('broughtPhone');
  if (!/^[0-9+\-\s()]*$/.test(broughtPhone)) {
    throw badRequest('Delivery person mobile can only use digits, spaces and +.', 'broughtPhone');
  }
  const piecesRaw = text('pieces');
  const pieces = piecesRaw === '' ? 1 : Number(piecesRaw);
  if (!Number.isInteger(pieces) || pieces < 1 || pieces > 99) {
    throw badRequest('No. of pieces must be a whole number from 1 to 99.', 'pieces');
  }

  const settings = await getSettings();
  const kind = text('kind');
  // `site` is optional: with a single gate the apps don't send it, so default to the first gate.
  const site = text('site') || settings.sites[0];
  if (!settings.mailKinds.includes(kind)) throw badRequest(`"${kind}" is not a type of post in settings.`, 'kind');
  if (!settings.sites.includes(site)) throw badRequest(`"${site}" is not a gate in settings.`, 'site');

  let recipient = null;
  /** Only recipients who can sign in get notified and asked to confirm. */
  let notifyRecipient = false;
  if (recipientId) {
    let user;
    if (recipientId.startsWith(PACE_ID_PREFIX)) {
      // Pace employee: resolved against Pace and upserted as a local (password-less) host user.
      user = await upsertPaceRecipient(recipientId);
    } else {
      user = mongoose.isValidObjectId(recipientId)
        ? await User.findOne({ _id: recipientId, ...RECIPIENT_FILTER })
        : null;
      if (!user) throw badRequest('Choose a receiver from the list (an active employee).', 'recipientId');
    }
    recipient = { id: user._id.toString(), name: user.name, phone: user.phone ?? '', location: user.location ?? '' };
    recipient.dept = user.dept ?? '';
    notifyRecipient = canSignIn(user);
  }

  // Store the three photos; if any save fails, remove the ones already saved.
  /** @type {string[]} */
  const saved = [];
  const removeSaved = () => Promise.all(saved.map((ref) => deleteImage(ref)));
  let cover = '';
  /** @type {string | null} */
  let coverBack = null;
  let person = '';
  try {
    if (files.cover?.[0]) saved.push((cover = await storeImage(files.cover[0].buffer, COVER_MAX_EDGE, 'cover')));
    if (files.coverBack?.[0]) {
      saved.push((coverBack = await storeImage(files.coverBack[0].buffer, COVER_MAX_EDGE, 'coverBack')));
    }
    if (files.person?.[0]) saved.push((person = await storeImage(files.person[0].buffer, PERSON_MAX_EDGE, 'person')));
  } catch (e) {
    await removeSaved();
    throw e;
  }

  const now = new Date();
  let item = null;
  for (let attempt = 0; attempt < 8 && !item; attempt++) {
    try {
      item = await MailItem.create({
        code: generatePassNumber(now, 'ML'),
        kind,
        refNo: text('refNo').toUpperCase(),
        sender: text('sender'),
        carrier: text('carrier'),
        broughtBy: text('broughtBy'),
        broughtPhone,
        recipient: recipient
          ? { id: recipient.id, name: recipient.name, phone: recipient.phone, location: recipient.location }
          : null,
        recipientName: recipient ? recipient.name : text('recipientName'),
        dept: text('dept') || recipient?.dept || '',
        pieces,
        notes: text('notes'),
        site,
        receivedAt: now,
        receivedBy: guardRef(guard),
        cover,
        coverBack,
        person,
        status: 'lodged',
        notifiedAt: notifyRecipient ? now : null,
      });
    } catch (e) {
      if (/** @type {any} */ (e)?.code === 11000) continue; // id collision: retry
      await removeSaved();
      throw e;
    }
  }
  if (!item) {
    await removeSaved();
    throw new ApiError(500, 'internal', 'Could not allocate an entry number. Try again.');
  }

  emitMailCreated(item);
  if (notifyRecipient && item.recipient?.id) await notifyMail.logged(item);
  res.status(201).json({ item: await serializeMail(item) });
});

// ---------------------------------------------------------------- state machine

/** The recipient's local user, if it can sign in (and so confirm / get reminders). @param {any} item */
async function recipientCanSignIn(item) {
  if (!item.recipient?.id || !mongoose.isValidObjectId(item.recipient.id)) return false;
  return canSignIn(await User.findById(item.recipient.id));
}

mailRouter.post('/:id/remind', canWrite, async (req, res) => {
  const item = await findItem(String(req.params.id));
  if (item.status !== 'lodged' || !item.recipient?.id) {
    throw conflict(
      item.status !== 'lodged'
        ? 'Already handed over. Nothing to remind about.'
        : `${item.recipientName} is not on TruSentinel. Call them instead.`,
    );
  }
  if (!(await recipientCanSignIn(item))) {
    throw conflict("This receiver can't sign in to TruSentinel, so they can't get reminders. Call them instead.");
  }
  const updated = await transition(item, 'lodged', { remindedAt: new Date() });
  if (!updated) throw conflict('Already handed over. Nothing to remind about.');
  emitMailReminder(updated);
  emitMailUpdated(updated);
  await notifyMail.reminder(updated);
  res.json({ item: await serializeMail(updated) });
});

const handoverSchema = z.object({
  collectedBy: z
    .string({ error: 'Enter who collected it.' })
    .trim()
    .min(1, 'Enter who collected it.')
    .max(100, 'Name is too long.'),
  note: z.string({ error: 'Remarks must be text.' }).trim().max(1000, 'Remarks are too long.').optional(),
});

mailRouter.post('/:id/handover', canWrite, async (req, res) => {
  const user = currentUser(req);
  const body = handoverSchema.parse(req.body ?? {});
  const item = await findItem(String(req.params.id));
  if (item.status !== 'lodged') throw conflict('Already handed over');
  const updated = await transition(item, 'lodged', {
    // Confirmation step only for receivers who can sign in to Gatebook.
    status: (await recipientCanSignIn(item)) ? 'handed' : 'closed',
    handedAt: new Date(),
    handedBy: guardRef(user),
    collectedBy: body.collectedBy,
    handedNote: body.note ?? '',
  });
  if (!updated) throw conflict('Already handed over');
  emitMailUpdated(updated);
  if (updated.status === 'handed') await notifyMail.handed(updated);
  res.json({ item: await serializeMail(updated) });
});

const confirmSchema = z.object({
  ok: z.boolean({ error: 'ok must be true or false.' }),
  note: z.string({ error: 'Note must be text.' }).trim().max(1000, 'Note is too long.').optional(),
});

mailRouter.post('/:id/confirm', async (req, res) => {
  const user = currentUser(req);
  const item = await findItem(String(req.params.id));
  const isRecipient = item.recipient?.id === user._id.toString();
  if (!isRecipient && user.role !== 'admin') throw forbidden(NOT_YOURS);
  const body = confirmSchema.parse(req.body ?? {});

  if (item.status !== 'handed') {
    throw conflict(
      item.status === 'lodged' ? 'Security has not handed this over yet' : 'This item has already been answered for.',
      undefined,
      { item: await serializeMail(item) },
    );
  }

  const set = body.ok
    ? { status: 'confirmed', confirmedAt: new Date() }
    : { status: 'disputed', disputeNote: body.note || 'Receiver says it was not collected' };
  const updated = await transition(item, 'handed', set);
  if (!updated) {
    const fresh = await findItem(item.code);
    throw conflict('This item has already been answered for.', undefined, { item: await serializeMail(fresh) });
  }
  emitMailUpdated(updated);
  if (updated.status === 'disputed') await notifyMail.disputed(updated);
  res.json({ item: await serializeMail(updated) });
});

const resolveSchema = z.object({
  note: z
    .string({ error: 'Write what was found or done' })
    .trim()
    .min(1, 'Write what was found or done')
    .max(1000, 'Note is too long.'),
});

mailRouter.post('/:id/resolve', canWrite, async (req, res) => {
  const user = currentUser(req);
  const body = resolveSchema.parse(req.body ?? {});
  const item = await findItem(String(req.params.id));
  if (item.status !== 'disputed') throw conflict('Only items the receiver disputed can be resolved.');
  const updated = await transition(item, 'disputed', {
    status: 'resolved',
    resolvedAt: new Date(),
    resolvedBy: guardRef(user),
    resolveNote: body.note,
  });
  if (!updated) throw conflict('Only items the receiver disputed can be resolved.');
  emitMailUpdated(updated);
  res.json({ item: await serializeMail(updated) });
});
