import { Schema, model } from 'mongoose';

/** Patrols (docs/API.md "Patrols"): checkpoints with a QR code, rounds with start times, and every scan. */
const refSchema = new Schema(
  { id: { type: String, required: true }, name: { type: String, required: true } },
  { _id: false },
);

const checkpointSchema = new Schema(
  {
    site: { type: String, required: true },
    name: { type: String, required: true },
    location: { type: String, default: '' },
    /** 6 characters printed under the QR (A-Z, 0-9). The QR holds `<web>/?cp=<code>`. */
    code: { type: String, required: true, unique: true },
    photoRequired: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
    sort: { type: Number, default: 0 },
  },
  { timestamps: true },
);
export const Checkpoint = model('Checkpoint', checkpointSchema);

const roundSchema = new Schema(
  {
    site: { type: String, required: true },
    name: { type: String, required: true },
    /** "HH:MM" start times, display time zone. */
    times: { type: [String], default: [] },
    /** Minutes to finish after the start time; after that it is missed / partly missed. */
    windowMin: { type: Number, default: 45, min: 10, max: 240 },
    /** Started within this many minutes = on time. */
    onTimeMin: { type: Number, default: 10, min: 0, max: 120 },
    checkpointIds: { type: [String], default: [] },
    active: { type: Boolean, default: true },
    /** When the schedule last changed: earlier slots are not judged. */
    activeFrom: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
);
export const PatrolRound = model('PatrolRound', roundSchema);

const scanSchema = new Schema(
  {
    checkpointId: { type: String, required: true },
    checkpoint: { type: new Schema({ name: String, location: String }, { _id: false }), required: true },
    site: { type: String, required: true },
    by: { type: refSchema, required: true },
    at: { type: Date, required: true },
    status: { type: String, enum: ['ok', 'issue'], default: 'ok' },
    note: { type: String, default: '' },
    photo: { type: String, default: '' },
    /** The 6-letter code was typed instead of scanned. */
    manual: { type: Boolean, default: false },
    /** The round slot it counted towards (null = extra scan). */
    roundId: { type: String, default: null },
    slotAt: { type: Date, default: null },
  },
  { timestamps: true },
);
scanSchema.index({ at: -1 });
scanSchema.index({ roundId: 1, slotAt: 1 });
export const PatrolScan = model('PatrolScan', scanSchema);
