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
/** @type {any} */
let hostApproval;
/** @type {any} */
let Visit;
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

let seq = 0;
/**
 * Multipart check-in with a fresh phone and badge each time (open visits must not clash).
 * @param {Record<string, string>} fields
 */
function checkIn(fields) {
  seq += 1;
  const all = {
    badge: `H${seq}`,
    phone: `90000${String(seq).padStart(5, '0')}`,
    name: `Visitor ${seq}`,
    company: 'Acme Labs',
    purpose: 'Meeting',
    ...fields,
  };
  let r = request(server).post('/api/visits').set(auth(u.security.token));
  for (const [k, v] of Object.entries(all)) r = r.field(k, v);
  return r.attach('photo', jpeg, { filename: 'photo.jpg', contentType: 'image/jpeg' });
}

/** Notifications of a user with the given event. @param {string} who @param {string} event */
async function inboxOf(who, event) {
  const r = await get(who, '/api/notifications', { limit: 100 }).expect(200);
  return r.body.data.filter((/** @type {any} */ n) => n.event === event);
}

/** @param {string} who @returns {Promise<{ socket: any, events: Array<[string, any]> }>} */
function connect(who) {
  return new Promise((resolve, reject) => {
    const socket = ioClient(baseUrl, { auth: { token: u[who].token }, transports: ['websocket'], forceNew: true });
    /** @type {Array<[string, any]>} */
    const events = [];
    socket.onAny((event, payload) => {
      if (event.startsWith('visit:')) events.push([event, payload]);
    });
    socket.on('connect', () => resolve({ socket, events }));
    socket.on('connect_error', reject);
  });
}

const settle = () => new Promise((r) => setTimeout(r, 200));

