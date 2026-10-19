import { Router } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { z } from 'zod';
import { config } from '../config.js';
import { currentUser, isGateUser, requireAuth, requireGate, requireModule, requireRole } from '../middleware/auth.js';
import { badRequest, conflict, forbidden, notFound } from '../middleware/error.js';
import { INCIDENT_SEVERITIES, Incident } from '../models/Incident.js';
import { User } from '../models/User.js';
import { emitIncidentChanged } from '../realtime.js';
import { csvRow } from '../services/csv.js';
import { runMatrix } from '../services/escalation.js';
import { formatDateTime } from '../services/format.js';
import { COVER_MAX_EDGE, deleteImage, storeImage } from '../services/images.js';
import { hasModule } from '../services/modules.js';
import { notify } from '../services/notify.js';
import { paginate, parseListQuery, queryString, searchFilter } from '../services/pagination.js';
import { generatePassNumber } from '../services/passNumber.js';
import { serializeIncident } from '../services/serializeOps.js';
import { getSettings } from '../services/settings.js';

/**
 * Incidents (docs/API.md "Incidents"). Module `incidents`. Gate users see every incident; others the ones they
 * reported or were given. Security and admins update, assign and close any incident; the assigned person updates
 * and closes theirs; the reporter can add notes. Admins reopen. Viewers are read-only.
 */
export const incidentsRouter = Router();
incidentsRouter.use(requireAuth, requireModule('incidents'));

const TABS = ['open', 'closed', 'all'];
const MAX_PHOTOS = 3;
const EXPORT_CAP = 10_000;
const FUTURE_SLACK_MS = 5 * 60_000;
const SEARCH_FIELDS = ['code', 'type', 'location', 'description', 'people', 'reportedBy.name', 'assignedTo.name'];
const SEVERITY_LABEL = { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' };
const STATUS_LABEL = { open: 'Open', in_progress: 'In progress', closed: 'Closed' };

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: MAX_PHOTOS, fields: 20, fieldSize: 16 * 1024 },
}).fields([{ name: 'photos', maxCount: MAX_PHOTOS }]);

/** @param {any} u */
const userRef = (u) => ({ id: u._id.toString(), name: u.name });
/** @param {any} user */
const isOperator = (user) => user.role === 'security' || user.role === 'admin';
/** @param {any} i */
const data = (i) => ({ type: 'incident', id: i.code });
/** @param {string} label @param {number} max */
const text = (label, max) =>
  z
    .string({ error: `${label} must be text.` })
    .trim()
    .max(max, `${label} is too long (max ${max}).`);

/** @param {any} user */
function scope(user) {
  if (isGateUser(user)) return {};
  const me = user._id.toString();
  return { $or: [{ 'reportedBy.id': me }, { 'assignedTo.id': me }] };
}

/** An incident the user may see, else 404. @param {string} id @param {any} user */
async function findIncident(id, user) {
  const i = await Incident.findOne({ code: id.trim().toUpperCase(), ...scope(user) });
  if (!i) throw notFound('Incident not found.');
  return i;
}

/** @param {any} user */
function refuseViewer(user) {
  if (user.role === 'viewer') throw forbidden('Your account is read-only. Ask an admin for security access.');
}

/** @param {Record<string, unknown>} query @param {any} user */
function listFilter(query, user) {
  const tab = queryString(query, 'tab') ?? 'open';
  if (!TABS.includes(tab)) throw badRequest(`tab must be one of: ${TABS.join(', ')}.`, 'tab');
  const severity = queryString(query, 'severity');
  if (severity !== undefined && !INCIDENT_SEVERITIES.includes(/** @type {any} */ (severity)))
    throw badRequest(`severity must be one of: ${INCIDENT_SEVERITIES.join(', ')}.`, 'severity');
  const site = queryString(query, 'site');
  /** @type {Record<string, unknown>[]} */
  const and = [scope(user), searchFilter(queryString(query, 'q'), SEARCH_FIELDS)];
  if (tab === 'open') and.push({ status: { $ne: 'closed' } });
  if (tab === 'closed') and.push({ status: 'closed' });
  if (severity) and.push({ severity });
  if (site) and.push({ site });
  return { $and: and };
}

/** Tells everyone concerned, returns the API shape. @param {any} i */
async function changed(i) {
  void emitIncidentChanged(i);
  return serializeIncident(i);
}

