import { Schema, model } from 'mongoose';

/**
 * Material gate passes (docs/API.md "Material gate passes"): boxes coming in (received by an employee) or going out
 * (sent by an employee, counted and released by security), with the challan photographed. Returnable passes stay
 * open until everything is back.
 */

/** Every status. Open = still has something to do; MP_OPEN = returnable not closed; MP_GATE = work at the gate. */
export const MP_STATUSES = /** @type {const} */ ([
  'awaiting_receipt', // IN: the employee has to tap Received
  'disputed', // IN: the employee says not received
  'received', // IN: done
  'awaiting_approval', // OUT made by security: the employee has to approve
  'ready', // OUT: count and release (with a visitor: at their exit)
  'awaiting_drop', // OUT for pickup: the employee still has to hand the boxes to security
  'ready_for_pickup', // OUT for pickup: at the gate, waiting for the person collecting
  'rejected', // OUT: the employee rejected it
  'cancelled',
  'pending_return', // returnable: out (OUT) or here (IN), to come back / go back
  'partly_returned',
  'returned',
  'done', // non-returnable OUT left / IN received by security
]);
export const MP_OPEN = ['pending_return', 'partly_returned'];
export const MP_GATE = ['awaiting_approval', 'ready', 'awaiting_drop', 'ready_for_pickup'];
/** Statuses a pass can still be cancelled in. */
export const MP_CANCELLABLE = ['awaiting_approval', 'ready', 'awaiting_drop', 'ready_for_pickup', 'awaiting_receipt'];

const refSchema = new Schema(
  { id: { type: String, required: true }, name: { type: String, required: true } },
  { _id: false },
);

const itemSchema = new Schema(
  {
    desc: { type: String, required: true },
    qty: { type: Number, required: true },
    unit: { type: String, default: '' },
    serial: { type: String, default: '' },
  },
  { _id: false },
);

const returnSchema = new Schema(
  {
    at: { type: Date, required: true },
    by: { type: refSchema, required: true },
    lines: { type: [new Schema({ i: Number, qty: Number }, { _id: false })], default: [] },
    note: { type: String, default: '' },
    photo: { type: String, default: null },
  },
  { _id: false },
);

/** Who carries the boxes: a visitor (photo from their check-in) or someone else. */
const carrierSchema = new Schema(
  {
    name: { type: String, default: '' },
    company: { type: String, default: '' },
    phone: { type: String, default: '' },
    vehicle: { type: String, default: '' },
    visitId: { type: String, default: null }, // visit pass code (GB-…)
    visitBadge: { type: String, default: '' },
    photo: { type: String, default: null }, // stored ref (a visitor's check-in photo is shared, never deleted here)
  },
  { _id: false },
);

const materialSchema = new Schema(
  {
    code: { type: String, required: true, unique: true }, // MP-YYMMDD-XXXX, exposed as `id`
    site: { type: String, required: true },
    direction: { type: String, enum: ['in', 'out'], required: true },
    mode: { type: String, enum: ['visitor', 'gate', 'pickup'], required: true },
    boxes: { type: Number, required: true, min: 1 },
    /** items[0] is always the "Boxes" line; returns count against each line. */
    items: { type: [itemSchema], default: [] },
    challanType: { type: String, default: '' },
    refNo: { type: String, default: '' },
    ewaybill: { type: String, default: '' },
    challanPhotos: { type: [String], default: [] },
    photos: { type: [String], default: [] },
    carrier: { type: carrierSchema, default: () => ({}) },
    purpose: { type: String, default: '' },
    remarks: { type: String, default: '' },
    returnable: { type: Boolean, default: false },
    returnDue: { type: Date, default: null },
    status: { type: String, enum: MP_STATUSES, required: true },
    visitId: { type: String, default: null }, // the visit it came / goes with
    expectedId: { type: String, default: null },
    /** The employee: receiving (IN) or sending / approving (OUT). */
    authorisedBy: { type: refSchema, default: null },
    /** Set when an employee made the pass themselves. */
    requestedBy: { type: refSchema, default: null },
    createdBy: { type: refSchema, required: true },
    approvedAt: { type: Date, default: null },
    approvedBy: { type: refSchema, default: null },
    approvalNote: { type: String, default: '' },
    receivedAt: { type: Date, default: null },
    receivedBy: { type: refSchema, default: null },
    receiptNote: { type: String, default: '' },
    receiptVia: { type: String, default: '' }, // app | security
    checkedBoxes: { type: Number, default: null },
    checkedAt: { type: Date, default: null },
    checkedBy: { type: refSchema, default: null },
    droppedAt: { type: Date, default: null },
    droppedBy: { type: refSchema, default: null },
    droppedBoxes: { type: Number, default: null },
    releasedAt: { type: Date, default: null },
    releasedBy: { type: refSchema, default: null },
    /** OUT for pickup: who is expected to collect (the carrier is filled in at hand-over). */
    pickerName: { type: String, default: '' },
    pickerPhone: { type: String, default: '' },
    pickerCompany: { type: String, default: '' },
    returns: { type: [returnSchema], default: [] },
    returnedAt: { type: Date, default: null },
    returnedBy: { type: refSchema, default: null },
    returnNote: { type: String, default: '' },
    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: refSchema, default: null },
  },
  { timestamps: true },
);

materialSchema.index({ site: 1, createdAt: -1 });
materialSchema.index({ status: 1, returnDue: 1 });
materialSchema.index({ visitId: 1 });
materialSchema.index({ 'authorisedBy.id': 1, createdAt: -1 });
materialSchema.index({ 'requestedBy.id': 1, createdAt: -1 });

export const MaterialPass = model('MaterialPass', materialSchema);