beforeAll(async () => {
  uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gatebook-host-test-'));
  process.env.NODE_ENV = 'test';
  process.env.UPLOAD_DIR = uploadDir;
  process.env.JWT_SECRET = 'test-jwt';
  process.env.FILE_URL_SECRET = 'test-files';
  process.env.PACE_EMPLOYEES_URL = '';
  process.env.FIREBASE_SERVICE_ACCOUNT = path.join(uploadDir, 'missing.json');

  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('gatebook-host-test'));
  const { bootstrap } = await import('../src/services/bootstrap.js');
  const { createApp } = await import('../src/app.js');
  realtime = await import('../src/realtime.js');
  pushMod = await import('../src/services/push.js');
  hostApproval = await import('../src/services/hostApproval.js');
  ({ Visit } = await import('../src/models/Visit.js'));
  const { User } = await import('../src/models/User.js');
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
    ['ravi', { name: 'Ravi Kumar', role: 'host', phone: '98765 00001', dept: 'Accounts', location: '2nd floor, cabin 3' }],
    ['priya', { name: 'Priya Nair', role: 'host', dept: 'HR' }],
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

describe('check-in with a host', () => {
  it('a picked employee is asked to accept: waiting, host details copied, host notified', async () => {
    const r = await checkIn({ hostId: u.ravi.id, name: 'Anil Rao' }).expect(201);
    const v = r.body.visit;
    expect(v).toMatchObject({
      hostId: u.ravi.id,
      host: 'Ravi Kumar',
      dept: 'Accounts', // defaulted from the employee
      hostPhone: '98765 00001',
      hostLocation: '2nd floor, cabin 3',
      hostStatus: 'waiting',
      hostAt: null,
      hostVia: null,
      escalatedAt: null,
      allowedAt: null,
      allowedBy: null,
    });
    const arrived = await inboxOf('ravi', 'visit_arrived');
    expect(arrived).toHaveLength(1);
    expect(arrived[0]).toMatchObject({ title: '🚪 Anil Rao is at the gate', data: { type: 'visit', id: v.pass } });
    expect(await inboxOf('priya', 'visit_arrived')).toEqual([]);
  });

  it('a typed name is confirmed by phone (manual) and nobody is notified', async () => {
    const r = await checkIn({ host: 'Somebody Else' }).expect(201);
    expect(r.body.visit).toMatchObject({ hostId: null, host: 'Somebody Else', hostStatus: 'manual', allowedAt: null });
  });

  it('an employee who cannot sign in is confirmed by phone too', async () => {
    const r = await checkIn({ hostId: noPwId }).expect(201);
    expect(r.body.visit).toMatchObject({ hostId: noPwId, host: 'No Password', hostStatus: 'manual' });
  });

  it('rejects an unknown host and a missing host', async () => {
    const bad = await checkIn({ hostId: u.security.id }).expect(400); // not a receiver
    expect(bad.body.error).toMatchObject({ code: 'validation', field: 'hostId' });
    const garbage = await checkIn({ hostId: 'nope' }).expect(400);
    expect(garbage.body.error.field).toBe('hostId');
    const none = await checkIn({}).expect(400);
    expect(none.body.error.field).toBe('host');
  });
});

describe('host answers', () => {
  it('only the host (or an admin) can answer; employees still cannot read the register', async () => {
    const v = (await checkIn({ hostId: u.ravi.id })).body.visit;
    await post('priya', `/api/visits/${v.id}/respond`, { status: 'accepted' }).expect(403);
    await post('security', `/api/visits/${v.id}/respond`, { status: 'accepted' }).expect(403);
    await get('ravi', '/api/visits').expect(403);
    await get('ravi', `/api/visits/${v.id}`).expect(403);
    await get('ravi', `/api/visits/mine/${v.id}`).expect(200);
    await get('priya', `/api/visits/mine/${v.id}`).expect(404);
    const bad = await post('ravi', `/api/visits/${v.id}/respond`, { status: 'maybe' }).expect(400);
    expect(bad.body.error.field).toBe('status');
  });

  it('accept → security is told, a second answer is a conflict carrying the current visit', async () => {
    const v = (await checkIn({ hostId: u.ravi.id, name: 'Meena' })).body.visit;
    const r = await post('ravi', `/api/visits/${v.id}/respond`, { status: 'accepted', note: 'Send to my office' }).expect(200);
    expect(r.body.visit).toMatchObject({
      hostStatus: 'accepted',
      hostVia: 'app',
      hostNote: 'Send to my office',
      hostBy: { id: u.ravi.id, name: 'Ravi Kumar' },
      allowedAt: null,
    });
    expect(r.body.visit.hostAt).toBeTypeOf('string');
    const told = (await inboxOf('security', 'visit_reply')).filter((/** @type {any} */ n) => n.data.id === v.id);
    expect(told).toHaveLength(1);
    expect(told[0]).toMatchObject({ title: '✅ Ravi Kumar accepted · send Meena in', body: '“Send to my office”' });
    expect((await inboxOf('viewer', 'visit_reply')).length).toBe(0); // viewers are read-only

    const again = await post('ravi', `/api/visits/${v.id}/respond`, { status: 'declined' }).expect(409);
    expect(again.body.error.code).toBe('conflict');
    expect(again.body.error.visit.hostStatus).toBe('accepted');
  });

  it('lists the host’s own visitors by scope with counts', async () => {
    const r = await get('ravi', '/api/visits/mine', { scope: 'waiting' }).expect(200);
    expect(r.body.data.length).toBeGreaterThan(0);
    expect(r.body.data.every((/** @type {any} */ v) => v.hostId === u.ravi.id && v.hostStatus === 'waiting')).toBe(true);
    expect(r.body.counts.waiting).toBe(r.body.pagination.total);
    expect(r.body.counts.current).toBeGreaterThan(0);
    const priya = await get('priya', '/api/visits/mine').expect(200);
    expect(priya.body.pagination.total).toBe(0);
    await get('ravi', '/api/visits/mine', { scope: 'soon' }).expect(400);
  });
});

describe('security lets visitors in', () => {
  it('after the host accepts: allowed in once, by a guard', async () => {
    const v = (await checkIn({ hostId: u.ravi.id })).body.visit;
    const early = await post('security', `/api/visits/${v.id}/allow`).expect(409);
    expect(early.body.error.message).toMatch(/has not accepted yet/);
    await post('ravi', `/api/visits/${v.id}/respond`, { status: 'accepted' }).expect(200);
    await post('viewer', `/api/visits/${v.id}/allow`).expect(403);
    const r = await post('security', `/api/visits/${v.id}/allow`).expect(200);
    expect(r.body.visit.allowedAt).toBeTypeOf('string');
    expect(r.body.visit.allowedBy).toEqual({ id: u.security.id, name: 'Gate Guard' });
    await post('security', `/api/visits/${v.id}/allow`).expect(409);
  });

  it('declined visitors cannot be let in', async () => {
    const v = (await checkIn({ hostId: u.ravi.id, name: 'Unwanted' })).body.visit;
    await post('ravi', `/api/visits/${v.id}/respond`, { status: 'declined', note: 'Not expecting them' }).expect(200);
    const told = (await inboxOf('security', 'visit_reply')).find((/** @type {any} */ n) => n.data.id === v.id);
    expect(told.title).toBe('❌ Ravi Kumar declined Unwanted');
    const r = await post('security', `/api/visits/${v.id}/allow`, { viaPhone: true }).expect(409);
    expect(r.body.error.message).toMatch(/declined/);
  });

  it('confirmed by phone: for typed hosts, and for app hosts who have not replied', async () => {
    const typed = (await checkIn({ host: 'Front Office' })).body.visit;
    await post('security', `/api/visits/${typed.id}/allow`).expect(409);
    const r = await post('security', `/api/visits/${typed.id}/allow`, { viaPhone: true }).expect(200);
    expect(r.body.visit).toMatchObject({ hostStatus: 'accepted', hostVia: 'phone', hostBy: { id: u.security.id } });
    expect(r.body.visit.allowedAt).toBeTypeOf('string');

    const app = (await checkIn({ hostId: u.priya.id })).body.visit;
    await post('security', `/api/visits/${app.id}/allow`, { viaPhone: true }).expect(200);
    // The host's late answer no longer changes anything.
    await post('priya', `/api/visits/${app.id}/respond`, { status: 'declined' }).expect(409);
  });
});

describe('no reply in time', () => {
  it('the sweep flags it once, tells security, and the visit shows in the attention list', async () => {
    const v = (await checkIn({ hostId: u.priya.id, name: 'Slow Reply' })).body.visit;
    expect(await hostApproval.sweepNoReply()).toBe(0); // not due yet (default 5 minutes)

    await Visit.updateOne({ pass: v.id }, { $set: { inAt: new Date(Date.now() - 6 * 60_000) } });
    expect(await hostApproval.sweepNoReply()).toBe(1);
    expect(await hostApproval.sweepNoReply()).toBe(0);

    const r = await get('security', `/api/visits/${v.id}`).expect(200);
    expect(r.body.visit.escalatedAt).toBeTypeOf('string');
    const told = (await inboxOf('security', 'visit_no_reply')).filter((/** @type {any} */ n) => n.data.id === v.id);
    expect(told).toHaveLength(1);
    expect(told[0].title).toBe('⏰ No reply from Priya Nair');
    expect(told[0].body).toMatch(/^Slow Reply has waited 6m · call the host$/);

    const att = await get('security', '/api/visits/inside', { attention: 'true', limit: 100 }).expect(200);
    const ids = att.body.data.map((/** @type {any} */ x) => x.id);
    expect(ids).toContain(v.id);
    // Attention also combines with search.
    const searched = await get('security', '/api/visits/inside', { attention: 'true', q: 'Slow Reply' }).expect(200);
    expect(searched.body.data.map((/** @type {any} */ x) => x.id)).toEqual([v.id]);

    const log = await get('security', '/api/visits', { status: 'noreply' }).expect(200);
    expect(log.body.data.map((/** @type {any} */ x) => x.id)).toContain(v.id);
  });

  it('respects hostReplyMinutes from settings', async () => {
    const s = (await get('admin', '/api/settings').expect(200)).body.settings;
    expect(s.hostReplyMinutes).toBe(5);
    const bad = await request(server).put('/api/settings').set(auth(u.admin.token)).send({ ...s, hostReplyMinutes: 0 }).expect(400);
    expect(bad.body.error.field).toBe('hostReplyMinutes');
    await request(server).put('/api/settings').set(auth(u.admin.token)).send({ ...s, hostReplyMinutes: 20 }).expect(200);
    // Clients that don't know the setting (nor the escalation matrix behind it) keep it.
    const { hostReplyMinutes: _omit, esc: _esc, ...older } = s;
    const kept = await request(server).put('/api/settings').set(auth(u.admin.token)).send(older).expect(200);
    expect(kept.body.settings.hostReplyMinutes).toBe(20);

    const v = (await checkIn({ hostId: u.ravi.id })).body.visit;
    await Visit.updateOne({ pass: v.id }, { $set: { inAt: new Date(Date.now() - 10 * 60_000) } });
    expect(await hostApproval.sweepNoReply()).toBe(0);
    await Visit.updateOne({ pass: v.id }, { $set: { inAt: new Date(Date.now() - 21 * 60_000) } });
    expect(await hostApproval.sweepNoReply()).toBe(1);
    await request(server).put('/api/settings').set(auth(u.admin.token)).send(s).expect(200);
  });
});

describe('older visits and reporting', () => {
  it('visits stored before host approval read as manual and already let in, and need no attention', async () => {
    const inAt = new Date(Date.now() - 30 * 60_000);
    await Visit.collection.insertOne({
      pass: 'GB-000000-OLD1', badge: 'OLD1', passReturned: null, name: 'Old Timer', phone: '9111111111', phone10: '9111111111',
      company: '', persons: 1, purpose: 'Meeting', host: 'Someone', dept: '', idType: 'Aadhaar', idLast4: '', vehicle: '',
      items: '', notes: '', site: 'Main Gate', inAt, outAt: null, photo: 'missing.jpg', idPhoto: null, guardIn: null,
      guardOut: null, exitNote: '',
    });
    const r = await get('security', '/api/visits/GB-000000-OLD1').expect(200);
    expect(r.body.visit).toMatchObject({ hostStatus: 'manual', hostId: null, allowedAt: inAt.toISOString() });
    const att = await get('security', '/api/visits/inside', { attention: 'true', limit: 100 }).expect(200);
    expect(att.body.data.map((/** @type {any} */ x) => x.id)).not.toContain('GB-000000-OLD1');
    await post('security', '/api/visits/GB-000000-OLD1/allow', { viaPhone: true }).expect(409);
  });

  it('log filters, overview numbers and CSV columns', async () => {
    const declined = await get('security', '/api/visits', { status: 'declined' }).expect(200);
    expect(declined.body.data.length).toBeGreaterThan(0);
    expect(declined.body.data.every((/** @type {any} */ v) => v.hostStatus === 'declined')).toBe(true);
    const waiting = await get('security', '/api/visits', { status: 'waiting', limit: 100 }).expect(200);
    expect(waiting.body.data.every((/** @type {any} */ v) => !v.outAt && !v.allowedAt && v.hostStatus !== 'declined')).toBe(true);

    const ov = (await get('security', '/api/stats/overview').expect(200)).body.overview;
    expect(ov.waitingAtGate).toBe(waiting.body.pagination.total);
    expect(ov.avgHostReplyMinutes).toBeTypeOf('number');
    expect(ov.noReplyToday).toBe(2);

    const csv = await get('security', '/api/visits/export.csv').expect(200);
    // trim() also drops the UTF-8 BOM at the start.
    const [header, ...rows] = csv.text.trim().split('\r\n');
    expect(header).toContain('"Host reply","Host replied at","Host message","No-reply alert","Allowed in at","Allowed in by"');
    expect(rows.some((row) => row.includes('"Accepted (confirmed by phone)"'))).toBe(true);
    expect(rows.some((row) => row.includes('"Declined"') && row.includes('"Not expecting them"'))).toBe(true);
  });
});

describe('realtime', () => {
  it('visit events reach the gate and the visited host only', async () => {
    const ravi = await connect('ravi');
    const priya = await connect('priya');
    const guard = await connect('security');
    try {
      const v = (await checkIn({ hostId: u.ravi.id })).body.visit;
      await post('ravi', `/api/visits/${v.id}/respond`, { status: 'accepted' }).expect(200);
      await settle();
      const mine = (/** @type {Array<[string, any]>} */ evs) => evs.filter(([, p]) => p.visit.id === v.id).map(([e]) => e);
      expect(mine(ravi.events)).toEqual(['visit:created', 'visit:updated']);
      expect(mine(guard.events)).toEqual(['visit:created', 'visit:updated']);
      expect(priya.events).toEqual([]);
    } finally {
      for (const c of [ravi, priya, guard]) c.socket.close();
    }
  });
});
