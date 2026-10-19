import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import sharp from 'sharp';
import { io as ioClient } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** @type {MongoMemoryServer} */
let mongod;
/** @type {http.Server} */
let server;
let baseUrl = '';
/** @type {string} */
let uploadDir;
/** @type {Buffer} */
let jpeg;
/** @type {any} */
let pushMod;
/** @type {any} */
let realtime;
/** @type {Record<string, { token: string, id: string }>} */
const u = {};
/** @type {string} */
let noPwId;

/** @param {string} t */
const auth = (t) => ({ Authorization: `Bearer ${t}` });
/** @param {string} who @param {string} url @param {object} [body] */
const post = (who, url, body = {}) => request(server).post(url).set(auth(u[who].token)).send(body);
/** @param {string} who @param {string} url @param {Record<string, unknown>} [query] */
const get = (who, url, query = {}) => request(server).get(url).query(query).set(auth(u[who].token));

/** @param {Record<string, string>} fields */
function logMail(fields) {
  let r = request(server).post('/api/mail').set(auth(u.security.token));
  for (const [k, v] of Object.entries({ kind: 'Courier', sender: 'Transasia', broughtBy: 'Ramu', ...fields })) {
    r = r.field(k, v);
  }
  return r
    .attach('cover', jpeg, { filename: 'c.jpg', contentType: 'image/jpeg' })
    .attach('coverBack', jpeg, { filename: 'b.jpg', contentType: 'image/jpeg' })
    .attach('person', jpeg, { filename: 'p.jpg', contentType: 'image/jpeg' });
}

/** All notifications of a user (newest first). @param {string} who */
const inbox = async (who) => (await get(who, '/api/notifications', { limit: 100 }).expect(200)).body;

/** @param {string} who @returns {Promise<{ socket: any, events: Array<[string, any]> }>} */
function connect(who) {
  return new Promise((resolve, reject) => {
    const socket = ioClient(baseUrl, { auth: { token: u[who].token }, transports: ['websocket'], forceNew: true });
    /** @type {Array<[string, any]>} */
    const events = [];
    socket.onAny((event, payload) => {
      if (event.startsWith('notification:')) events.push([event, payload]);
    });
    socket.on('connect', () => resolve({ socket, events }));
    socket.on('connect_error', reject);
  });
}

const settle = () => new Promise((r) => setTimeout(r, 150));

beforeAll(async () => {
  uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gatebook-notif-test-'));
  process.env.NODE_ENV = 'test';
  process.env.UPLOAD_DIR = uploadDir;
  process.env.JWT_SECRET = 'test-jwt';
  process.env.FILE_URL_SECRET = 'test-files';
  process.env.PACE_EMPLOYEES_URL = '';
  process.env.FIREBASE_SERVICE_ACCOUNT = path.join(uploadDir, 'missing.json');

  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('gatebook-notif-test'));
  const { bootstrap } = await import('../src/services/bootstrap.js');
  const { createApp } = await import('../src/app.js');
  realtime = await import('../src/realtime.js');
  pushMod = await import('../src/services/push.js');
  const { User } = await import('../src/models/User.js');
  await bootstrap();
  pushMod.setPushSenderForTests(null); // push disabled unless a test injects a sender

  server = http.createServer(createApp());
  realtime.initRealtime(server);
  await new Promise((r) => server.listen(0, '127.0.0.1', () => r(undefined)));
  baseUrl = `http://127.0.0.1:${/** @type {import('node:net').AddressInfo} */ (server.address()).port}`;
  jpeg = await sharp({ create: { width: 200, height: 150, channels: 3, background: '#445566' } }).jpeg().toBuffer();

  const login = await request(server).post('/api/auth/login').send({ email: 'admin@gatebook.local', password: 'admin123' });
  u.admin = { token: login.body.token, id: login.body.user.id };
  const people = [
    ['security', { name: 'Gate Guard', role: 'security' }],
    ['security2', { name: 'Night Guard', role: 'security' }],
    ['viewer', { name: 'Viewer', role: 'viewer' }],
    ['ravi', { name: 'Ravi Kumar', role: 'host' }],
    ['priya', { name: 'Priya Nair', role: 'host' }],
  ];
  for (const [key, data] of people) {
    const email = `${key}@test.local`;
    const c = await request(server).post('/api/users').set(auth(u.admin.token)).send({ email, password: 'secret123', ...data }).expect(201);
    const l = await request(server).post('/api/auth/login').send({ email, password: 'secret123' });
    u[String(key)] = { token: l.body.token, id: c.body.user.id };
  }
  const noPw = await User.create({ name: 'No Password', email: 'nopw@test.local', role: 'host', isHost: true, active: true });
  noPwId = noPw._id.toString();
});

