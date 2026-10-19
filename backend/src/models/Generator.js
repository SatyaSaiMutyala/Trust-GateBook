import { Schema, model } from 'mongoose';

/** Generator & diesel (docs/API.md "Generator & diesel"): generators, every run, and diesel fills / level checks. */
const refSchema = new Schema(
  { id: { type: String, required: true }, name: { type: String, required: true } },
  { _id: false },
);

const generatorSchema = new Schema(
  {
    name: { type: String, required: true },
    site: { type: String, required: true },
    kva: { type: String, default: '' },
    tankL: { type: Number, required: true, min: 1 },
    /** Rated diesel use at the usual load, for the estimate between readings. */
    rateLph: { type: Number, default: 0, min: 0 },
    /** Low diesel alert below this % of the tank. */
    lowPct: { type: Number, default: 30, min: 5, max: 90 },
    active: { type: Boolean, default: true },
    /** Set by the escalation sweep when the estimate first fell below `lowPct`; cleared when it is back up. */
    lowSince: { type: Date, default: null },
  },
  { timestamps: true },
);
export const Generator = model('Generator', generatorSchema);

const runSchema = new Schema(
  {
    genId: { type: String, required: true },
    site: { type: String, required: true },
    startAt: { type: Date, required: true },
    stopAt: { type: Date, default: null },
    reason: { type: String, default: 'Power cut' },
    hmStart: { type: Number, default: null },
    hmEnd: { type: Number, default: null },
    startedBy: { type: refSchema, required: true },
    stoppedBy: { type: refSchema, default: null },
    note: { type: String, default: '' },
  },
  { timestamps: true },
);
runSchema.index({ genId: 1, startAt: -1 });
// One open run per generator.
runSchema.index({ genId: 1 }, { unique: true, partialFilterExpression: { stopAt: null }, name: 'one_open_run' });
export const GenRun = model('GenRun', runSchema);

const fuelSchema = new Schema(
  {
    genId: { type: String, required: true },
    site: { type: String, required: true },
    at: { type: Date, required: true },
    kind: { type: String, enum: ['fill', 'check'], required: true },
    litres: { type: Number, default: null },
    /** Level reading (check), or "level after filling" (fill, optional). */
    levelL: { type: Number, default: null },
    hm: { type: Number, default: null },
    vendor: { type: String, default: '' },
    billNo: { type: String, default: '' },
    amount: { type: Number, default: null },
    photo: { type: String, default: '' },
    by: { type: refSchema, required: true },
    note: { type: String, default: '' },
  },
  { timestamps: true },
);
fuelSchema.index({ genId: 1, at: -1 });
export const FuelEntry = model('FuelEntry', fuelSchema);
