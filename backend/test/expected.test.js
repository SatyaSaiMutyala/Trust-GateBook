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
let realtime;
/** @type {any} */
let pushMod;
/** @type {Record<string, { token: string, id: string }>} */
const u = {};

/** @param {string} t */
const auth = (t) => ({ Authorization: `Bearer ${t}` });
/** @param {string} who @param {string} url @param {object} [body] */
const post = (who, url, body = {}) => request(server).post(url).set(auth(u[who].token)).send(body);
/** @param {string} who @param {string} url @param {object} [body] */
const patch = (who, url, body = {}) => request(server).patch(url).set(auth(u[who].token)).send(body);
/** @param {string} who @param {string} url @param {Record<string, unknown>} [query] */
const get = (who, url, query = {}) => request(server).get(url).query(query).set(auth(u[who].token));

const inHours = (/** @type {number} */ h) => new Date(Date.now() + h * 3_600_000).toISOString();

/** A visitor expected in a minute, for Ravi, registered by `who`. @param {string} who @param {object} [extra] */
const expectVisitor = (who, extra = {}) =>
  post(who, '/api/expected', {
    kind: 'visitor',
    name: 'Dr. Meera Iyer',
    phone: '90000 88888',
    company: 'Siemens',
    purpose: 'Meeting',
    hostId: u.ravi.id,
    // A minute from now: still 'today' whenever the tests run.
    expectedAt: inHours(0.02),
    ...extra,
  });

let seq = 0;
/** @param {Record<string, string>} fields */
function checkIn(fields) {
  seq += 1;
  const all = { badge: `E${seq}`, phone: `91000${String(seq).padStart(5, '0')}`, name: `Visitor ${seq}`, purpose: 'Meeting', ...fields };
  let r = request(server).post('/api/visits').set(auth(u.security.token));
  for (const [k, v] of Object.entries(all)) r = r.field(k, v);
  return r.attach('photo', jpeg, { filename: 'photo.jpg', contentType: 'image/jpeg' });
}

/** @param {string} who @param {string} event */
async function inboxOf(who, event) {
  // Notifications are stored in the background after the response; give them a moment to land.
  await new Promise((r) => setTimeout(r, 150));
  const r = await get(who, '/api/notifications', { limit: 100 }).expect(200);
  return r.body.data.filter((/** @type {any} */ n) => n.event === event);
}

beforeAll(async () => {
  uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gatebook-expected-test-'));
  process.env.NODE_ENV = 'test';
  process.env.UPLOAD_DIR = uploadDir;
  process.env.JWT_SECRET = 'test-jwt';
  process.env.FILE_URL_SECRET = 'test-files';
  process.env.PACE_EMPLOYEES_URL = '';
  process.env.FIREBASE_SERVICE_ACCOUNT = path.join(uploadDir, 'missing.json');

  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('gatebook-expected-test'));
  const { bootstrap } = await import('../src/services/bootstrap.js');
  const { createApp } = await import('../src/app.js');
  realtime = await import('../src/realtime.js');
  pushMod = await import('../src/services/push.js');
  await bootstrap();
  pushMod.setPushSenderForTests(null);

  server = http.createServer(createApp());
  realtime.initRealtime(server);
  await new Promise((r) => server.listen(0, '127.0.0.1', () => r(undefined)));
  baseUrl = `http://127.0.0.1:${/** @type {import('node:net').AddressInfo} */ (server.address()).port}`;
  jpeg = await sharp({ create: { width: 200, height: 150, channels: 3, background: '#445566' } }).jpeg().toBuffer();

  const login = await request(server).post('/api/auth/login').send({ email: 'admin@gatebook.local', password: 'admin123' });
  u.admin = { token: login.body.token, id: login.body.user.id };
  const people = [
    ['security', { name: 'Gate Guard', role: 'security' }],
    ['viewer', { name: 'Viewer', role: 'viewer' }],
    ['ravi', { name: 'Ravi Kumar', role: 'host', dept: 'Accounts' }],
    ['priya', { name: 'Priya Nair', role: 'host', dept: 'HR' }],
    ['kiran', { name: 'Dr. Kiran', role: 'host', dept: 'Laboratory' }],
    ['blocked', { name: 'No Rights', role: 'host', canPreRegister: false }],
  ];
  for (const [key, data] of people) {
    const email = `${key}@test.local`;
    const c = await request(server).post('/api/users').set(auth(u.admin.token)).send({ email, password: 'secret123', ...data }).expect(201);
    const l = await request(server).post('/api/auth/login').send({ email, password: 'secret123' });
    u[String(key)] = { token: l.body.token, id: c.body.user.id };
  }
});

