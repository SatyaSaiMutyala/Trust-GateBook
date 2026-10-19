import { Schema, model } from 'mongoose';

/**
 * Key register (docs/API.md "Key register"): the keys kept at a gate desk, and every issue / return ("key diary").
 */
const refSchema = new Schema(
  { id: { type: String, required: true }, name: { type: String, required: true } },
  { _id: false },
);

const keySchema = new Schema(
  {
    /** Number on the tag, upper-case, unique per site (e.g. K-007). */
    number: { type: String, required: true },
    /** What it opens. */
    name: { type: String, required: true },
    location: { type: String, default: '' },
    site: { type: String, required: true },
    copies: { type: Number, default: 1, min: 1, max: 20 },
    restricted: { type: Boolean, default: false },
    /** Who may take a restricted key (shown to the guard when issuing). */
    authorised: { type: String, default: '' },
    active: { type: Boolean, default: true },
    /** Copies out now (kept with the moves, so issuing the last copy is atomic). */
    outCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);
keySchema.index({ site: 1, number: 1 }, { unique: true });

export const Key = model('Key', keySchema);

/** One issue of a key and its return. Open = not returned. */
const moveSchema = new Schema(
  {
    key: {
      type: new Schema({ id: String, number: String, name: String, location: String }, { _id: false }),
      required: true,
    },
    site: { type: String, required: true },
    issuedAt: { type: Date, required: true },
    issuedBy: { type: refSchema, required: true },
    /** The person taking it: a Gatebook user (`id`) or anyone else (electrician, vendor). */
    taker: {
      type: new Schema(
        { id: { type: String, default: null }, name: String, phone: { type: String, default: '' } },
        { _id: false },
      ),
      required: true,
    },
    purpose: { type: String, default: '' },
    dueAt: { type: Date, default: null },
    returnedAt: { type: Date, default: null },
    returnedByName: { type: String, default: '' },
    receivedBy: { type: refSchema, default: null },
    returnNote: { type: String, default: '' },
  },
  { timestamps: true },
);
moveSchema.index({ 'key.id': 1, returnedAt: 1 });
moveSchema.index({ site: 1, issuedAt: -1 });
moveSchema.index({ returnedAt: 1, dueAt: 1 });

export const KeyMove = model('KeyMove', moveSchema);
