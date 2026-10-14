import { Router } from 'express';
import mongoose from 'mongoose';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { badRequest, notFound } from '../middleware/error.js';
import { Notification, serializeNotification } from '../models/Notification.js';
import { emitToUser } from '../realtime.js';
import { unreadCount } from '../services/notify.js';
import { paginate, parseListQuery, queryString, searchFilter } from '../services/pagination.js';

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

// GET /api/notifications — own notifications, paginated; unread=true; sort createdAt (default newest first)
notificationsRouter.get('/', async (req, res) => {
  const me = currentUser(req);
  const lq = parseListQuery(req.query, { sortFields: ['createdAt'], defaultSort: '-createdAt' });
  /** @type {Record<string, unknown>} */
  const filter = { user: me._id, ...searchFilter(lq.q, ['title', 'body']) };
  const unread = queryString(req.query, 'unread');
  if (unread !== undefined) {
    if (unread !== 'true' && unread !== 'false') throw badRequest('unread must be true or false.', 'unread');
    if (unread === 'true') filter.readAt = null;
  }
  const [page, count] = await Promise.all([
    paginate(Notification, filter, lq, serializeNotification),
    unreadCount(me._id.toString()),
  ]);
  res.json({ ...page, unreadCount: count });
});

notificationsRouter.get('/unread-count', async (req, res) => {
  res.json({ count: await unreadCount(currentUser(req)._id.toString()) });
});

// POST /api/notifications/read-all — mark every unread notification of the caller as read
notificationsRouter.post('/read-all', async (req, res) => {
  const userId = currentUser(req)._id.toString();
  const r = await Notification.updateMany({ user: userId, readAt: null }, { $set: { readAt: new Date() } });
  if (r.modifiedCount > 0) emitToUser(userId, 'notification:read', { ids: 'all', unreadCount: 0 });
  res.json({ updated: r.modifiedCount, unreadCount: 0 });
});

// POST /api/notifications/:id/read — owner only, idempotent
notificationsRouter.post('/:id/read', async (req, res) => {
  const userId = currentUser(req)._id.toString();
  const id = String(req.params.id);
  if (!mongoose.isValidObjectId(id)) throw notFound('Notification not found.');
  const changed = await Notification.findOneAndUpdate(
    { _id: id, user: userId, readAt: null },
    { $set: { readAt: new Date() } },
    { returnDocument: 'after' },
  );
  const doc = changed ?? (await Notification.findOne({ _id: id, user: userId }));
  if (!doc) throw notFound('Notification not found.');
  const count = await unreadCount(userId);
  if (changed) emitToUser(userId, 'notification:read', { ids: [id], unreadCount: count });
  res.json({ notification: serializeNotification(doc), unreadCount: count });
});