afterAll(async () => {
  pushMod?.setPushSenderForTests(null);
  await realtime?.closeRealtime();
  await new Promise((r) => (server ? server.close(() => r(undefined)) : r(undefined)));
  await mongoose.disconnect();
  await mongod?.stop();
  await fs.rm(uploadDir, { recursive: true, force: true });
});

describe('mail triggers store notifications (push disabled)', () => {
  /** @type {any} */
  let item;

  it('post logged → the recipient only', async () => {
    expect(pushMod.pushEnabled()).toBe(false);
    const r = await logMail({ recipientId: u.ravi.id, kind: 'Registered post', sender: 'Income Tax Dept' }).expect(201);
    item = r.body.item;
    const ravi = await inbox('ravi');
    expect(ravi.data).toEqual([
      {
        id: expect.stringMatching(/^[a-f0-9]{24}$/),
        event: 'mail_logged',
        title: '📬 Registered post for you',
        body: 'From Income Tax Dept · collect it at the gate',
        data: { type: 'mail', id: item.id },
        alarm: false,
        readAt: null,
        createdAt: expect.any(String),
      },
    ]);
    expect(ravi.unreadCount).toBe(1);
    for (const who of ['priya', 'admin', 'security', 'viewer']) expect((await inbox(who)).pagination.total).toBe(0);
  });

  it('remind and handover → the recipient', async () => {
    await post('security', `/api/mail/${item.id}/remind`).expect(200);
    await post('security', `/api/mail/${item.id}/handover`, { collectedBy: 'Office boy' }).expect(200);
    const ravi = await inbox('ravi');
    expect(ravi.data.map((/** @type {any} */ n) => [n.event, n.title, n.body])).toEqual([
      ['mail_confirm', '✅ Please confirm collection', 'Registered post from Income Tax Dept was handed to Office boy. Did you get it?'],
      ['mail_reminder', '⏰ Reminder: Registered post waiting', 'From Income Tax Dept · still at the gate'],
      ['mail_logged', '📬 Registered post for you', 'From Income Tax Dept · collect it at the gate'],
    ]);
    expect(ravi.unreadCount).toBe(3);
    expect((await inbox('security')).pagination.total).toBe(0);
  });

  it('dispute → every active security and admin user (not the viewer, not the recipient)', async () => {
    await post('ravi', `/api/mail/${item.id}/confirm`, { ok: false, note: 'I was on leave' }).expect(200);
    for (const who of ['admin', 'security', 'security2']) {
      const box = await inbox(who);
      expect(box.data).toHaveLength(1);
      expect(box.data[0]).toMatchObject({
        event: 'mail_disputed',
        title: "⚠️ Ravi Kumar didn't get it",
        body: 'Registered post from Income Tax Dept · I was on leave',
        data: { type: 'mail', id: item.id },
        readAt: null,
      });
    }
    expect((await inbox('viewer')).pagination.total).toBe(0);
    expect((await inbox('ravi')).pagination.total).toBe(3);
  });

  it('nothing for recipients who cannot sign in or typed names', async () => {
    const { Notification } = await import('../src/models/Notification.js');
    const before = await Notification.countDocuments();
    const r = await logMail({ recipientId: noPwId }).expect(201);
    await post('security', `/api/mail/${r.body.item.id}/handover`, { collectedBy: 'X' }).expect(200);
    await logMail({ recipientName: 'Walk-in' }).expect(201);
    expect(await Notification.countDocuments()).toBe(before);
  });
});