afterAll(async () => {
  pushMod?.setPushSenderForTests(null);
  await realtime?.closeRealtime();
  await new Promise((r) => (server ? server.close(() => r(undefined)) : r(undefined)));
  await mongoose.disconnect();
  await mongod?.stop();
  await fs.rm(uploadDir, { recursive: true, force: true });
});

describe('registering', () => {
  it('an employee registers their own visitor: pre-approved by default, security is told', async () => {
    const r = await expectVisitor('ravi').expect(201);
    const e = r.body.expected;
    expect(e.code).toMatch(/^EX-\d{6}-[A-Z2-9]{4}$/);
    expect(e).toMatchObject({
      kind: 'visitor',
      name: 'Dr. Meera Iyer',
      host: { id: u.ravi.id, name: 'Ravi Kumar' },
      createdBy: { id: u.ravi.id },
      preapproved: true,
      status: 'expected',
      state: 'expected',
      site: 'Main Gate',
    });
    const told = (await inboxOf('security', 'expected_new')).filter((/** @type {any} */ n) => n.data.id === e.code);
    expect(told).toHaveLength(1);
    expect(told[0].title).toMatch(/^📅 Expected: Dr\. Meera Iyer today /);
    expect(await inboxOf('ravi', 'expected_new')).toHaveLength(0); // registered it themselves
  });

  it('security registers for an employee: the employee, receiving contact and others are told', async () => {
    const r = await expectVisitor('security', { contactId: u.kiran.id, alsoIds: [u.priya.id, u.ravi.id], preapproved: false }).expect(201);
    const e = r.body.expected;
    expect(e.contact).toEqual({ id: u.kiran.id, name: 'Dr. Kiran' });
    expect(e.also).toEqual([{ id: u.priya.id, name: 'Priya Nair' }]); // the host isn't repeated
    for (const who of ['ravi', 'kiran', 'priya']) {
      const n = (await inboxOf(who, 'expected_new')).find((/** @type {any} */ x) => x.data.id === e.code);
      expect(n.body).toBe('Registered by Gate Guard for Ravi Kumar');
    }
  });

  it('validates the form and who may register', async () => {
    const noName = await expectVisitor('ravi', { name: '' }).expect(400);
    expect(noName.body.error.field).toBe('name');
    const badHost = await expectVisitor('ravi', { hostId: u.security.id }).expect(400);
    expect(badHost.body.error.field).toBe('hostId');
    const badPurpose = await expectVisitor('ravi', { purpose: 'Party' }).expect(400);
    expect(badPurpose.body.error.field).toBe('purpose');
    const badUntil = await expectVisitor('ravi', { untilAt: inHours(-1) }).expect(400);
    expect(badUntil.body.error.field).toBe('untilAt');
    const past = await expectVisitor('ravi', { expectedAt: inHours(-30) }).expect(400);
    expect(past.body.error.field).toBe('expectedAt');
    const noBoxes = await post('ravi', '/api/expected', { kind: 'delivery', company: 'Sysmex', hostId: u.ravi.id, expectedAt: inHours(2) }).expect(400);
    expect(noBoxes.body.error.field).toBe('boxes');
    await expectVisitor('viewer').expect(403);
    const blocked = await expectVisitor('blocked').expect(403);
    expect(blocked.body.error.message).toMatch(/pre-register/);
  });

  it('admins switch the right on and off per person', async () => {
    const r = await request(server).patch(`/api/users/${u.blocked.id}`).set(auth(u.admin.token)).send({ canPreRegister: true }).expect(200);
    expect(r.body.user.canPreRegister).toBe(true);
    await expectVisitor('blocked').expect(201);
    await request(server).patch(`/api/users/${u.blocked.id}`).set(auth(u.admin.token)).send({ canPreRegister: false }).expect(200);
  });
});

