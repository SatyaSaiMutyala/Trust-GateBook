import { isoDay } from './format.js';

const HOUR_MS = 3_600_000;

/** @param {{ id: string, name: string } | null | undefined} r */
const ref = (r) => (r ? { id: r.id, name: r.name } : null);
/** @param {Date | null | undefined} d */
const iso = (d) => (d ? d.toISOString() : null);

/**
 * Where a pre-registration stands, for the chip:
 * expected (on time) · late (past its window today) · missed (an earlier day, never came) · arrived · cancelled.
 * The window is `untilAt`, or 2 hours after `expectedAt`.
 * @param {any} e
 * @param {number} nowMs
 */
export function expectedState(e, nowMs) {
  if (e.status !== 'expected') return e.status;
  const end = e.untilAt ? e.untilAt.getTime() : e.expectedAt.getTime() + 2 * HOUR_MS;
  if (nowMs <= end) return 'expected';
  return isoDay(e.expectedAt) < isoDay(new Date(nowMs)) ? 'missed' : 'late';
}

/**
 * Expected document → API `Expected` (docs/API.md "Expected visitors and deliveries").
 * @param {any} e
 * @param {number} [nowMs]
 */
export function serializeExpected(e, nowMs = Date.now()) {
  return {
    id: e.code,
    code: e.code,
    kind: e.kind,
    site: e.site,
    name: e.name ?? '',
    phone: e.phone ?? '',
    company: e.company ?? '',
    purpose: e.purpose ?? '',
    persons: e.persons ?? 1,
    host: ref(e.host),
    contact: ref(e.contact),
    also: (e.also ?? []).map(ref),
    expectedAt: e.expectedAt.toISOString(),
    untilAt: iso(e.untilAt),
    vehicle: e.vehicle ?? '',
    items: e.items ?? '',
    notes: e.notes ?? '',
    preapproved: !!e.preapproved,
    boxes: e.boxes ?? 0,
    challanType: e.challanType ?? '',
    challanNo: e.challanNo ?? '',
    status: e.status,
    state: expectedState(e, nowMs),
    createdBy: ref(e.createdBy),
    createdAt: iso(e.createdAt),
    arrivedAt: iso(e.arrivedAt),
    arrivedBy: ref(e.arrivedBy),
    visitId: e.visitId ?? null,
    mpId: e.mpId ?? null,
    cancelledAt: iso(e.cancelledAt),
    cancelledBy: ref(e.cancelledBy),
  };
}
