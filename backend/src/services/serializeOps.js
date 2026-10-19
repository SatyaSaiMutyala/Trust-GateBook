/**
 * API shapes for the key register and incidents.
 */
import { url as fileUrl } from './storage.js';

/** @param {{ id: string, name: string } | null | undefined} r */
const ref = (r) => (r ? { id: r.id, name: r.name } : null);
/** @param {Date | null | undefined} d */
const iso = (d) => (d ? d.toISOString() : null);

/** Key move: open / overdue / returned / returned late. @param {any} m @param {number} [nowMs] */
export function moveState(m, nowMs = Date.now()) {
  if (m.returnedAt) return m.dueAt && m.returnedAt > m.dueAt ? 'returned_late' : 'returned';
  return m.dueAt && m.dueAt.getTime() < nowMs ? 'overdue' : 'out';
}

/** @param {any} m @param {number} [nowMs] */
export function serializeMove(m, nowMs = Date.now()) {
  return {
    id: m._id.toString(),
    key: { id: m.key.id, number: m.key.number, name: m.key.name, location: m.key.location ?? '' },
    site: m.site,
    issuedAt: iso(m.issuedAt),
    issuedBy: ref(m.issuedBy),
    taker: { id: m.taker?.id ?? null, name: m.taker?.name ?? '', phone: m.taker?.phone ?? '' },
    purpose: m.purpose ?? '',
    dueAt: iso(m.dueAt),
    returnedAt: iso(m.returnedAt),
    returnedByName: m.returnedByName ?? '',
    receivedBy: ref(m.receivedBy),
    returnNote: m.returnNote ?? '',
    state: moveState(m, nowMs),
  };
}

/** Key with its open moves (`out`). @param {any} k @param {any[]} openMoves @param {number} [nowMs] */
export function serializeKey(k, openMoves = [], nowMs = Date.now()) {
  return {
    id: k._id.toString(),
    number: k.number,
    name: k.name,
    location: k.location ?? '',
    site: k.site,
    copies: k.copies ?? 1,
    restricted: !!k.restricted,
    authorised: k.authorised ?? '',
    active: k.active !== false,
    out: openMoves.map((m) => serializeMove(m, nowMs)),
  };
}

/** @param {any} i @param {number} [nowMs] */
export async function serializeIncident(i, nowMs = Date.now()) {
  const photoUrls = await Promise.all((i.photos ?? []).map((/** @type {string} */ r) => fileUrl(r, nowMs)));
  return {
    id: i.code,
    code: i.code,
    site: i.site,
    location: i.location ?? '',
    type: i.type,
    severity: i.severity,
    occurredAt: iso(i.occurredAt),
    reportedAt: iso(i.reportedAt),
    reportedBy: ref(i.reportedBy),
    description: i.description,
    people: i.people ?? '',
    actionTaken: i.actionTaken ?? '',
    photoUrls,
    status: i.status,
    assignedTo: ref(i.assignedTo),
    closedAt: iso(i.closedAt),
    closedBy: ref(i.closedBy),
    resolution: i.resolution ?? '',
    source: i.source ?? '',
    updates: (i.updates ?? []).map((/** @type {any} */ u) => ({
      at: iso(u.at),
      by: ref(u.by),
      text: u.text ?? '',
      status: u.status ?? null,
      assignTo: ref(u.assignTo),
    })),
  };
}
