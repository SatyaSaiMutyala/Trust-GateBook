import { Schema, model } from 'mongoose';

export const ID_TYPES = /** @type {const} */ ([
  'Aadhaar',
  'Driving licence',
  'PAN',
  'Voter ID',
  'Company ID',
  'Passport',
  'Other',
  'None',
]);

/**
 * Host approval (docs/API.md "Host approval"):
 * - waiting   the host is a Gatebook user and has been asked to accept or decline
 * - accepted  the host accepted (in the app, by phone, or pre-approved)
 * - declined  the host declined
 * - manual    the host is not on Gatebook (typed name): security confirms by phone
 */
export const HOST_STATUSES = /** @type {const} */ (['waiting', 'accepted', 'declined', 'manual']);
/** How the host's answer was recorded: in the app, by phone (security), or pre-approved when the visit was registered. */
export const HOST_VIA = /** @type {const} */ (['app', 'phone', 'preapproved']);

const guardSchema = new Schema(
  { id: { type: String, required: true }, name: { type: String, required: true } },
  { _id: false },
);

const visitSchema = new Schema(
  {
    pass: { type: String, required: true, unique: true },
    /** Pass card number; '' when the rule "Pass number is required" is off and none was given. */
    badge: { type: String, default: '' },
    passReturned: { type: Boolean, default: null },
    name: { type: String, required: true },
    phone: { type: String, required: true },
    /** Last 10 digits of `phone`, used for matching. */
    phone10: { type: String, required: true },
    company: { type: String, default: '' },
    persons: { type: Number, required: true, default: 1 },
    purpose: { type: String, required: true },
    host: { type: String, required: true },
    dept: { type: String, default: '' },
    // Host approval. Visits stored before it existed lack these; serializeVisit treats them as manual + allowed in.
    /** Gatebook user being visited (null when the host was typed). */
    hostId: { type: String, default: null },
    /** Host's phone / "where visitors go" at check-in time, for the guard. */
    hostPhone: { type: String, default: '' },
    hostLocation: { type: String, default: '' },
    hostStatus: { type: String, enum: HOST_STATUSES },
    hostAt: { type: Date, default: null },
    hostBy: { type: guardSchema, default: null },
    hostVia: { type: String, enum: [...HOST_VIA, null], default: null },
    hostNote: { type: String, default: '' },
    /** When security was alerted that the host had not replied. */
    escalatedAt: { type: Date, default: null },
    /** Terms & confidentiality agreement: the version accepted at check-in, when, and the stored PDF (ref). */
    termsVersion: { type: Number, default: null },
    termsAt: { type: Date, default: null },
    agreement: { type: String, default: null },
    /** When security let the visitor in. */
    allowedAt: { type: Date, default: null },
    allowedBy: { type: guardSchema, default: null },
    /** The pre-registration (Expected code) this visit was checked in from, if any. */
    expectedId: { type: String, default: null },
    idType: { type: String, enum: ID_TYPES, required: true, default: 'Aadhaar' },
    idLast4: { type: String, default: '' },
    vehicle: { type: String, default: '' },
    items: { type: String, default: '' },
    notes: { type: String, default: '' },
    site: { type: String, required: true },
    inAt: { type: Date, required: true },
    outAt: { type: Date, default: null },
    /** Stored file names in UPLOAD_DIR (never exposed directly). */
    /** Stored photo ref; '' when the rule "Visitor photo is required" is off and none was taken. */
    photo: { type: String, default: '' },
    idPhoto: { type: String, default: null },
    guardIn: { type: guardSchema, default: null },
    guardOut: { type: guardSchema, default: null },
    exitNote: { type: String, default: '' },
  },
  { timestamps: true },
);

// Log listing / date ranges.
visitSchema.index({ inAt: -1 });
visitSchema.index({ site: 1, inAt: -1 });
// Open visits ("inside now") by site.
visitSchema.index({ outAt: 1, site: 1, inAt: 1 });
// A host's own visitors (GET /api/visits/mine).
visitSchema.index({ hostId: 1, inAt: -1 });
// No-reply sweep: open visits still waiting for the host and not yet escalated.
visitSchema.index({ outAt: 1, hostStatus: 1, escalatedAt: 1, inAt: 1 });
// Returning-visitor lookup.
visitSchema.index({ phone10: 1, inAt: -1 });
// Integrity for open visits: one holder per badge per site, one open visit per phone.
// Partial unique indexes catch races that slip past the pre-insert checks.
visitSchema.index(
  { site: 1, badge: 1 },
  // v2: visits without a pass (rule "Pass number is required" off) store '' and are not covered.
  { unique: true, name: 'open_badge_per_site_v2', partialFilterExpression: { outAt: { $type: 'null' }, badge: { $gt: '' } } },
);
visitSchema.index(
  { phone10: 1 },
  { unique: true, name: 'open_phone', partialFilterExpression: { outAt: { $type: 'null' } } },
);

export const Visit = model('Visit', visitSchema);