/** The others on an incident (reporter, assigned person), without `me`. @param {any} i @param {any} me */
const othersOn = (i, me) =>
  [...new Set([i.reportedBy?.id, i.assignedTo?.id].filter(Boolean))].filter((id) => id !== me._id.toString());

// ---------------------------------------------------------------- reads

// GET /api/incidents?tab=open|closed|all&severity=&site=&q=&page=&limit= — paginated; adds `counts`
incidentsRouter.get('/', async (req, res) => {
  const user = currentUser(req);
  const filter = listFilter(req.query, user);
  const lq = parseListQuery(req.query, { sortFields: ['reportedAt', 'occurredAt'], defaultSort: '-reportedAt' });
  const mine = scope(user);
  const [page, open, closed, critical] = await Promise.all([
    paginate(Incident, filter, lq, (d) => serializeIncident(d)),
    Incident.countDocuments({ ...mine, status: { $ne: 'closed' } }),
    Incident.countDocuments({ ...mine, status: 'closed' }),
    Incident.countDocuments({ ...mine, status: { $ne: 'closed' }, severity: { $in: ['critical', 'high'] } }),
  ]);
  res.json({ ...page, counts: { open, closed, critical } });
});

// GET /api/incidents/assignees — people an incident can be given to (have the Incidents module)
incidentsRouter.get('/assignees', requireRole('security', 'admin'), async (_req, res) => {
  const users = await User.find({ active: true, status: { $nin: ['pending', 'deleted'] } })
    .sort({ name: 1 })
    .limit(2000)
    .lean();
  res.json({
    data: users
      .filter((u) => hasModule(/** @type {any} */ (u), 'incidents'))
      .map((u) => ({
        id: u._id.toString(),
        name: u.name,
        role: u.role,
        designation: u.designation ?? '',
        dept: u.dept ?? '',
      })),
  });
});

// GET /api/incidents/export.csv — the incident log (gate users)
incidentsRouter.get('/export.csv', requireGate, async (req, res) => {
  const rows = await Incident.find(listFilter(req.query, currentUser(req)))
    .sort({ reportedAt: -1 })
    .limit(EXPORT_CAP)
    .lean();
  const dt = (/** @type {Date | null | undefined} */ d) => (d ? formatDateTime(d) : '');
  const lines = [
    csvRow([
      'Incident no.',
      'Happened',
      'Reported',
      'Gate / site',
      'Where',
      'Type',
      'Severity',
      'What happened',
      'People involved',
      'Action taken',
      'Reported by',
      'Assigned to',
      'Status',
      'Closed',
      'Closed by',
      'Resolution',
      'Updates',
      'Photos',
    ]),
    ...rows.map((i) =>
      csvRow([
        i.code,
        dt(i.occurredAt),
        dt(i.reportedAt),
        i.site,
        i.location ?? '',
        i.type,
        SEVERITY_LABEL[i.severity],
        i.description,
        i.people ?? '',
        i.actionTaken ?? '',
        i.reportedBy.name,
        i.assignedTo?.name ?? '',
        STATUS_LABEL[i.status],
        dt(i.closedAt),
        i.closedBy?.name ?? '',
        i.resolution ?? '',
        (i.updates ?? []).length,
        (i.photos ?? []).length,
      ]),
    ),
  ];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="incident-log.csv"');
  res.setHeader('Cache-Control', 'no-store');
  res.send(`${String.fromCharCode(0xfeff)}${lines.join('\r\n')}\r\n`);
});

// GET /api/incidents/:id
incidentsRouter.get('/:id', async (req, res) => {
  res.json({ incident: await serializeIncident(await findIncident(String(req.params.id), currentUser(req))) });
});

// ---------------------------------------------------------------- report

/** @param {Record<string, unknown>} body */
const reader = (body) => (/** @type {string} */ k) => {
  const v = Array.isArray(body[k]) ? body[k][0] : body[k];
  return typeof v === 'string' ? v.trim() : '';
};

/**
 * POST /api/incidents — multipart: type*, severity*, description*, site, location, occurredAt, people,
 * actionTaken; files photos (≤ 3). Everyone with the module except viewers.
 */