describe('lists and scope', () => {
  it('employees see only what concerns them; the gate sees everything', async () => {
    const mine = (await expectVisitor('priya', { hostId: u.priya.id, name: 'Only Priya' }).expect(201)).body.expected;
    const ravi = await get('ravi', '/api/expected', { limit: 100 }).expect(200);
    expect(ravi.body.data.map((/** @type {any} */ e) => e.code)).not.toContain(mine.code);
    await get('ravi', `/api/expected/${mine.code}`).expect(404);
    const gate = await get('security', '/api/expected', { limit: 100 }).expect(200);
    expect(gate.body.data.map((/** @type {any} */ e) => e.code)).toContain(mine.code);
    const today = await get('security', '/api/expected', { when: 'today', limit: 100 }).expect(200);
    expect(today.body.counts.today).toBeGreaterThan(0);
    const upcoming = await get('ravi', '/api/expected', { when: 'upcoming' }).expect(200);
    expect(upcoming.body.data.every((/** @type {any} */ e) => e.status === 'expected')).toBe(true);
    await get('security', '/api/expected', { when: 'soon' }).expect(400);
  });

  it('matches today’s expected visitor by mobile number for check-in', async () => {
    const r = await get('security', '/api/expected/match', { phone: '+91 90000-88888' }).expect(200);
    expect(r.body.expected).toMatchObject({ name: 'Dr. Meera Iyer', status: 'expected' });
    const none = await get('security', '/api/expected/match', { phone: '9123456780' }).expect(200);
    expect(none.body.expected).toBeNull();
    await get('ravi', '/api/expected/match', { phone: '9000088888' }).expect(403);
  });
});

describe('arriving', () => {
  it('pre-approved visitor checked in from the entry: no host question, entry closed, people told', async () => {
    const e = (await expectVisitor('security', { name: 'Pre Approved', phone: '9222222222', preapproved: true }).expect(201)).body.expected;
    const r = await checkIn({ hostId: u.ravi.id, expectedId: e.code, name: e.name, phone: e.phone }).expect(201);
    expect(r.body.visit).toMatchObject({ expectedId: e.code, hostStatus: 'accepted', hostVia: 'preapproved', allowedAt: null });
    const after = (await get('security', `/api/expected/${e.code}`).expect(200)).body.expected;
    expect(after).toMatchObject({ status: 'arrived', state: 'arrived', visitId: r.body.visit.id, arrivedBy: { id: u.security.id } });
    expect((await inboxOf('ravi', 'visit_arrived')).some((/** @type {any} */ n) => n.data.id === r.body.visit.id)).toBe(false);
    const arrived = (await inboxOf('ravi', 'expected_arrived')).find((/** @type {any} */ n) => n.data.id === e.code);
    expect(arrived.data.type).toBe('expected');
    expect(arrived.title).toBe('✅ Pre Approved has arrived');
    // Security still lets them in, from the attention list.
    const att = await get('security', '/api/visits/inside', { attention: 'true', limit: 100 }).expect(200);
    expect(att.body.data.map((/** @type {any} */ v) => v.id)).toContain(r.body.visit.id);
    // The entry can't be used twice.
    const again = await checkIn({ hostId: u.ravi.id, expectedId: e.code }).expect(400);
    expect(again.body.error.field).toBe('expectedId');
  });

  it('not pre-approved (or a different host): the host is asked as usual', async () => {
    const e = (await expectVisitor('security', { name: 'Ask First', phone: '9333333333', preapproved: false }).expect(201)).body.expected;
    const r = await checkIn({ hostId: u.ravi.id, expectedId: e.code }).expect(201);
    expect(r.body.visit.hostStatus).toBe('waiting');
    expect((await inboxOf('ravi', 'visit_arrived')).some((/** @type {any} */ n) => n.data.id === r.body.visit.id)).toBe(true);
    const e2 = (await expectVisitor('ravi', { name: 'Other Host', phone: '9444444444', preapproved: true }).expect(201)).body.expected;
    const r2 = await checkIn({ hostId: u.priya.id, expectedId: e2.code }).expect(201);
    expect(r2.body.visit.hostStatus).toBe('waiting'); // pre-approval was for Ravi, not Priya
  });

  it('deliveries are received by security, once', async () => {
    const d = (
      await post('kiran', '/api/expected', {
        kind: 'delivery', company: 'Sysmex India', boxes: 6, challanType: 'Tax invoice', challanNo: 'sys/inv/88127',
        hostId: u.kiran.id, expectedAt: inHours(2), preapproved: true,
      }).expect(201)
    ).body.expected;
    expect(d).toMatchObject({ kind: 'delivery', boxes: 6, challanNo: 'SYS/INV/88127', preapproved: false });
    await post('ravi', `/api/expected/${d.code}/received`).expect(403);
    const r = await post('security', `/api/expected/${d.code}/received`).expect(200);
    expect(r.body.expected).toMatchObject({ status: 'arrived', arrivedBy: { name: 'Gate Guard' } });
    const n = (await inboxOf('kiran', 'expected_arrived')).find((/** @type {any} */ x) => x.data.id === d.code);
    expect(n.title).toBe('📦 Delivery from Sysmex India received');
    await post('security', `/api/expected/${d.code}/received`).expect(409);
    const v = (await expectVisitor('ravi').expect(201)).body.expected;
    await post('security', `/api/expected/${v.code}/received`).expect(409); // visitors are checked in
  });
});

