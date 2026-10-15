import { Schema, model } from 'mongoose';

export const NOTIFICATION_EVENTS = /** @type {const} */ ([
  'mail_logged',
  'mail_reminder',
  'mail_confirm',
  'mail_disputed',
  'signup_request',
]);
/** @typedef {(typeof NOTIFICATION_EVENTS)[number]} NotificationEvent */

const NINETY_DAYS_S = 90 * 24 * 60 * 60;

/** One stored in-app notification for one user (the inbox behind the 🔔 bell). */
const notificationSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  event: { type: String, enum: NOTIFICATION_EVENTS, required: true },
  title: { type: String, required: true },
  body: { type: String, required: true },
  data: {
    type: new Schema({ type: { type: String, required: true }, id: { type: String, required: true } }, { _id: false }),
    required: true,
  },
  readAt: { type: Date, default: null },
  createdAt: { type: Date, required: true, default: () => new Date() },
});

// Inbox, newest first.
notificationSchema.index({ user: 1, createdAt: -1 });
// Unread counts / read-all.
notificationSchema.index({ user: 1, readAt: 1 });
// Kept for 90 days.
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: NINETY_DAYS_S, name: 'ttl_90_days' });

export const Notification = model('Notification', notificationSchema);

/**
 * API `AppNotification`.
 * @param {any} n
 */
export function serializeNotification(n) {
  return {
    id: n._id.toString(),
    event: n.event,
    title: n.title,
    body: n.body,
    data: { type: n.data.type, id: n.data.id },
    readAt: n.readAt ? n.readAt.toISOString() : null,
    createdAt: n.createdAt.toISOString(),
  };
}