incidentsRouter.post('/', upload, async (req, res) => {
  const user = currentUser(req);
  refuseViewer(user);
  const files = /** @type {Record<string, Express.Multer.File[]>} */ (req.files ?? {});
  const t = reader(req.body ?? {});
  const settings = await getSettings();

  const type = t('type');
  if (!type || !settings.incidentTypes.includes(type)) throw badRequest('Pick the type of incident.', 'type');
  const severity = t('severity');
  if (!INCIDENT_SEVERITIES.includes(/** @type {any} */ (severity)))
    throw badRequest('Pick how serious it is.', 'severity');
  const description = t('description');
  if (!description) throw badRequest('Describe what happened.', 'description');
  /** @type {[string, number][]} */
  const limits = [
    ['description', 4000],
    ['location', 160],
    ['people', 1000],
    ['actionTaken', 2000],
  ];
  for (const [k, max] of limits) if (t(k).length > max) throw badRequest(`Too long (max ${max} characters).`, k);
  const site = t('site') || settings.sites[0];
  if (!settings.sites.includes(site)) throw badRequest('Choose the gate / site from the list.', 'site');
  const nowMs = Date.now();
  let occurredAt = new Date(nowMs);
  if (t('occurredAt')) {
    occurredAt = new Date(t('occurredAt'));
    if (Number.isNaN(occurredAt.getTime())) throw badRequest('When did it happen? Pick a date and time.', 'occurredAt');
    if (occurredAt.getTime() > nowMs + FUTURE_SLACK_MS) throw badRequest('That time is in the future.', 'occurredAt');
  }

  /** @type {string[]} */
  const photos = [];
  try {
    for (const f of files.photos ?? []) photos.push(await storeImage(f.buffer, COVER_MAX_EDGE, 'photos'));
  } catch (e) {
    await Promise.all(photos.map((r) => deleteImage(r)));
    throw e;
  }

  const doc = {
    site,
    location: t('location'),
    type,
    severity,
    occurredAt,
    reportedAt: new Date(nowMs),
    reportedBy: userRef(user),
    description,
    people: t('people'),
    actionTaken: t('actionTaken'),
    photos,
    source: t('source') === 'patrol' ? 'patrol' : '',
  };
  let incident = null;
  try {
    for (let attempt = 0; attempt < 5 && !incident; attempt++) {
      try {
        incident = await Incident.create({ ...doc, code: generatePassNumber(new Date(nowMs), 'IN') });
      } catch (e) {
        if (/** @type {any} */ (e)?.code !== 11000) throw e;
      }
    }
    if (!incident) throw conflict('Could not number the incident. Try again.');
  } catch (e) {
    await Promise.all(photos.map((r) => deleteImage(r)));
    throw e;
  }
  // The matrix's "at once" steps (supervisors / admins) go out now, not at the next sweep.
  void runMatrix(/** @type {any} */ (`incident_${severity}`)).catch((e) =>
    console.error('[incidents] escalation failed:', e instanceof Error ? e.message : e),
  );
  res.status(201).json({ incident: await changed(incident) });
});

// ---------------------------------------------------------------- follow up

const updateSchema = z.object({
  text: text('Update', 2000).default(''),
  status: z.enum(['open', 'in_progress'], { error: 'Status must be open or in progress.' }).optional(),
  assignTo: z.string({ error: 'Choose the person from the list.' }).trim().optional(),
});

