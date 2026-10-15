import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/** @type {MongoMemoryServer} */
let mongod;
/** @type {import('express').Express} */
let app;
/** @type {string} */
let uploadDir;
/** @type {Buffer} */
let jpeg;
/** @type {any} */
let pushMod;
/** @type {any} */
let Device;
/** @type {Record<string, { token: string, id: string }>} */
const u = {};
/** @type {string} */
let noPwId;

/** Messages the fake FCM sender received. @type {any[]} */
let sent = [];

/**
 * Fake `sendEachForMulticast`: tokens starting `bad-` are unregistered, `odd-` fail with an unrelated error.
 * @param {any} message
 */
async function fakeSender(message) {
  sent.push(message);
  return {
    responses: message.tokens.map((/** @type {string} */ t) =>
      t.startsWith('bad-')
        ? { success: false, error: { code: 'messaging/registration-token-not-registered', message: 'gone' } }
        : t.startsWith('odd-')
          ? { success: false, error: { code: 'messaging/internal-error', message: 'flaky' } }
          : { success: true },
    ),
  };
}

/** @param {string} t */
const auth = (t) => ({ Authorization: `Bearer ${t}` });
/** @param {string} who @param {string} url @param {object} [body] */
const post = (who, url, body = {}) => request(app).post(url).set(auth(u[who].token)).send(body);
/** @param {string} who @param {string} token @param {'android' | 'ios'} [platform] */
const register = (who, token, platform = 'android') => post(who, '/api/devices', { token, platform }).expect(200);

/** @param {Record<string, string>} fields */
function logMail(fields) {
  let r = request(app).post('/api/mail').set(auth(u.security.token));
  for (const [k, v] of Object.entries({ kind: 'Courier', sender: 'Transasia', broughtBy: 'Ramu', ...fields })) {
    r = r.field(k, v);
  }
  return r
    .attach('cover', jpeg, { filename: 'c.jpg', contentType: 'image/jpeg' })
    .attach('coverBack', jpeg, { filename: 'b.jpg', contentType: 'image/jpeg' })
    .attach('person', jpeg, { filename: 'p.jpg', contentType: 'image/jpeg' });
}

/** Tokens of a user, sorted. @param {string} id */
const tokensOf = async (id) => (await Device.find({ user: id }).lean()).map((/** @type {any} */ d) => d.token).sort();

beforeAll(async () => {
  uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gatebook-push-test-'));
  process.env.NODE_ENV = 'test';
  process.env.UPLOAD_DIR = uploadDir;
  process.env.JWT_SECRET = 'test-jwt';
  process.env.FILE_URL_SECRET = 'test-files';
  process.env.PACE_EMPLOYEES_URL = '';
  process.env.FIREBASE_SERVICE_ACCOUNT = path.join(uploadDir, 'no-such-service-account.json');

  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('gatebook-push-test'));
  const { bootstrap } = await import('../src/services/bootstrap.js');
  const { createApp } = await import('../src/app.js');
  pushMod = await import('../src/services/push.js');
  ({ Device } = await import('../src/models/Device.js'));
  const { User } = await import('../src/models/User.js');
  await bootstrap();
  app = createApp();
  jpeg = await sharp({ create: { width: 200, height: 150, channels: 3, background: '#556677' } }).jpeg().toBuffer();

  const login = await request(app).post('/api/auth/login').send({ email: 'admin@gatebook.local', password: 'admin123' });
  u.admin = { token: login.body.token, id: login.body.user.id };
  const people = [
    ['security', { name: 'Gate Guard', role: 'security' }],
    ['security2', { name: 'Night Guard', role: 'security' }],
    ['retired', { name: 'Retired Guard', role: 'security' }],
    ['viewer', { name: 'Viewer', role: 'viewer' }],
    ['ravi', { name: 'Ravi Kumar', role: 'host', dept: 'Accounts' }],
    ['priya', { name: 'Priya Nair', role: 'host', dept: 'HR' }],
  ];
  for (const [key, data] of people) {
    const email = `${key}@test.local`;
    const c = await request(app)
      .post('/api/users')
      .set(auth(u.admin.token))
      .send({ email, password: 'secret123', ...data })
      .expect(201);
    const l = await request(app).post('/api/auth/login').send({ email, password: 'secret123' });
    u[String(key)] = { token: l.body.token, id: c.body.user.id };
  }
  // A recipient who can't sign in (no password, like a Pace-linked employee).
  const noPw = await User.create({ name: 'No Password', email: 'nopw@test.local', role: 'host', isHost: true, active: true });
  noPwId = noPw._id.toString();
});