describe('changing and cancelling', () => {
  it('the host or whoever registered it edits and cancels; others cannot', async () => {
    const e = (await expectVisitor('security', { name: 'To Change' }).expect(201)).body.expected;
    await patch('priya', `/api/expected/${e.code}`, { name: 'Nope' }).expect(404); // not concerned → not visible
    const r = await patch('ravi', `/api/expected/${e.code}`, { name: 'Changed Name', untilAt: inHours(3) }).expect(200);
    expect(r.body.expected).toMatchObject({ name: 'Changed Name', host: { id: u.ravi.id } });
    const c = await post('ravi', `/api/expected/${e.code}/cancel`).expect(200);
    expect(c.body.expected).toMatchObject({ status: 'cancelled', state: 'cancelled', cancelledBy: { id: u.ravi.id } });
    expect((await inboxOf('security', 'expected_cancelled')).some((/** @type {any} */ n) => n.data.id === e.code)).toBe(true);
    await patch('ravi', `/api/expected/${e.code}`, { name: 'Again' }).expect(409);
    await post('ravi', `/api/expected/${e.code}/cancel`).expect(409);
    const used = await checkIn({ hostId: u.ravi.id, expectedId: e.code }).expect(400);
    expect(used.body.error.message).toMatch(/cancelled/);
  });
});

describe('state, overview, settings, realtime', () => {
  it('state: on time, late after its window, missed on a later day', async () => {
    const { expectedState } = await import('../src/services/serializeExpected.js');
    const at = new Date('2026-10-19T05:00:00Z'); // 10:30 am IST
    const e = { status: 'expected', expectedAt: at, untilAt: null };
    expect(expectedState(e, at.getTime() + 3_600_000)).toBe('expected');
    expect(expectedState(e, at.getTime() + 3 * 3_600_000)).toBe('late');
    expect(expectedState(e, at.getTime() + 30 * 3_600_000)).toBe('missed');
    expect(expectedState({ ...e, untilAt: new Date(at.getTime() + 5 * 3_600_000) }, at.getTime() + 3 * 3_600_000)).toBe('expected');
    expect(expectedState({ ...e, status: 'arrived' }, at.getTime())).toBe('arrived');
  });

  it('overview counts today’s open entries; the pre-approval default is a setting', async () => {
    const ov = (await get('security', '/api/stats/overview').expect(200)).body.overview;
    expect(ov.expectedToday).toBeGreaterThan(0);
    const s = (await get('admin', '/api/settings').expect(200)).body.settings;
    expect(s.expectedPreapproved).toBe(true);
    await request(server).put('/api/settings').set(auth(u.admin.token)).send({ ...s, expectedPreapproved: false }).expect(200);
    const e = (await expectVisitor('ravi').expect(201)).body.expected;
    expect(e.preapproved).toBe(false);
    const explicit = (await expectVisitor('ravi', { preapproved: true }).expect(201)).body.expected;
    expect(explicit.preapproved).toBe(true); // the form can still choose
    await request(server).put('/api/settings').set(auth(u.admin.token)).send(s).expect(200);
  });

  it('expected:changed reaches the gate and the people concerned only', async () => {
    /** @param {string} who */
    const connect = (who) =>
      new Promise((resolve, reject) => {
        const socket = ioClient(baseUrl, { auth: { token: u[who].token }, transports: ['websocket'], forceNew: true });
        /** @type {string[]} */
        const events = [];
        socket.on('expected:changed', (/** @type {any} */ p) => events.push(p.expected.code));
        socket.on('connect', () => resolve({ socket, events }));
        socket.on('connect_error', reject);
      });
    const [ravi, priya, guard] = /** @type {any[]} */ (await Promise.all(['ravi', 'priya', 'security'].map(connect)));
    try {
      const e = (await expectVisitor('ravi', { name: 'Live One' }).expect(201)).body.expected;
      await new Promise((r) => setTimeout(r, 200));
      expect(ravi.events).toContain(e.code);
      expect(guard.events).toContain(e.code);
      expect(priya.events).not.toContain(e.code);
    } finally {
      for (const c of [ravi, priya, guard]) c.socket.close();
    }
  });
});
