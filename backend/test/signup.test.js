import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/** @type {MongoMemoryServer} */
let mongod;
/** @type {import('express').Express} */
let app;
/** @type {string} */
let uploadDir;
/** @type {any} */
let config;
/** @type {() => void} */
let resetSignupLimiter;
/** @type {any} */
let User;
/** @type {any} */
let Device;
/** @type {any} */
let Notification;
/** @type {Record<string, { token: string, id: string }>} */
const u = {};

/** @param {string} t */
const auth = (t) => ({ Authorization: `Bearer ${t}` });
/** @param {string} who @param {string} url @param {object} [body] */
const post = (who, url, body = {}) => request(app).post(url).set(auth(u[who].token)).send(body);
/** @param {string} who @param {string} url @param {Record<string, unknown>} [query] */
const get = (who, url, query = {}) => request(app).get(url).query(query).set(auth(u[who].token));
/** @param {string} email @param {string} password */
const login = (email, password) => request(app).post('/api/auth/login').send({ email, password });

/** @param {Record<string, unknown>} [over] @param {string} [ip] */
const signup = (over = {}, ip = '198.51.100.1') =>
  request(app)
    .post('/api/auth/signup')
    .set('X-Forwarded-For', ip)
    .send({ name: 'Neha Sharma', email: 'neha@test.local', phone: '+91 98450 12345', password: 'longpass1', dept: 'HR', ...over });

const SIGNUP_OK = "Account requested. An admin will approve it — you can sign in once it's approved.";

beforeAll(async () => {
  uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gatebook-signup-test-'));
  process.env.NODE_ENV = 'test';
  process.env.UPLOAD_DIR = uploadDir;
  process.env.JWT_SECRET = 'test-jwt';
  process.env.FILE_URL_SECRET = 'test-files';
  process.env.PACE_EMPLOYEES_URL = '';
  process.env.FIREBASE_SERVICE_ACCOUNT = path.join(uploadDir, 'missing.json');
  process.env.SIGNUP_ENABLED = 'true';
  delete process.env.ACCOUNT_DELETION_ENABLED; // forced on by sign-up

  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('gatebook-signup-test'));
  ({ config } = await import('../src/config.js'));
  ({ resetSignupLimiter } = await import('../src/routes/auth.js'));
  ({ User } = await import('../src/models/User.js'));
  ({ Device } = await import('../src/models/Device.js'));
  ({ Notification } = await import('../src/models/Notification.js'));
  const { bootstrap } = await import('../src/services/bootstrap.js');
  const { createApp } = await import('../src/app.js');
  await bootstrap();
  app = createApp();

  const l = await login('admin@gatebook.local', 'admin123');
  u.admin = { token: l.body.token, id: l.body.user.id };
  for (const [key, role] of [['admin2', 'admin'], ['retired', 'admin'], ['security', 'security'], ['ravi', 'host']]) {
    const email = `${key}@test.local`;
    const c = await post('admin', '/api/users', { name: key, email, password: 'secret123', role }).expect(201);
    const t = await login(email, 'secret123');
    u[key] = { token: t.body.token, id: c.body.user.id };
  }
  await request(app).patch(`/api/users/${u.retired.id}`).set(auth(u.admin.token)).send({ active: false }).expect(200);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod?.stop();
  await fs.rm(uploadDir, { recursive: true, force: true });
});

beforeEach(() => {
  resetSignupLimiter();
  config.features.signup = true;
  config.features.accountDeletion = true;
});