afterAll(async () => {
  pushMod?.setPushSenderForTests(null);
  await mongoose.disconnect();
  await mongod?.stop();
  await fs.rm(uploadDir, { recursive: true, force: true });
});

beforeEach(() => {
  sent = [];
  pushMod.setPushSenderForTests(fakeSender);
});

describe('device tokens', () => {
  it('validates, upserts, reassigns and deletes only the caller’s own token', async () => {
    await request(app).post('/api/devices').send({ token: 't', platform: 'android' }).expect(401);
    const bad = await post('ravi', '/api/devices', { token: 'tok-r1', platform: 'web' }).expect(400);
    expect(bad.body.error).toMatchObject({ code: 'validation', field: 'platform' });
    const empty = await post('ravi', '/api/devices', { token: '', platform: 'ios' }).expect(400);
    expect(empty.body.error.field).toBe('token');
    await post('ravi', '/api/devices', { token: 'x'.repeat(4097), platform: 'ios' }).expect(400);

    expect((await register('ravi', 'tok-r1')).body).toEqual({ ok: true });
    await register('ravi', 'tok-r1', 'ios'); // same token again: still one row
    expect(await Device.countDocuments({ token: 'tok-r1' })).toBe(1);
    const row = await Device.findOne({ token: 'tok-r1' }).lean();
    expect(row.platform).toBe('ios');
    expect(row.lastSeenAt.getTime()).toBeGreaterThanOrEqual(row.createdAt.getTime());

    await register('priya', 'tok-r1'); // the phone changed hands
    expect(await tokensOf(u.priya.id)).toEqual(['tok-r1']);
    expect(await tokensOf(u.ravi.id)).toEqual([]);
    await register('ravi', 'tok-r1');
    await register('ravi', 'tok-r2');

    // Someone else's token: 200 but untouched. Own token: removed. Absent token: 200.
    expect((await request(app).delete('/api/devices/tok-r1').set(auth(u.priya.token)).expect(200)).body).toEqual({ ok: true });
    expect(await tokensOf(u.ravi.id)).toEqual(['tok-r1', 'tok-r2']);
    await request(app).delete('/api/devices/tok-r2').set(auth(u.ravi.token)).expect(200);
    expect(await tokensOf(u.ravi.id)).toEqual(['tok-r1']);
    await request(app).delete('/api/devices/never-registered').set(auth(u.ravi.token)).expect(200);
    await register('ravi', 'tok-r2');

    for (const [who, token] of [['admin', 'tok-a1'], ['security', 'tok-s1'], ['security2', 'tok-s2'], ['retired', 'tok-x1'], ['viewer', 'tok-v1'], ['priya', 'tok-p1']]) {
      await register(who, token);
    }
  });
});

