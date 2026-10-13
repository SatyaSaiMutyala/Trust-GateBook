import { Schema, model } from 'mongoose';

/**
 * lodged    at the gate, waiting to be collected
 * handed    handed over, waiting for the receiver (a Gatebook user) to confirm
 * closed    handed over to a receiver who is not on Gatebook (no confirmation step)
 * confirmed receiver confirmed collection
 * disputed  receiver says they did not get it (an issue for security)
 * resolved  security wrote what was found/done
 * @typedef {'lodged' | 'handed' | 'closed' | 'confirmed' | 'disputed' | 'resolved'} MailStatus
 */
export const MAIL_STATUSES = /** @type {const} */ (['lodged', 'handed', 'closed', 'confirmed', 'disputed', 'resolved']);

/** Labels used in the CSV (and by the clients' status chips). */
export const MAIL_STATUS_LABELS = {
  lodged: 'To collect',
  handed: 'Handed · awaiting confirmation',
  closed: 'Handed over',
  confirmed: 'Collected · confirmed',
  disputed: 'Receiver disputes',
  resolved: 'Resolved',
};

const guardSchema = new Schema(
  { id: { type: String, required: true }, name: { type: String, required: true } },
  { _id: false },
);

/** Snapshot of the recipient user at the time the item was logged. */
const recipientSchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    phone: { type: String, default: '' },
    location: { type: String, default: '' },
  },
  { _id: false },
);

const mailSchema = new Schema(
  {
    /** ML-YYMMDD-XXXX, exposed as `id`. */
    code: { type: String, required: true, unique: true },
    kind: { type: String, required: true },
    refNo: { type: String, default: '' },
    sender: { type: String, required: true },
    carrier: { type: String, default: '' },
    broughtBy: { type: String, required: true },
    broughtPhone: { type: String, default: '' },
    recipient: { type: recipientSchema, default: null },
    recipientName: { type: String, required: true },
    dept: { type: String, default: '' },
    pieces: { type: Number, required: true, default: 1 },
    notes: { type: String, default: '' },
    site: { type: String, required: true },
    receivedAt: { type: Date, required: true },
    receivedBy: { type: guardSchema, required: true },
    /** Stored file names in UPLOAD_DIR. */
    cover: { type: String, required: true },
    person: { type: String, required: true },
    status: { type: String, enum: MAIL_STATUSES, required: true, default: 'lodged' },
    notifiedAt: { type: Date, default: null },
    remindedAt: { type: Date, default: null },
    handedAt: { type: Date, default: null },
    handedBy: { type: guardSchema, default: null },
    collectedBy: { type: String, default: '' },
    handedNote: { type: String, default: '' },
    confirmedAt: { type: Date, default: null },
    disputeNote: { type: String, default: '' },
    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: guardSchema, default: null },
    resolveNote: { type: String, default: '' },
  },
  { timestamps: true },
);

// Gate tabs (To collect / Awaiting / Issues) and the per-status counts.
mailSchema.index({ status: 1, site: 1, receivedAt: -1 });
// "All items" by period.
mailSchema.index({ site: 1, receivedAt: -1 });
mailSchema.index({ receivedAt: -1 });
// "My post": only items that have a Gatebook recipient.
mailSchema.index(
  { 'recipient.id': 1, status: 1, receivedAt: -1 },
  { name: 'recipient_status', partialFilterExpression: { 'recipient.id': { $exists: true } } },
);

export const MailItem = model('MailItem', mailSchema);
