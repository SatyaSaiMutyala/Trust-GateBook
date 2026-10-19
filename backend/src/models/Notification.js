import { Schema, model } from 'mongoose';

export const NOTIFICATION_EVENTS = /** @type {const} */ ([
  'mail_logged',
  'mail_reminder',
  'mail_confirm',
  'mail_disputed',
  'signup_request',
  'visit_arrived', // to the host: a visitor is at the gate, accept or decline
  'visit_reply', // to security: the host accepted or declined
  'visit_no_reply', // to security: the host has not replied in hostReplyMinutes
  'expected_new', // to security (and the host, when someone else registered it): a visitor / delivery is expected
  'expected_cancelled', // to security and the host: a pre-registration was cancelled
  'expected_arrived', // to the people concerned: an expected visitor checked in / a delivery was received
  'escalation', // a step of an escalation matrix (services/escalation.js)
  'material_in', // to the receiving employee: boxes brought in for them, tap Received
  'material_approval', // to the employee named on a security-made OUT pass: approve or reject
  'material_decision', // to security: the employee approved / rejected an OUT pass
  'material_disputed', // to security: the employee says the boxes did not reach them
  'key_issued', // to a Gatebook user who took a key: return it by …
  'incident_assigned', // to the person an incident was given to
  'incident_update', // to the reporter / assignee: someone else updated the incident
  'incident_closed', // to the reporter: the incident was closed
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
  /** Alarm steps ring longer and need tapping away. */
  alarm: { type: Boolean, default: false },
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
    alarm: n.alarm === true,
    readAt: n.readAt ? n.readAt.toISOString() : null,
    createdAt: n.createdAt.toISOString(),
  };
}
