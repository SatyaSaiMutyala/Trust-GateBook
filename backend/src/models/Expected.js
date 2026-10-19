import { Schema, model } from 'mongoose';

/** A pre-registered visitor, or a delivery (boxes only, nobody to check in). */
export const EXPECTED_KINDS = /** @type {const} */ (['visitor', 'delivery']);
/** expected → arrived (checked in / received) or cancelled. "Did not come" is computed, not stored. */
export const EXPECTED_STATUSES = /** @type {const} */ (['expected', 'arrived', 'cancelled']);

const userRefSchema = new Schema(
  { id: { type: String, required: true }, name: { type: String, required: true } },
  { _id: false },
);

const expectedSchema = new Schema(
  {
    /** EX-YYMMDD-XXXX, shown to security and usable as a short reference. */
    code: { type: String, required: true, unique: true },
    kind: { type: String, enum: EXPECTED_KINDS, required: true, default: 'visitor' },
    site: { type: String, required: true },
    /** Visitor name, or the driver / courier name for a delivery (may be empty for a delivery). */
    name: { type: String, default: '' },
    phone: { type: String, default: '' },
    /** Last 10 digits of `phone` ('' when none), for matching at check-in. */
    phone10: { type: String, default: '' },
    /** Visitor's company, or who the delivery is from (supplier / courier). */
    company: { type: String, default: '' },
    purpose: { type: String, default: '' },
    persons: { type: Number, default: 1 },
    /** The employee being visited, or who receives the delivery. */
    host: { type: userRefSchema, required: true },
    /** Who receives them at the gate's location when it isn't the host (e.g. a lab in-charge). */
    contact: { type: userRefSchema, default: null },
    /** Other employees told when the visitor arrives. */
    also: { type: [userRefSchema], default: [] },
    expectedAt: { type: Date, required: true },
    untilAt: { type: Date, default: null },
    vehicle: { type: String, default: '' },
    items: { type: String, default: '' },
    notes: { type: String, default: '' },
    /** Visitor: let in on arrival without asking the host again. */
    preapproved: { type: Boolean, default: false },
    /** Boxes the visitor / delivery is bringing (0 = none), with the challan if known. */
    boxes: { type: Number, default: 0 },
    challanType: { type: String, default: '' },
    challanNo: { type: String, default: '' },
    status: { type: String, enum: EXPECTED_STATUSES, required: true, default: 'expected' },
    createdBy: { type: userRefSchema, required: true },
    arrivedAt: { type: Date, default: null },
    /** Guard who checked the visitor in / received the delivery. */
    arrivedBy: { type: userRefSchema, default: null },
    /** The visit created at check-in (visitors). */
    visitId: { type: String, default: null },
    /** The material gate pass made when it arrived (Material IN). */
    mpId: { type: String, default: null },
    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: userRefSchema, default: null },
  },
  { timestamps: true },
);

// Today / upcoming lists by time.
expectedSchema.index({ site: 1, status: 1, expectedAt: 1 });
expectedSchema.index({ expectedAt: 1 });
// Check-in phone match.
expectedSchema.index({ phone10: 1, status: 1, expectedAt: 1 });
// "Mine": what I registered, am visited by, receive or am told about.
expectedSchema.index({ 'host.id': 1, expectedAt: -1 });
expectedSchema.index({ 'createdBy.id': 1, expectedAt: -1 });
expectedSchema.index({ 'contact.id': 1, expectedAt: -1 });
expectedSchema.index({ 'also.id': 1, expectedAt: -1 });

export const Expected = model('Expected', expectedSchema);
