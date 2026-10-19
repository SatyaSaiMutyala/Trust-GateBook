import { MP_OPEN } from '../models/MaterialPass.js';
import { url as fileUrl } from './storage.js';

/** @param {{ id: string, name: string } | null | undefined} r */
const ref = (r) => (r ? { id: r.id, name: r.name } : null);
/** @param {Date | null | undefined} d */
const iso = (d) => (d ? d.toISOString() : null);

/** Quantity of item line `i` not yet returned. @param {any} m @param {number} i */
export function outstanding(m, i) {
  const back = (m.returns ?? []).reduce(
    (/** @type {number} */ n, /** @type {any} */ r) =>
      n +
      (r.lines ?? [])
        .filter((/** @type {any} */ l) => l.i === i)
        .reduce((/** @type {number} */ a, /** @type {any} */ l) => a + l.qty, 0),
    0,
  );
  return Math.max(0, (m.items?.[i]?.qty ?? 0) - back);
}

/** Returnable and past its return date. @param {any} m @param {number} [nowMs] */
export const isOverdue = (m, nowMs = Date.now()) =>
  MP_OPEN.includes(m.status) && !!m.returnDue && m.returnDue.getTime() < nowMs;

/**
 * MaterialPass document → API `MaterialPass`, with fresh signed photo URLs.
 * @param {any} m
 * @param {number} [nowMs]
 */
export async function serializeMaterial(m, nowMs = Date.now()) {
  const sign = (/** @type {string | null | undefined} */ r) => (r ? fileUrl(r, nowMs) : Promise.resolve(null));
  const [challanPhotoUrls, photoUrls, carrierPhotoUrl, returnPhotoUrls] = await Promise.all([
    Promise.all((m.challanPhotos ?? []).map(sign)),
    Promise.all((m.photos ?? []).map(sign)),
    sign(m.carrier?.photo),
    Promise.all((m.returns ?? []).map((/** @type {any} */ r) => sign(r.photo))),
  ]);
  const c = m.carrier ?? {};
  return {
    id: m.code,
    code: m.code,
    site: m.site,
    direction: m.direction,
    mode: m.mode,
    boxes: m.boxes,
    items: (m.items ?? []).map((/** @type {any} */ it, /** @type {number} */ i) => ({
      desc: it.desc,
      qty: it.qty,
      unit: it.unit ?? '',
      serial: it.serial ?? '',
      outstanding: outstanding(m, i),
    })),
    challanType: m.challanType ?? '',
    refNo: m.refNo ?? '',
    ewaybill: m.ewaybill ?? '',
    challanPhotoUrls,
    photoUrls,
    carrier: {
      name: c.name ?? '',
      company: c.company ?? '',
      phone: c.phone ?? '',
      vehicle: c.vehicle ?? '',
      visitId: c.visitId ?? null,
      visitBadge: c.visitBadge ?? '',
      photoUrl: carrierPhotoUrl,
    },
    purpose: m.purpose ?? '',
    remarks: m.remarks ?? '',
    returnable: !!m.returnable,
    returnDue: iso(m.returnDue),
    overdue: isOverdue(m, nowMs),
    status: m.status,
    visitId: m.visitId ?? null,
    expectedId: m.expectedId ?? null,
    authorisedBy: ref(m.authorisedBy),
    requestedBy: ref(m.requestedBy),
    createdBy: ref(m.createdBy),
    createdAt: iso(m.createdAt),
    approvedAt: iso(m.approvedAt),
    approvedBy: ref(m.approvedBy),
    approvalNote: m.approvalNote ?? '',
    receivedAt: iso(m.receivedAt),
    receivedBy: ref(m.receivedBy),
    receiptNote: m.receiptNote ?? '',
    receiptVia: m.receiptVia ?? '',
    checkedBoxes: m.checkedBoxes ?? null,
    checkedAt: iso(m.checkedAt),
    checkedBy: ref(m.checkedBy),
    droppedAt: iso(m.droppedAt),
    droppedBy: ref(m.droppedBy),
    droppedBoxes: m.droppedBoxes ?? null,
    releasedAt: iso(m.releasedAt),
    releasedBy: ref(m.releasedBy),
    pickerName: m.pickerName ?? '',
    pickerPhone: m.pickerPhone ?? '',
    pickerCompany: m.pickerCompany ?? '',
    returns: (m.returns ?? []).map((/** @type {any} */ r, /** @type {number} */ k) => ({
      at: iso(r.at),
      by: ref(r.by),
      lines: (r.lines ?? []).map((/** @type {any} */ l) => ({ i: l.i, qty: l.qty })),
      note: r.note ?? '',
      photoUrl: returnPhotoUrls[k],
    })),
    returnedAt: iso(m.returnedAt),
    returnedBy: ref(m.returnedBy),
    returnNote: m.returnNote ?? '',
    cancelledAt: iso(m.cancelledAt),
    cancelledBy: ref(m.cancelledBy),
  };
}
