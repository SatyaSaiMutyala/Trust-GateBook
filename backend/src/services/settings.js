import { DEFAULT_SETTINGS, Settings } from '../models/Settings.js';
import { DEFAULT_TERMS } from './termsDefaults.js';
import { DEFAULT_ESC, MATRIX_KEYS, hostReplyMinutesOf, noReplyStepIndex, sortSteps } from './escalationDefs.js';

/** @typedef {import('../models/Settings.js').SettingsDto} SettingsDto */
/** @typedef {import('../models/Settings.js').Company} Company */

const COMPANY_FIELDS = /** @type {const} */ ([
  'name',
  'legalName',
  'address',
  'phone',
  'email',
  'website',
  'gstin',
  'cin',
]);
const RULES = /** @type {const} */ ([
  'expectedPreapproved',
  'visitorPhotoRequired',
  'visitorPassRequired',
  'mailCoverRequired',
  'mailPersonPhotoRequired',
  'mpAuthRequiredOut',
  'mpApprovalInApp',
  'mpChallanPhotoRequired',
  'mpCarrierPhotoRequired',
]);

/** Public logo URL (changes with every upload, so caches never show an old logo). @param {any} doc */
export const logoUrlOf = (doc) => (doc?.logoAt ? `/api/brand/logo?v=${doc.logoAt.getTime()}` : null);

/** @param {any} doc @returns {SettingsDto['esc']} */
function escOf(doc) {
  /** @type {any} */
  const out = {};
  for (const k of MATRIX_KEYS) {
    const saved = doc.esc?.[k];
    out[k] = saved
      ? sortSteps(
          saved.map((/** @type {any} */ s) => ({
            after: s.after,
            to: s.to,
            repeat: s.repeat ?? 0,
            alarm: !!s.alarm,
            label: s.label ?? '',
            ...(s.end ? { end: true } : {}),
          })),
        )
      : structuredClone(DEFAULT_ESC[k]);
  }
  // Saved before the matrix existed: the no-reply step keeps the minutes the admin had chosen.
  if (!doc.esc?.visitor && typeof doc.hostReplyMinutes === 'number') {
    const i = noReplyStepIndex(out.visitor);
    if (i !== -1) out.visitor[i].after = doc.hostReplyMinutes;
  }
  return out;
}

/** Saved terms merged over the defaults. @param {any} doc @returns {SettingsDto['terms']} */
function termsOf(doc) {
  const t = doc.terms ?? {};
  return {
    required: t.required ?? DEFAULT_TERMS.required,
    company: t.company ?? DEFAULT_TERMS.company,
    title: t.title || DEFAULT_TERMS.title,
    body: t.body || DEFAULT_TERMS.body,
    version: t.version ?? DEFAULT_TERMS.version,
  };
}

/** @param {any} doc @returns {SettingsDto} */
function fromDoc(doc) {
  const esc = escOf(doc);
  /** @type {any} */
  const rules = {};
  for (const r of RULES) rules[r] = doc[r] ?? DEFAULT_SETTINGS[r];
  /** @type {any} */
  const company = {};
  for (const f of COMPANY_FIELDS) company[f] = doc.company?.[f] ?? '';
  company.logoUrl = logoUrlOf(doc);
  return {
    sites: [...doc.sites],
    departments: [...doc.departments],
    purposes: [...doc.purposes],
    mailKinds: doc.mailKinds?.length ? [...doc.mailKinds] : [...DEFAULT_SETTINGS.mailKinds],
    designations: doc.designations ? [...doc.designations] : [...DEFAULT_SETTINGS.designations],
    mpUnits: doc.mpUnits?.length ? [...doc.mpUnits] : [...DEFAULT_SETTINGS.mpUnits],
    mpPurposesIn: doc.mpPurposesIn?.length ? [...doc.mpPurposesIn] : [...DEFAULT_SETTINGS.mpPurposesIn],
    mpPurposesOut: doc.mpPurposesOut?.length ? [...doc.mpPurposesOut] : [...DEFAULT_SETTINGS.mpPurposesOut],
    mpChallanIn: doc.mpChallanIn?.length ? [...doc.mpChallanIn] : [...DEFAULT_SETTINGS.mpChallanIn],
    mpChallanOut: doc.mpChallanOut?.length ? [...doc.mpChallanOut] : [...DEFAULT_SETTINGS.mpChallanOut],
    mpReturnDays: doc.mpReturnDays ?? DEFAULT_SETTINGS.mpReturnDays,
    keyReturnHours: doc.keyReturnHours ?? DEFAULT_SETTINGS.keyReturnHours,
    genCheckDays: doc.genCheckDays ?? DEFAULT_SETTINGS.genCheckDays,
    genCheckHour: doc.genCheckHour ?? DEFAULT_SETTINGS.genCheckHour,
    incidentTypes: doc.incidentTypes?.length ? [...doc.incidentTypes] : [...DEFAULT_SETTINGS.incidentTypes],
    overstayHours: doc.overstayHours,
    hostReplyMinutes: hostReplyMinutesOf(esc.visitor) ?? doc.hostReplyMinutes ?? DEFAULT_SETTINGS.hostReplyMinutes,
    ...rules,
    company,
    esc,
    terms: termsOf(doc),
  };
}

