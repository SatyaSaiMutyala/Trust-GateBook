import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { badRequest } from '../middleware/error.js';
import { emitSettingsUpdated } from '../realtime.js';
import { escSchema, noReplyStepIndex } from '../services/escalationDefs.js';
import { getSettings, readLogo, saveLogo, saveSettings } from '../services/settings.js';
import { publishTermsVersion } from '../services/terms.js';

/** A non-empty list of unique (case-insensitive), trimmed, non-empty strings. @param {string} label */
function list(label) {
  return z
    .array(
      z
        .string({ error: `${label} must be text.` })
        .trim()
        .min(1, `${label} cannot be empty.`)
        .max(80, `${label} is too long.`),
      { error: `${label} must be a list.` },
    )
    .min(1, 'Keep at least one.')
    .max(100, 'Too many entries.')
    .superRefine((items, ctx) => {
      const seen = new Set();
      for (const item of items) {
        const key = item.toLowerCase();
        if (seen.has(key)) {
          ctx.addIssue({ code: 'custom', message: `"${item}" is listed twice.` });
          return;
        }
        seen.add(key);
      }
    });
}

const HOURS_MSG = 'Overstay hours must be a whole number from 1 to 24.';
const REPLY_MSG = 'Host reply time must be a whole number of minutes from 1 to 60.';
const RETURN_MSG = 'Return period must be a whole number of days from 1 to 365.';
const KEY_HOURS_MSG = 'Key return time must be a whole number of hours from 0 to 720.';
const CHECK_DAYS_MSG = 'Check the diesel level every 1 to 60 days.';
const CHECK_HOUR_MSG = 'The check hour must be from 0 to 23.';
const bool = (/** @type {string} */ k) => z.boolean({ error: `${k} must be true or false.` }).optional();
const field = (/** @type {string} */ label, /** @type {number} */ max) =>
  z
    .string({ error: `${label} must be text.` })
    .trim()
    .max(max, `${label} is too long (max ${max}).`)
    .optional();

const companySchema = z
  .object({
    name: field('Short name', 60),
    legalName: field('Registered name', 160),
    address: field('Address', 400),
    phone: field('Phone', 40),
    email: field('Email', 120),
    website: field('Website', 160),
    gstin: field('GSTIN', 20),
    cin: field('CIN', 30),
    logoUrl: z.unknown().optional(), // ignored: the logo has its own endpoint
  })
  .strict();

// Everything except the original lists is optional so older clients can still save; omitted = keep the current value.
const settingsSchema = z.object({
  sites: list('Gate name'),
  departments: list('Department'),
  purposes: list('Purpose'),
  mailKinds: list('Type of post').optional(),
  designations: list('Designation').optional(),
  mpUnits: list('Unit').optional(),
  mpPurposesIn: list('Purpose').optional(),
  mpPurposesOut: list('Purpose').optional(),
  mpChallanIn: list('Challan type').optional(),
  mpChallanOut: list('Challan type').optional(),
  mpReturnDays: z.number({ error: RETURN_MSG }).int(RETURN_MSG).min(1, RETURN_MSG).max(365, RETURN_MSG).optional(),
  keyReturnHours: z.number({ error: KEY_HOURS_MSG }).int(KEY_HOURS_MSG).min(0, KEY_HOURS_MSG).max(720, KEY_HOURS_MSG).optional(),
  incidentTypes: list('Incident type').optional(),
  genCheckDays: z.number({ error: CHECK_DAYS_MSG }).int(CHECK_DAYS_MSG).min(1, CHECK_DAYS_MSG).max(60, CHECK_DAYS_MSG).optional(),
  genCheckHour: z.number({ error: CHECK_HOUR_MSG }).int(CHECK_HOUR_MSG).min(0, CHECK_HOUR_MSG).max(23, CHECK_HOUR_MSG).optional(),
  overstayHours: z.number({ error: HOURS_MSG }).int(HOURS_MSG).min(1, HOURS_MSG).max(24, HOURS_MSG),
  hostReplyMinutes: z.number({ error: REPLY_MSG }).int(REPLY_MSG).min(1, REPLY_MSG).max(60, REPLY_MSG).optional(),
  expectedPreapproved: bool('expectedPreapproved'),
  visitorPhotoRequired: bool('visitorPhotoRequired'),
  visitorPassRequired: bool('visitorPassRequired'),
  mailCoverRequired: bool('mailCoverRequired'),
  mailPersonPhotoRequired: bool('mailPersonPhotoRequired'),
  mpAuthRequiredOut: bool('mpAuthRequiredOut'),
  mpApprovalInApp: bool('mpApprovalInApp'),
  mpChallanPhotoRequired: bool('mpChallanPhotoRequired'),
  mpCarrierPhotoRequired: bool('mpCarrierPhotoRequired'),
  company: companySchema.optional(),
  esc: escSchema.optional(),
  terms: z
    .object({
      required: bool('terms.required'),
      company: field('Company name on the agreement', 160),
      title: z.string({ error: 'Title must be text.' }).trim().min(1, 'Enter a title.').max(160, 'Title is too long (max 160).').optional(),
      body: z.string({ error: 'Terms text must be text.' }).trim().min(1, 'Enter the terms text.').max(20000, 'Terms text is too long.').optional(),
      version: z.unknown().optional(), // set by the server
    })
    .optional(),
});

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

