import { Schema, model } from 'mongoose';

export const PLATFORMS = /** @type {const} */ (['android', 'ios']);

/** An FCM registration token belonging to a signed-in user's phone. */
const deviceSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  token: { type: String, required: true, unique: true },
  platform: { type: String, enum: PLATFORMS, required: true },
  createdAt: { type: Date, required: true, default: () => new Date() },
  lastSeenAt: { type: Date, required: true, default: () => new Date() },
});

export const Device = model('Device', deviceSchema);
