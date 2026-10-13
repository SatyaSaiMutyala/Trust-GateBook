import { signFileUrl } from './signing.js';

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
 * Visit document (or lean object) → API `Visit`, with fresh signed photo URLs.
 * @param {any} v
 * @param {number} overstayHours
 * @param {number} [nowMs]
 */
export function serializeVisit(v, overstayHours, nowMs = Date.now()) {
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
    dept: v.dept ?? '',
    idType: v.idType,
    idLast4: v.idLast4 ?? '',
    vehicle: v.vehicle ?? '',
    items: v.items ?? '',
    notes: v.notes ?? '',
    site: v.site,
    inAt: v.inAt.toISOString(),
    outAt: v.outAt ? v.outAt.toISOString() : null,
    photoUrl: signFileUrl(v.photo, nowMs),
    idPhotoUrl: v.idPhoto ? signFileUrl(v.idPhoto, nowMs) : null,
    guardIn: guard(v.guardIn),
    guardOut: guard(v.guardOut),
    exitNote: v.exitNote ?? '',
    overstay: isOverstay(v, overstayHours, nowMs),
  };
}