describe('mail pushes', () => {
  /** @type {any} */
  let item;

  it('pushes "post logged" to the recipient with the documented payload', async () => {
    const r = await logMail({ recipientId: u.ravi.id, sender: 'Income Tax Dept', kind: 'Registered post' }).expect(201);
    item = r.body.item;
    await pushMod.pushIdle();
    expect(sent).toHaveLength(1);
    expect({ ...sent[0], tokens: [...sent[0].tokens].sort() }).toEqual({
      tokens: ['tok-r1', 'tok-r2'],
      notification: { title: '📬 Registered post for you', body: 'From Income Tax Dept · collect it at the gate' },
      data: { type: 'mail', id: item.id, notificationId: expect.stringMatching(/^[a-f0-9]{24}$/) },
      android: { priority: 'high', notification: { channelId: 'gatebook_default', sound: 'default' } },
      apns: { payload: { aps: { sound: 'default' } } },
    });
  });

  it('pushes the reminder and the handover to the recipient only', async () => {
    await post('security', `/api/mail/${item.id}/remind`).expect(200);
    await pushMod.pushIdle();
    expect(sent).toHaveLength(1);
    expect([...sent[0].tokens].sort()).toEqual(['tok-r1', 'tok-r2']);
    expect(sent[0].notification).toEqual({
      title: '⏰ Reminder: Registered post waiting',
      body: 'From Income Tax Dept · still at the gate',
    });

    sent = [];
    await post('security', `/api/mail/${item.id}/handover`, { collectedBy: 'Office boy' }).expect(200);
    await pushMod.pushIdle();
    expect(sent).toHaveLength(1);
    expect([...sent[0].tokens].sort()).toEqual(['tok-r1', 'tok-r2']);
    expect(sent[0].notification).toEqual({
      title: '✅ Please confirm collection',
      body: 'Registered post from Income Tax Dept was handed to Office boy. Did you get it?',
    });
    expect(sent[0].data).toEqual({ type: 'mail', id: item.id, notificationId: expect.stringMatching(/^[a-f0-9]{24}$/) });
  });

  it('pushes a dispute to every active security and admin user', async () => {
    await request(app).patch(`/api/users/${u.retired.id}`).set(auth(u.admin.token)).send({ active: false }).expect(200);
    expect(await tokensOf(u.retired.id)).toEqual([]); // deactivation removes devices

    await post('ravi', `/api/mail/${item.id}/confirm`, { ok: false, note: 'I was on leave' }).expect(200);
    await pushMod.pushIdle();
    // One push per user, each carrying that user's own stored notification id.
    expect(sent).toHaveLength(3);
    expect(sent.flatMap((m) => m.tokens).sort()).toEqual(['tok-a1', 'tok-s1', 'tok-s2']);
    for (const m of sent) {
      expect(m.tokens).toHaveLength(1);
      expect(m.notification).toEqual({
        title: "⚠️ Ravi Kumar didn't get it",
        body: 'Registered post from Income Tax Dept · I was on leave',
      });
      expect(m.data).toEqual({ type: 'mail', id: item.id, notificationId: expect.stringMatching(/^[a-f0-9]{24}$/) });
    }
    expect(new Set(sent.map((m) => m.data.notificationId)).size).toBe(3);
  });

  it('sends nothing for confirmations, resolutions, closed handovers or recipients who cannot sign in', async () => {
    await post('security', `/api/mail/${item.id}/resolve`, { note: 'Found it' }).expect(200);
    const nopw = await logMail({ recipientId: noPwId }).expect(201);
    expect(nopw.body.item.notifiedAt).toBeNull();
    const h = await post('security', `/api/mail/${nopw.body.item.id}/handover`, { collectedBy: 'X' }).expect(200);
    expect(h.body.item.status).toBe('closed');
    const typed = await logMail({ recipientName: 'Walk-in Person' }).expect(201);
    await post('security', `/api/mail/${typed.body.item.id}/handover`, { collectedBy: 'Y' }).expect(200);

    const ok = await logMail({ recipientId: u.priya.id }).expect(201);
    await pushMod.pushIdle();
    sent = [];
    await post('security', `/api/mail/${ok.body.item.id}/handover`, { collectedBy: 'Priya' }).expect(200);
    await pushMod.pushIdle();
    sent = [];
    await post('priya', `/api/mail/${ok.body.item.id}/confirm`, { ok: true }).expect(200);
    await pushMod.pushIdle();
    expect(sent).toEqual([]);
  });

  it('removes tokens FCM reports as invalid and keeps the rest', async () => {
    await register('ravi', 'bad-old-phone');
    await register('ravi', 'odd-flaky');
    await logMail({ recipientId: u.ravi.id }).expect(201);
    await pushMod.pushIdle();
    expect(sent[0].tokens.sort()).toEqual(['bad-old-phone', 'odd-flaky', 'tok-r1', 'tok-r2']);
    expect(await tokensOf(u.ravi.id)).toEqual(['odd-flaky', 'tok-r1', 'tok-r2']);
  });

  it('never fails the request when push is disabled or the sender throws', async () => {
    pushMod.setPushSenderForTests(null);
    expect(await pushMod.initPush()).toBe(false); // FIREBASE_SERVICE_ACCOUNT points at a missing file
    expect(pushMod.pushEnabled()).toBe(false);
    await logMail({ recipientId: u.ravi.id }).expect(201);

    pushMod.setPushSenderForTests(async () => {
      throw new Error('FCM is down');
    });
    const r = await logMail({ recipientId: u.ravi.id }).expect(201);
    await post('security', `/api/mail/${r.body.item.id}/remind`).expect(200);
    await pushMod.pushIdle();
    expect(await tokensOf(u.ravi.id)).toEqual(['odd-flaky', 'tok-r1', 'tok-r2']);
  });
});