describe('feature switches', () => {
  it('GET /api/config is public and reflects the switches', async () => {
    const r = await request(app).get('/api/config').expect(200);
    expect(r.body).toEqual({ features: { signup: true, accountDeletion: true } });
  });

  it('forces account deletion on whenever sign-up is on', async () => {
    const cases = [
      [{ SIGNUP_ENABLED: 'yes', ACCOUNT_DELETION_ENABLED: 'false' }, { signup: true, accountDeletion: true }],
      [{ SIGNUP_ENABLED: '0', ACCOUNT_DELETION_ENABLED: '1' }, { signup: false, accountDeletion: true }],
      [{ SIGNUP_ENABLED: 'TRUE', ACCOUNT_DELETION_ENABLED: undefined }, { signup: true, accountDeletion: true }],
      [{ SIGNUP_ENABLED: undefined, ACCOUNT_DELETION_ENABLED: undefined }, { signup: false, accountDeletion: false }],
      [{ SIGNUP_ENABLED: 'on', ACCOUNT_DELETION_ENABLED: 'no' }, { signup: false, accountDeletion: false }],
    ];
    const saved = { s: process.env.SIGNUP_ENABLED, d: process.env.ACCOUNT_DELETION_ENABLED };
    try {
      for (const [env, expected] of cases) {
        for (const [k, v] of Object.entries(env)) {
          if (v === undefined) delete process.env[k];
          else process.env[k] = v;
        }
        vi.resetModules();
        const fresh = await import('../src/config.js');
        expect(fresh.config.features).toEqual(expected);
      }
    } finally {
      process.env.SIGNUP_ENABLED = saved.s;
      if (saved.d === undefined) delete process.env.ACCOUNT_DELETION_ENABLED;
      else process.env.ACCOUNT_DELETION_ENABLED = saved.d;
      vi.resetModules();
    }
  });

  it('returns 404 feature_disabled when a switch is off', async () => {
    config.features.signup = false;
    config.features.accountDeletion = false;
    expect((await request(app).get('/api/config')).body).toEqual({ features: { signup: false, accountDeletion: false } });
    const s = await signup({ email: 'off@test.local' }).expect(404);
    expect(s.body.error.code).toBe('feature_disabled');
    const d = await request(app).delete('/api/auth/me').set(auth(u.ravi.token)).send({ password: 'secret123' }).expect(404);
    expect(d.body.error.code).toBe('feature_disabled');
    expect(await User.exists({ email: 'off@test.local' })).toBeNull();
  });
});

