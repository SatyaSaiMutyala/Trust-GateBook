import { url as photoUrl } from './storage.js';

/**
 * @typedef {{ id: string, name: string }} GuardRef
 * @typedef {object} VisitDto  see docs/API.md `Visit`
 */

/**
 * Still inside and inside longer than `overstayHours`.
 * @param {{ outAt?: Date | null, inAt: Date }} v
 * @param {number} overstayHours
 * @param {number} [nowMs]
 */
export function isOverstay(v, overstayHours, nowMs = Date.now()) {
  return !v.outAt && nowMs - v.inAt.getTime() > overstayHours * 3_600_000;
}

/** @param {GuardRef | null | undefined} g @returns {GuardRef | null} */
function guard(g) {
  return g ? { id: g.id, name: g.name } : null;
}

/**
 * Visit → API `Visit` fields without the photo URLs (sync; used as-is by the CSV export).
 * @param {any} v
 * @param {number} overstayHours
 * @param {number} [nowMs]
 * @param {{ photoUrl: string, idPhotoUrl: string | null, agreementUrl?: string | null }} [urls]
 */
export function visitFields(v, overstayHours, nowMs = Date.now(), urls = { photoUrl: '', idPhotoUrl: null }) {
  // Visits from before host approval have no hostStatus: they were let in at check-in.
  const legacy = !v.hostStatus;
  const iso = (/** @type {Date | null | undefined} */ d) => (d ? d.toISOString() : null);
  return {
    id: v.pass,
    pass: v.pass,
    badge: v.badge,
    passReturned: v.outAt ? (v.passReturned ?? null) : null,
    name: v.name,
    phone: v.phone,
    company: v.company ?? '',
    persons: v.persons,
    purpose: v.purpose,
    host: v.host,
    hostId: v.hostId ?? null,
    hostPhone: v.hostPhone ?? '',
    hostLocation: v.hostLocation ?? '',
    hostStatus: legacy ? 'manual' : v.hostStatus,
    hostAt: iso(v.hostAt),
    hostBy: guard(v.hostBy),
    hostVia: v.hostVia ?? null,
    hostNote: v.hostNote ?? '',
    escalatedAt: iso(v.escalatedAt),
    allowedAt: legacy ? v.inAt.toISOString() : iso(v.allowedAt),
    allowedBy: guard(v.allowedBy),
    expectedId: v.expectedId ?? null,
    termsVersion: v.termsVersion ?? null,
    termsAt: iso(v.termsAt),
    agreementUrl: urls.agreementUrl ?? null,
    dept: v.dept ?? '',
    idType: v.idType,
    idLast4: v.idLast4 ?? '',
    vehicle: v.vehicle ?? '',
    items: v.items ?? '',
    notes: v.notes ?? '',
    site: v.site,
    inAt: v.inAt.toISOString(),
    outAt: v.outAt ? v.outAt.toISOString() : null,
    photoUrl: urls.photoUrl,
    idPhotoUrl: urls.idPhotoUrl,
    guardIn: guard(v.guardIn),
    guardOut: guard(v.guardOut),
    exitNote: v.exitNote ?? '',
    overstay: isOverstay(v, overstayHours, nowMs),
  };
}

/**
 * Visit document (or lean object) → API `Visit`, with fresh signed photo URLs (local /api/files or S3 pre-signed).
 * @param {any} v
 * @param {number} overstayHours
 * @param {number} [nowMs]
 */
export async function serializeVisit(v, overstayHours, nowMs = Date.now()) {
  const [p, idp, agr] = await Promise.all([
    photoUrl(v.photo, nowMs),
    v.idPhoto ? photoUrl(v.idPhoto, nowMs) : null,
    v.agreement ? photoUrl(v.agreement, nowMs) : null,
  ]);
  return visitFields(v, overstayHours, nowMs, { photoUrl: p, idPhotoUrl: idp, agreementUrl: agr });
}
