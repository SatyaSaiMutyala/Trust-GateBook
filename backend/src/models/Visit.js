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

const guardSchema = new Schema(
  { id: { type: String, required: true }, name: { type: String, required: true } },
  { _id: false },
);

const visitSchema = new Schema(
  {
    pass: { type: String, required: true, unique: true },
    badge: { type: String, required: true },
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
    idType: { type: String, enum: ID_TYPES, required: true, default: 'Aadhaar' },
    idLast4: { type: String, default: '' },
    vehicle: { type: String, default: '' },
    items: { type: String, default: '' },
    notes: { type: String, default: '' },
    site: { type: String, required: true },
    inAt: { type: Date, required: true },
    outAt: { type: Date, default: null },
    /** Stored file names in UPLOAD_DIR (never exposed directly). */
    photo: { type: String, required: true },
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
// Returning-visitor lookup.
visitSchema.index({ phone10: 1, inAt: -1 });
// Integrity for open visits: one holder per badge per site, one open visit per phone.
// Partial unique indexes catch races that slip past the pre-insert checks.
visitSchema.index(
  { site: 1, badge: 1 },
  { unique: true, name: 'open_badge_per_site', partialFilterExpression: { outAt: { $type: 'null' } } },
);
visitSchema.index(
  { phone10: 1 },
  { unique: true, name: 'open_phone', partialFilterExpression: { outAt: { $type: 'null' } } },
);

export const Visit = model('Visit', visitSchema);