describe('sign-up', () => {
  /** @type {string} */
  let nehaId;

  it('creates a pending Employee and notifies active admins', async () => {
    const r = await signup({ email: 'Neha@Test.local' }).expect(201);
    expect(r.body).toEqual({ message: SIGNUP_OK });
    const neha = await User.findOne({ email: 'neha@test.local' }).lean();
    expect(neha).toMatchObject({ role: 'host', isHost: true, active: false, status: 'pending', phone: '+91 98450 12345', dept: 'HR' });
    expect(neha.passwordHash).toMatch(/^\$2[aby]\$10\$/);
    nehaId = neha._id.toString();

    for (const who of ['admin', 'admin2']) {
      const box = (await get(who, '/api/notifications').expect(200)).body;
      expect(box.data[0]).toMatchObject({
        event: 'signup_request',
        title: '🙋 New account request',
        body: 'Neha Sharma · neha@test.local',
        data: { type: 'user', id: nehaId },
      });
    }
    expect(await Notification.countDocuments({ user: u.retired.id })).toBe(0);
    expect(await Notification.countDocuments({ user: u.security.id })).toBe(0);

    const pending = await get('admin', '/api/users', { status: 'pending' }).expect(200);
    expect(pending.body.data.map((/** @type {any} */ x) => [x.email, x.status, x.active])).toEqual([['neha@test.local', 'pending', false]]);
    const all = await get('admin', '/api/users', { limit: 100 }).expect(200);
    expect(all.body.data.some((/** @type {any} */ x) => x.id === nehaId)).toBe(true);
    const active = await get('admin', '/api/users', { status: 'active', limit: 100 }).expect(200);
    expect(active.body.data.some((/** @type {any} */ x) => x.id === nehaId)).toBe(false);
    expect(active.body.data.every((/** @type {any} */ x) => x.status === 'active')).toBe(true);
    await get('admin', '/api/users', { status: 'gone' }).expect(400);
  });

  it('validates input and rejects a duplicate email', async () => {
    for (const [over, field] of [
      [{ name: '' }, 'name'],
      [{ email: 'not-an-email' }, 'email'],
      [{ phone: '12345' }, 'phone'],
      [{ phone: 'call me' }, 'phone'],
      [{ password: 'short12' }, 'password'],
      [{ password: 'x'.repeat(101) }, 'password'],
    ]) {
      const r = await signup({ email: 'v@test.local', ...over }).expect(400);
      expect(r.body.error).toMatchObject({ code: 'validation', field });
    }
    resetSignupLimiter();
    const dup = await signup({ email: 'NEHA@test.local' }).expect(409);
    expect(dup.body.error).toEqual({ code: 'conflict', message: 'An account with this email already exists.', field: 'email' });
    const dupExisting = await signup({ email: 'ravi@test.local' }).expect(409);
    expect(dupExisting.body.error.code).toBe('conflict');
  });

  it('rate-limits to 5 sign-ups per IP per hour', async () => {
    for (let i = 0; i < 5; i++) await signup({ email: `burst${i}@test.local` }, '203.0.113.9').expect(201);
    const r = await signup({ email: 'burst5@test.local' }, '203.0.113.9').expect(429);
    expect(r.body.error).toEqual({ code: 'rate_limited', message: 'Too many sign-ups from this network. Try again later.' });
    await signup({ email: 'other-network@test.local' }, '203.0.113.10').expect(201);
    expect(await User.exists({ email: 'burst5@test.local' })).toBeNull();
  });

  it('pending users cannot sign in, receive post or appear in the receiver list', async () => {
    const r = await login('neha@test.local', 'longpass1').expect(403);
    expect(r.body.error).toEqual({ code: 'forbidden', message: 'Your account is waiting for admin approval.' });
    expect((await login('neha@test.local', 'wrong-pass')).body.error.message).toBe('Wrong email or password.');
    const hosts = await get('security', '/api/hosts', { limit: 100 }).expect(200);
    expect(hosts.body.data.some((/** @type {any} */ h) => h.id === nehaId)).toBe(false);

    const jpeg = await sharp({ create: { width: 50, height: 50, channels: 3, background: '#999' } }).jpeg().toBuffer();
    const m = await request(app)
      .post('/api/mail')
      .set(auth(u.security.token))
      .field('kind', 'Courier')
      .field('sender', 'X')
      .field('broughtBy', 'Y')
      .field('recipientId', nehaId)
      .attach('cover', jpeg, { filename: 'c.jpg', contentType: 'image/jpeg' })
      .attach('coverBack', jpeg, { filename: 'b.jpg', contentType: 'image/jpeg' })
      .attach('person', jpeg, { filename: 'p.jpg', contentType: 'image/jpeg' })
      .expect(400);
    expect(m.body.error.field).toBe('recipientId');
  });

  it('approve / reject: admin only, pending only', async () => {
    await post('security', `/api/users/${nehaId}/approve`).expect(403);
    await post('admin', `/api/users/${u.ravi.id}/approve`).expect(409);
    await post('admin', `/api/users/${u.ravi.id}/reject`).expect(409);
    await post('admin', `/api/users/${new mongoose.Types.ObjectId()}/approve`).expect(404);
    await post('admin', `/api/users/${nehaId}/approve`, { role: 'boss' }).expect(400);

    const a = await post('admin', `/api/users/${nehaId}/approve`).expect(200);
    expect(a.body.user).toMatchObject({ id: nehaId, role: 'host', isHost: true, active: true, status: 'active', canSignIn: true });
    await post('admin', `/api/users/${nehaId}/approve`).expect(409);
    const l = await login('neha@test.local', 'longpass1').expect(200);
    expect(l.body.user.status).toBe('active');
    const hosts = await get('security', '/api/hosts', { limit: 100 }).expect(200);
    expect(hosts.body.data.some((/** @type {any} */ h) => h.id === nehaId)).toBe(true);

    const viewer = await User.findOne({ email: 'burst0@test.local' });
    const v = await post('admin', `/api/users/${viewer._id}/approve`, { role: 'viewer' }).expect(200);
    expect(v.body.user).toMatchObject({ role: 'viewer', isHost: false, status: 'active' });

    const rej = await User.findOne({ email: 'burst1@test.local' });
    await Notification.create({ user: rej._id, event: 'mail_logged', title: 't', body: 'b', data: { type: 'mail', id: 'x' } });
    await post('security', `/api/users/${rej._id}/reject`).expect(403);
    expect((await post('admin', `/api/users/${rej._id}/reject`).expect(200)).body).toEqual({ ok: true });
    expect(await User.exists({ _id: rej._id })).toBeNull();
    expect(await Notification.countDocuments({ user: rej._id })).toBe(0);
    await post('admin', `/api/users/${rej._id}/reject`).expect(404);
  });
});

