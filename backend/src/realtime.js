// Load socket.io through require(): on the AWS server the ESM named import failed to resolve, while the
// CommonJS entry works everywhere (same fix as applied on the server).
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Server } = require('socket.io');
import { config } from './config.js';
import { isGateUser, userFromToken } from './middleware/auth.js';
import { serializeExpected } from './services/serializeExpected.js';
import { serializeMaterial } from './services/serializeMaterial.js';
import { serializeIncident } from './services/serializeOps.js';
import { serializeMail } from './services/serializeMail.js';
import { serializeVisit } from './services/serialize.js';
import { getSettings } from './services/settings.js';

/** @type {Server | null} */
let io = null;

/**
 * Rooms:
 * - `role:gate`  admin / security / viewer sockets: all visit:* and mail:* events
 * - `user:<id>`  every socket of that user: mail events for items addressed to them, visit events for their
 *                 own visitors, notifications, and disconnects
 */
const GATE_ROOM = 'role:gate';
/** @param {string} id */
const userRoom = (id) => `user:${id}`;

/** Attaches Socket.IO (JWT handshake auth) to the HTTP server. @param {import('node:http').Server} server */
export function initRealtime(server) {
  io = new Server(server, {
    cors: { origin: config.corsOrigin === '*' ? true : config.corsOrigin, credentials: true },
  });

  io.use(async (socket, next) => {
    try {
      let token = typeof socket.handshake.auth?.token === 'string' ? socket.handshake.auth.token : undefined;
      if (!token) token = /^Bearer\s+(.+)$/i.exec(socket.handshake.headers.authorization ?? '')?.[1];
      const user = await userFromToken(token);
      if (!user) return next(new Error('unauthorized'));
      socket.data.userId = user._id.toString();
      socket.data.role = user.role;
      await socket.join(userRoom(user._id.toString()));
      if (isGateUser(user)) await socket.join(GATE_ROOM);
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  return io;
}

/** @returns {Promise<void>} */
export function closeRealtime() {
  return new Promise((resolve) => {
    if (!io) return resolve();
    io.close(() => resolve());
    io = null;
  });
}

/** Drop live connections of a user (after deactivation or a role change; clients reconnect). @param {string} userId */
export function disconnectUser(userId) {
  io?.in(userRoom(userId)).disconnectSockets(true);
}

/**
 * visit:created / visit:updated → gate users + the visited host's own sockets (one delivery per socket).
 * @param {'visit:created' | 'visit:updated'} event
 * @param {any} visit
 */
async function emitVisit(event, visit) {
  if (!io) return;
  const { overstayHours } = await getSettings();
  const payload = { visit: await serializeVisit(visit, overstayHours) };
  if (!io) return;
  const target = visit.hostId ? io.to(GATE_ROOM).to(userRoom(visit.hostId)) : io.to(GATE_ROOM);
  target.emit(event, payload);
}

/** @param {any} visit Visit document */
export function emitVisitCreated(visit) {
  emitVisit('visit:created', visit).catch((e) => console.error('[realtime]', e));
}

/** @param {any} visit Visit document */
export function emitVisitUpdated(visit) {
  emitVisit('visit:updated', visit).catch((e) => console.error('[realtime]', e));
}

/** @param {import('./models/Settings.js').SettingsDto} settings */
export function emitSettingsUpdated(settings) {
  io?.emit('settings:updated', { settings });
}

/**
 * mail:created / mail:updated → gate users + the recipient's own sockets (one delivery per socket).
 * @param {'mail:created' | 'mail:updated'} event
 * @param {any} item MailItem document
 */
async function emitMail(event, item) {
  if (!io) return;
  const payload = { item: await serializeMail(item) };
  if (!io) return;
  const recipientId = item.recipient?.id;
  const target = recipientId ? io.to(GATE_ROOM).to(userRoom(recipientId)) : io.to(GATE_ROOM);
  target.emit(event, payload);
}

/** @param {any} item */
export const emitMailCreated = (item) => {
  emitMail('mail:created', item).catch((e) => console.error('[realtime]', e));
};
/** @param {any} item */
export const emitMailUpdated = (item) => {
  emitMail('mail:updated', item).catch((e) => console.error('[realtime]', e));
};

/** mail:reminder → only the recipient. @param {any} item */
export function emitMailReminder(item) {
  if (!io || !item.recipient?.id) return;
  const room = userRoom(item.recipient.id);
  serializeMail(item)
    .then((payload) => io?.to(room).emit('mail:reminder', { item: payload }))
    .catch((e) => console.error('[realtime]', e));
}

/**
 * Emit to every open socket of one user (e.g. notification:new / notification:read).
 * @param {string} userId
 * @param {string} event
 * @param {unknown} payload
 */
export function emitToUser(userId, event, payload) {
  io?.to(userRoom(userId)).emit(event, payload);
}

/** People concerned with a pre-registration: who registered it, the host, the receiving contact, the "also" list. */
export const expectedPeople = (/** @type {any} */ e) =>
  [...new Set([e.createdBy?.id, e.host?.id, e.contact?.id, ...(e.also ?? []).map((/** @type {any} */ a) => a.id)].filter(Boolean))];

/**
 * expected:changed → gate users + everyone concerned (one delivery per socket).
 * @param {any} expected Expected document
 */
export function emitExpectedChanged(expected) {
  if (!io) return;
  let target = io.to(GATE_ROOM);
  for (const id of expectedPeople(expected)) target = target.to(userRoom(id));
  target.emit('expected:changed', { expected: serializeExpected(expected) });
}

/**
 * `material:changed { pass }` to the gate and the employees on the pass (authorising / requesting).
 * @param {any} pass MaterialPass document
 */
export async function emitMaterialChanged(pass) {
  if (!io) return;
  let target = io.to(GATE_ROOM);
  for (const id of new Set([pass.authorisedBy?.id, pass.requestedBy?.id].filter(Boolean))) target = target.to(userRoom(id));
  target.emit('material:changed', { pass: await serializeMaterial(pass) });
}

/** `keys:changed { key }` to the gate (the key with its open moves). @param {any} key serialized key */
export function emitKeysChanged(key) {
  if (!io) return;
  io.to(GATE_ROOM).emit('keys:changed', { key });
}

/** `patrol:changed {}` / `gen:changed {}` to the gate: something moved, refetch. @param {'patrol' | 'gen'} what */
export function emitOpsChanged(what) {
  if (!io) return;
  io.to(GATE_ROOM).emit(`${what}:changed`, {});
}

/**
 * `incident:changed { incident }` to the gate, the reporter and the assigned person.
 * @param {any} incident Incident document
 */
export async function emitIncidentChanged(incident) {
  if (!io) return;
  let target = io.to(GATE_ROOM);
  for (const id of new Set([incident.reportedBy?.id, incident.assignedTo?.id].filter(Boolean))) target = target.to(userRoom(id));
  target.emit('incident:changed', { incident: await serializeIncident(incident) });
}