settingsRouter.get('/', async (_req, res) => {
  res.json({ settings: await getSettings() });
});

settingsRouter.put('/', requireRole('admin'), async (req, res) => {
  const body = settingsSchema.parse(req.body ?? {});
  const current = await getSettings();
  const esc = { ...current.esc, ...Object.fromEntries(Object.entries(body.esc ?? {}).filter(([, v]) => v)) };
  // Clients with only the "Host reply time" number (they send the whole settings back, matrix unchanged):
  // a new value moves the first visitor step to guards. An edited visitor matrix wins.
  const visitorEdited = !!body.esc?.visitor && JSON.stringify(body.esc.visitor) !== JSON.stringify(current.esc.visitor);
  if (body.hostReplyMinutes !== undefined && body.hostReplyMinutes !== current.hostReplyMinutes && !visitorEdited) {
    const i = noReplyStepIndex(esc.visitor);
    if (i !== -1) esc.visitor = esc.visitor.map((s, j) => (j === i ? { ...s, after: body.hostReplyMinutes } : s));
  }
  /** @type {any} */
  const merged = { ...current };
  for (const [k, v] of Object.entries(body)) if (v !== undefined && k !== 'company' && k !== 'esc') merged[k] = v;
  merged.company = {
    ...current.company,
    ...Object.fromEntries(Object.entries(body.company ?? {}).filter(([k, v]) => v !== undefined && k !== 'logoUrl')),
  };
  merged.esc = esc;
  // Terms: a new version whenever the wording (company, title, body) changes; `required` alone keeps it.
  const t = { ...current.terms };
  for (const k of /** @type {const} */ (['required', 'company', 'title', 'body'])) {
    if (body.terms?.[k] !== undefined) /** @type {any} */ (t)[k] = body.terms[k];
  }
  const reworded = t.company !== current.terms.company || t.title !== current.terms.title || t.body !== current.terms.body;
  if (reworded) {
    t.version = current.terms.version + 1;
    await publishTermsVersion(t);
  }
  merged.terms = t;
  const settings = await saveSettings(merged);
  emitSettingsUpdated(settings);
  res.json({ settings });
});

// ---------------------------------------------------------------- logo

const LOGO_MAX_BYTES = 1.5 * 1024 * 1024;
const logoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: LOGO_MAX_BYTES, files: 1 } }).single(
  'logo',
);

// POST /api/settings/logo (multipart `logo`: PNG or JPEG, under 1.5 MB) → { settings }
settingsRouter.post(
  '/logo',
  requireRole('admin'),
  (req, res, next) => {
    logoUpload(req, res, (err) => {
      if (err)
        return next(
          badRequest(
            err.code === 'LIMIT_FILE_SIZE' ? 'Logo must be under 1.5 MB.' : 'Upload a PNG or JPEG image.',
            'logo',
          ),
        );
      next();
    });
  },
  async (req, res) => {
    const file = /** @type {any} */ (req).file;
    if (!file || !['image/png', 'image/jpeg'].includes(file.mimetype))
      throw badRequest('Upload a PNG or JPEG image.', 'logo');
    let data;
    const png = file.mimetype === 'image/png';
    try {
      const img = sharp(file.buffer, { failOn: 'error' })
        .rotate()
        .resize({ width: 800, height: 400, fit: 'inside', withoutEnlargement: true });
      data = await (png ? img.png({ compressionLevel: 9 }) : img.jpeg({ quality: 85 })).toBuffer();
    } catch {
      throw badRequest('That image could not be read. Upload a PNG or JPEG image.', 'logo');
    }
    const settings = await saveLogo({ data, type: png ? 'image/png' : 'image/jpeg' });
    emitSettingsUpdated(settings);
    res.json({ settings });
  },
);

// DELETE /api/settings/logo → { settings }
settingsRouter.delete('/logo', requireRole('admin'), async (_req, res) => {
  const settings = await saveLogo(null);
  emitSettingsUpdated(settings);
  res.json({ settings });
});

// ---------------------------------------------------------------- public brand (login screen, before sign-in)

export const brandRouter = Router();

// GET /api/brand → { name, logoUrl }
brandRouter.get('/', async (_req, res) => {
  const { company } = await getSettings();
  res.json({ name: company.name, logoUrl: company.logoUrl });
});

// GET /api/brand/logo — the logo image (public; the URL changes with every upload)
brandRouter.get('/logo', async (_req, res) => {
  const logo = await readLogo();
  if (!logo) {
    res.status(404).json({ error: { code: 'not_found', message: 'No logo.' } });
    return;
  }
  res.setHeader('Content-Type', logo.type);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(logo.data);
});
