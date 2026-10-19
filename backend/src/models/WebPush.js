import { Schema, model } from 'mongoose';

/** A browser's web push subscription (docs/API.md "Web push"), for the web app's "Alerts on this device". */
const subSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  endpoint: { type: String, required: true, unique: true },
  keys: { type: new Schema({ p256dh: String, auth: String }, { _id: false }), required: true },
  /** "Windows · Chrome" — shown in the list of devices. */
  device: { type: String, default: '' },
  createdAt: { type: Date, default: () => new Date() },
  lastSeenAt: { type: Date, default: () => new Date() },
});
export const WebPushSub = model('WebPushSub', subSchema);

/** Small server-made secrets kept in the database (the VAPID key pair when not set in the environment). */
const secretSchema = new Schema({
  key: { type: String, required: true, unique: true },
  value: { type: Schema.Types.Mixed, required: true },
});
export const AppSecret = model('AppSecret', secretSchema);