// POST /api/incidents/:id/update { text, status, assignTo }
incidentsRouter.post('/:id/update', async (req, res) => {
  const me = currentUser(req);
  refuseViewer(me);
  const i = await findIncident(String(req.params.id), me);
  const body = updateSchema.parse(req.body ?? {});
  const operator = isOperator(me);
  const assignee = i.assignedTo?.id === me._id.toString();
  if (body.assignTo && !operator) throw forbidden('Only security can give an incident to someone.');
  if (body.status && !operator && !assignee)
    throw forbidden('Only security or the person it is given to can change the status.');
  const status = body.status && body.status !== i.status ? body.status : null;
  let assignTo = null;
  if (body.assignTo && body.assignTo !== i.assignedTo?.id) {
    const u = mongoose.isValidObjectId(body.assignTo)
      ? await User.findOne({ _id: body.assignTo, active: true, status: { $nin: ['pending', 'deleted'] } })
      : null;
    if (!u) throw badRequest('Choose the person from the list.', 'assignTo');
    if (!hasModule(u, 'incidents')) throw badRequest(`${u.name} does not have the Incidents module.`, 'assignTo');
    assignTo = userRef(u);
  }
  if (!body.text && !status && !assignTo)
    throw badRequest('Write an update, change the status or assign someone.', 'text');
  if (i.status === 'closed') throw conflict('This incident is closed. Reopen it first.');

  /** @type {Record<string, unknown>} */
  const set = {};
  if (status) set.status = status;
  if (assignTo) set.assignedTo = assignTo;
  const updated = await Incident.findOneAndUpdate(
    { _id: i._id, status: { $ne: 'closed' } },
    { $set: set, $push: { updates: { at: new Date(), by: userRef(me), text: body.text, status, assignTo } } },
    { returnDocument: 'after' },
  );
  if (!updated) throw conflict('This incident is closed. Reopen it first.');

  const what = `${updated.type} · ${updated.code}`;
  if (assignTo && assignTo.id !== me._id.toString()) {
    void notify([assignTo.id], {
      event: 'incident_assigned',
      title: `⚠️ Incident given to you: ${updated.type}`,
      body: `${SEVERITY_LABEL[updated.severity]} · ${updated.location || updated.site} · ${updated.code}${body.text ? ` · ${body.text}` : ''}`,
      data: data(updated),
    });
  }
  const others = othersOn(updated, me).filter((id) => id !== assignTo?.id);
  if (others.length) {
    const change = [
      status && `now ${STATUS_LABEL[status].toLowerCase()}`,
      assignTo && `given to ${assignTo.name}`,
      body.text,
    ]
      .filter(Boolean)
      .join(' · ');
    void notify(others, {
      event: 'incident_update',
      title: `📝 ${me.name} updated ${what}`,
      body: change,
      data: data(updated),
    });
  }
  res.json({ incident: await changed(updated) });
});

const closeSchema = z.object({ resolution: text('Resolution', 2000).default('') });

// POST /api/incidents/:id/close { resolution } — security, admin or the assigned person
incidentsRouter.post('/:id/close', async (req, res) => {
  const me = currentUser(req);
  refuseViewer(me);
  const i = await findIncident(String(req.params.id), me);
  if (!isOperator(me) && i.assignedTo?.id !== me._id.toString())
    throw forbidden('Only security or the person it is given to can close it.');
  const { resolution } = closeSchema.parse(req.body ?? {});
  if (!resolution) throw badRequest('Write how it was resolved.', 'resolution');
  const at = new Date();
  const updated = await Incident.findOneAndUpdate(
    { _id: i._id, status: { $ne: 'closed' } },
    {
      $set: { status: 'closed', closedAt: at, closedBy: userRef(me), resolution },
      $push: { updates: { at, by: userRef(me), text: resolution, status: 'closed', assignTo: null } },
    },
    { returnDocument: 'after' },
  );
  if (!updated) throw conflict('This incident is already closed.');
  const others = othersOn(updated, me);
  if (others.length) {
    void notify(others, {
      event: 'incident_closed',
      title: `✅ Incident closed: ${updated.type}`,
      body: `${updated.code} · ${resolution}`,
      data: data(updated),
    });
  }
  res.json({ incident: await changed(updated) });
});

// POST /api/incidents/:id/reopen { text } — admin
incidentsRouter.post('/:id/reopen', requireRole('admin'), async (req, res) => {
  const me = currentUser(req);
  const i = await findIncident(String(req.params.id), me);
  const note = text('Note', 2000).default('').parse(req.body?.text);
  const updated = await Incident.findOneAndUpdate(
    { _id: i._id, status: 'closed' },
    {
      $set: { status: 'open', closedAt: null, closedBy: null, resolution: '' },
      $push: { updates: { at: new Date(), by: userRef(me), text: note || 'Reopened', status: 'open', assignTo: null } },
    },
    { returnDocument: 'after' },
  );
  if (!updated) throw conflict('This incident is not closed.');
  const others = othersOn(updated, me);
  if (others.length) {
    void notify(others, {
      event: 'incident_update',
      title: `↩️ ${me.name} reopened ${updated.type} · ${updated.code}`,
      body: note || 'The incident is open again.',
      data: data(updated),
    });
  }
  res.json({ incident: await changed(updated) });
});