describe('account deletion', () => {
  it('needs the right password', async () => {
    const r = await request(app).delete('/api/auth/me').set(auth(u.ravi.token)).send({ password: 'nope' }).expect(401);
    expect(r.body.error).toEqual({ code: 'unauthorized', message: 'Wrong password.' });
    await request(app).delete('/api/auth/me').set(auth(u.ravi.token)).send({}).expect(400);
    await request(app).delete('/api/auth/me').send({ password: 'secret123' }).expect(401);
  });

  it('anonymises the account, removes devices and notifications, and ends sign-in', async () => {
    await post('ravi', '/api/devices', { token: 'ravi-phone', platform: 'android' }).expect(200);
    await Notification.create({ user: u.ravi.id, event: 'mail_logged', title: 't', body: 'b', data: { type: 'mail', id: 'x' } });
    await request(app).patch('/api/auth/me').set(auth(u.ravi.token)).send({ phone: '9876500001', location: 'Cabin 3' }).expect(200);

    expect((await request(app).delete('/api/auth/me').set(auth(u.ravi.token)).send({ password: 'secret123' }).expect(200)).body).toEqual({ ok: true });

    const doc = await User.findById(u.ravi.id).lean();
    expect(doc).toMatchObject({
      name: 'Deleted user',
      email: `deleted-${u.ravi.id}@deleted.invalid`,
      phone: '',
      dept: '',
      location: '',
      isHost: false,
      active: false,
      status: 'deleted',
    });
    expect(doc.passwordHash).toBeUndefined();
    expect(doc.deletedAt).toBeInstanceOf(Date);
    expect(await Device.countDocuments({ user: u.ravi.id })).toBe(0);
    expect(await Notification.countDocuments({ user: u.ravi.id })).toBe(0);

    expect((await login('ravi@test.local', 'secret123').expect(401)).body.error.message).toBe('Wrong email or password.');
    expect((await login(`deleted-${u.ravi.id}@deleted.invalid`, 'secret123').expect(401)).body.error.message).toBe(
      'Wrong email or password.',
    );
    await get('ravi', '/api/auth/me').expect(401);

    const hosts = await get('security', '/api/hosts', { limit: 100 }).expect(200);
    expect(hosts.body.data.some((/** @type {any} */ h) => h.id === u.ravi.id)).toBe(false);
    const list = await get('admin', '/api/users', { limit: 100 }).expect(200);
    expect(list.body.data.some((/** @type {any} */ x) => x.id === u.ravi.id)).toBe(false);
    const deleted = await get('admin', '/api/users', { status: 'deleted' }).expect(200);
    expect(deleted.body.data.map((/** @type {any} */ x) => x.id)).toEqual([u.ravi.id]);
  });

  it('the last active admin cannot delete themselves', async () => {
    await request(app).delete('/api/auth/me').set(auth(u.admin2.token)).send({ password: 'secret123' }).expect(200);
    const r = await request(app).delete('/api/auth/me').set(auth(u.admin.token)).send({ password: 'admin123' }).expect(409);
    expect(r.body.error.code).toBe('conflict');
    await get('admin', '/api/auth/me').expect(200);
  });
});

// Runs last so the extra user doesn't change the counts asserted above.
describe('admin-created users skip approval', () => {
  it('a user created by an admin (web or mobile Users screen) is active and can sign in at once — only self sign-up is pending', async () => {
    const before = await Notification.countDocuments({ event: 'signup_request' });
    const c = await post('admin', '/api/users', {
      name: 'Direct Hire',
      email: 'direct@test.local',
      password: 'secret123',
      role: 'host',
    }).expect(201);
    expect(c.body.user).toMatchObject({ status: 'active', active: true, canSignIn: true });

    const l = await login('direct@test.local', 'secret123').expect(200);
    expect(l.body.token).toBeTruthy();

    const pending = await get('admin', '/api/users', { status: 'pending', limit: 100 }).expect(200);
    expect(pending.body.data.some((/** @type {any} */ x) => x.email === 'direct@test.local')).toBe(false);
    // no approval request is raised for admin-created accounts
    expect(await Notification.countDocuments({ event: 'signup_request' })).toBe(before);
  });
});
