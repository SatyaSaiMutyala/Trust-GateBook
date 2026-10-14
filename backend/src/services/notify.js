/**
 * In-app notifications: store one per user, tell their open sockets, then push to their phones.
 * Used by every mail trigger. Never throws into the request.
 */
import { Notification, serializeNotification } from '../models/Notification.js';
import { emitToUser } from '../realtime.js';
import { sendToUsers } from './push.js';

/**
 * @typedef {object} NotifyMessage
 * @property {import('../models/Notification.js').NotificationEvent} event
 * @property {string} title
 * @property {string} body
 * @property {{ type: string, id: string }} data
 */

/** Total unread for a user. @param {string} userId */
export const unreadCount = (userId) => Notification.countDocuments({ user: userId, readAt: null });

/**
 * Stores a notification for each user (whether or not they have a phone registered), emits
 * `notification:new` to each user's room, and starts one push per user carrying that user's `notificationId`.
 * Storing is awaited; pushes are fire-and-forget. Errors are logged, never thrown.
 * @param {Array<string | { toString(): string }> | Promise<Array<string | { toString(): string }>>} userIds
 * @param {NotifyMessage} msg
 * @returns {Promise<any[]>} the stored notifications ([] on failure)
 */
export async function notify(userIds, msg) {
  try {
    const ids = [...new Set((await userIds).map(String))];
    if (ids.length === 0) return [];
    const now = new Date();
    const docs = await Notification.insertMany(
      ids.map((user) => ({ user, event: msg.event, title: msg.title, body: msg.body, data: msg.data, createdAt: now })),
    );
    for (const doc of docs) {
      const userId = doc.user.toString();
      const notification = serializeNotification(doc);
      unreadCount(userId)
        .then((count) => emitToUser(userId, 'notification:new', { notification, unreadCount: count }))
        .catch((e) => console.error('[notify] socket:', e instanceof Error ? e.message : e));
      void sendToUsers([userId], {
        title: msg.title,
        body: msg.body,
        data: { ...msg.data, notificationId: notification.id },
      });
    }
    return docs;
  } catch (e) {
    console.error('[notify] failed:', e instanceof Error ? e.message : e);
    return [];
  }
}