describe('inbox API', () => {
  it('paginates newest first, filters unread and reports unreadCount', async () => {
    const p1 = await get('ravi', '/api/notifications', { limit: 2 }).expect(200);
    expect(Object.keys(p1.body).sort()).toEqual(['data', 'pagination', 'unreadCount']);
    expect(p1.body.pagination).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2, hasNextPage: true, hasPrevPage: false });
    expect(p1.body.data.map((/** @type {any} */ n) => n.event)).toEqual(['mail_confirm', 'mail_reminder']);
    const p2 = await get('ravi', '/api/notifications', { limit: 2, page: 2 }).expect(200);
    expect(p2.body.data.map((/** @type {any} */ n) => n.event)).toEqual(['mail_logged']);
    const asc = await get('ravi', '/api/notifications', { sort: 'createdAt' }).expect(200);
    expect(asc.body.data[0].event).toBe('mail_logged');

    await post('ravi', `/api/notifications/${p2.body.data[0].id}/read`).expect(200);
    const unread = await get('ravi', '/api/notifications', { unread: 'true' }).expect(200);
    expect(unread.body.pagination.total).toBe(2);
    expect(unread.body.unreadCount).toBe(2);
    expect((await get('ravi', '/api/notifications').expect(200)).body.pagination.total).toBe(3);
    expect((await get('ravi', '/api/notifications/unread-count').expect(200)).body).toEqual({ count: 2 });

    for (const [query, field] of [[{ sort: 'title' }, 'sort'], [{ limit: 101 }, 'limit'], [{ unread: 'maybe' }, 'unread']]) {
      const r = await get('ravi', '/api/notifications', /** @type {any} */ (query)).expect(400);
      expect(r.body.error).toMatchObject({ code: 'validation', field });
    }
    await request(server).get('/api/notifications').expect(401);
  });

  it('isolates owners: someone else’s or an invalid id is not_found', async () => {
    const raviFirst = (await inbox('ravi')).data[0];
    const other = await post('priya', `/api/notifications/${raviFirst.id}/read`).expect(404);
    expect(other.body.error.code).toBe('not_found');
    await post('priya', '/api/notifications/not-an-id/read').expect(404);
    await post('priya', `/api/notifications/${new mongoose.Types.ObjectId()}/read`).expect(404);
    expect((await inbox('ravi')).data[0].readAt).toBeNull();
    const all = await post('priya', '/api/notifications/read-all').expect(200);
    expect(all.body).toEqual({ updated: 0, unreadCount: 0 });
    expect((await inbox('ravi')).unreadCount).toBe(2);
  });

  it('read and read-all are idempotent', async () => {
    const id = (await inbox('ravi')).data[0].id;
    const a = await post('ravi', `/api/notifications/${id}/read`).expect(200);
    expect(a.body.unreadCount).toBe(1);
    expect(a.body.notification.readAt).toBeTypeOf('string');
    const b = await post('ravi', `/api/notifications/${id}/read`).expect(200);
    expect(b.body).toEqual(a.body);

    expect((await post('ravi', '/api/notifications/read-all').expect(200)).body).toEqual({ updated: 1, unreadCount: 0 });
    expect((await post('ravi', '/api/notifications/read-all').expect(200)).body).toEqual({ updated: 0, unreadCount: 0 });
    expect((await get('ravi', '/api/notifications/unread-count')).body).toEqual({ count: 0 });
  });
});

describe('realtime and push', () => {
  it('sends notification:new / notification:read to the owner’s room only', async () => {
    const ravi = await connect('ravi');
    const ravi2 = await connect('ravi'); // a second device/tab
    const priya = await connect('priya');
    const admin = await connect('admin');
    try {
      await logMail({ recipientId: u.ravi.id, sender: 'Bank' }).expect(201);
      await settle();
      for (const c of [ravi, ravi2]) {
        expect(c.events).toHaveLength(1);
        const [event, payload] = c.events[0];
        expect(event).toBe('notification:new');
        expect(payload.unreadCount).toBe(1);
        expect(payload.notification).toMatchObject({ event: 'mail_logged', body: 'From Bank · collect it at the gate', readAt: null });
      }
      expect(priya.events).toEqual([]);
      expect(admin.events).toEqual([]);

      const id = ravi.events[0][1].notification.id;
      await post('ravi', `/api/notifications/${id}/read`).expect(200);
      await post('ravi', `/api/notifications/${id}/read`).expect(200); // no change → no event
      await settle();
      expect(ravi2.events.slice(1)).toEqual([['notification:read', { ids: [id], unreadCount: 0 }]]);

      await logMail({ recipientId: u.ravi.id, sender: 'Bank 2' }).expect(201);
      await post('ravi', '/api/notifications/read-all').expect(200);
      await settle();
      expect(ravi.events.slice(-2)).toEqual([
        ['notification:new', expect.objectContaining({ unreadCount: 1 })],
        ['notification:read', { ids: 'all', unreadCount: 0 }],
      ]);
      expect(priya.events).toEqual([]);
      expect(admin.events).toEqual([]);
    } finally {
      for (const c of [ravi, ravi2, priya, admin]) c.socket.close();
    }
  });

  it('pushes carry the stored notification id', async () => {
    /** @type {any[]} */
    const sent = [];
    pushMod.setPushSenderForTests(async (/** @type {any} */ m) => {
      sent.push(m);
      return { responses: m.tokens.map(() => ({ success: true })) };
    });
    try {
      await post('priya', '/api/devices', { token: 'tok-priya', platform: 'ios' }).expect(200);
      await logMail({ recipientId: u.priya.id, sender: 'Courier Co' }).expect(201);
      await pushMod.pushIdle();
      const stored = (await inbox('priya')).data[0];
      expect(sent).toHaveLength(1);
      expect(sent[0].tokens).toEqual(['tok-priya']);
      expect(sent[0].data).toEqual({ type: 'mail', id: stored.data.id, notificationId: stored.id });
      expect(sent[0].notification).toEqual({ title: stored.title, body: stored.body });
    } finally {
      pushMod.setPushSenderForTests(null);
    }
  });
});