/** Reads the singleton settings document, creating it with defaults if missing. @returns {Promise<SettingsDto>} */
export async function getSettings() {
  const { sites, departments, purposes, mailKinds, overstayHours } = DEFAULT_SETTINGS;
  const doc = await Settings.findOneAndUpdate(
    { key: 'global' },
    { $setOnInsert: { key: 'global', sites, departments, purposes, mailKinds, overstayHours } },
    { upsert: true, returnDocument: 'after', lean: true },
  );
  if (!doc) return structuredClone(DEFAULT_SETTINGS);
  return fromDoc(doc);
}

/**
 * Stores settings written before the post room existed with the default `mailKinds`.
 * Idempotent; run at start-up.
 */
export async function migrateSettings() {
  await Settings.updateOne(
    { key: 'global', $or: [{ mailKinds: { $exists: false } }, { mailKinds: { $size: 0 } }] },
    { $set: { mailKinds: DEFAULT_SETTINGS.mailKinds } },
  );
}

/**
 * Saves a complete settings object (the route merges partial input with the current values first).
 * The logo is not part of it (POST/DELETE /api/settings/logo).
 * @param {SettingsDto} s
 * @returns {Promise<SettingsDto>}
 */
export async function saveSettings(s) {
  /** @type {any} */
  const company = {};
  for (const f of COMPANY_FIELDS) company[f] = s.company[f] ?? '';
  /** @type {any} */
  const rules = {};
  for (const r of RULES) rules[r] = s[r];
  await Settings.findOneAndUpdate(
    { key: 'global' },
    {
      $set: {
        sites: s.sites,
        departments: s.departments,
        purposes: s.purposes,
        mailKinds: s.mailKinds,
        designations: s.designations,
        mpUnits: s.mpUnits,
        mpPurposesIn: s.mpPurposesIn,
        mpPurposesOut: s.mpPurposesOut,
        mpChallanIn: s.mpChallanIn,
        mpChallanOut: s.mpChallanOut,
        mpReturnDays: s.mpReturnDays,
        keyReturnHours: s.keyReturnHours,
        genCheckDays: s.genCheckDays,
        genCheckHour: s.genCheckHour,
        incidentTypes: s.incidentTypes,
        overstayHours: s.overstayHours,
        hostReplyMinutes: hostReplyMinutesOf(s.esc.visitor) ?? s.hostReplyMinutes,
        ...rules,
        company,
        esc: Object.fromEntries(MATRIX_KEYS.map((k) => [k, sortSteps(s.esc[k])])),
        terms: termsOf({ terms: s.terms }),
      },
    },
    { upsert: true },
  );
  return getSettings();
}

/**
 * Stores (or with `null` removes) the logo.
 * @param {{ data: Buffer, type: string } | null} logo
 * @returns {Promise<SettingsDto>}
 */
export async function saveLogo(logo) {
  await getSettings(); // make sure the document exists
  await Settings.updateOne(
    { key: 'global' },
    logo
      ? { $set: { logo: logo.data, logoType: logo.type, logoAt: new Date() } }
      : { $unset: { logo: 1, logoType: 1, logoAt: 1 } },
  );
  return getSettings();
}

/** Logo bytes for GET /api/brand/logo, or null. */
export async function readLogo() {
  const doc = await Settings.findOne({ key: 'global' }, { logo: 1, logoType: 1, logoAt: 1 }).select('+logo').lean();
  if (!doc?.logo || !doc.logoType) return null;
  return { data: Buffer.from(/** @type {any} */ (doc.logo).buffer ?? doc.logo), type: doc.logoType, at: doc.logoAt };
}
