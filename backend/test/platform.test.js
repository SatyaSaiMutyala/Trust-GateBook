import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** @type {MongoMemoryServer} */
let mongod;
/** @type {http.Server} */
let server;
/** @type {string} */
let uploadDir;
/** @type {Buffer} */
let jpeg;
/** @type {any} */
let realtime;
/** @type {any} */
let pushMod;
/** @type {any} */
let engine;
/** @type {any} */
let models;
/** @type {Record<string, { token: string, id: string }>} */
const u = {};

/** @param {string} t */
const auth = (t) => ({ Authorization: `Bearer ${t}` });
/** @param {string} who @param {string} url @param {object} [body] */
const post = (who, url, body = {}) => request(server).post(url).set(auth(u[who].token)).send(body);
/** @param {string} who @param {string} url @param {object} [body] */
const patch = (who, url, body = {}) => request(server).patch(url).set(auth(u[who].token)).send(body);
/** @param {string} who @param {string} url @param {object} [body] */
const put = (who, url, body = {}) => request(server).put(url).set(auth(u[who].token)).send(body);
/** @param {string} who @param {string} url @param {Record<string, unknown>} [query] */
const get = (who, url, query = {}) => request(server).get(url).query(query).set(auth(u[who].token));

let seq = 0;
/** @param {Record<string, string>} fields @param {{ photo?: boolean }} [opts] */
function checkIn(fields, opts = {}) {
  seq += 1;
  const all = {
    badge: `P${seq}`,
    phone: `92000${String(seq).padStart(5, '0')}`,
    name: `Visitor ${seq}`,
    purpose: 'Meeting',
    ...fields,
  };
  let r = request(server).post('/api/visits').set(auth(u.security.token));
  for (const [k, v] of Object.entries(all)) r = r.field(k, v);
  return opts.photo === false ? r : r.attach('photo', jpeg, { filename: 'photo.jpg', contentType: 'image/jpeg' });
}

/** @param {Record<string, string>} fields @param {{ cover?: boolean, person?: boolean }} [opts] */
function logMail(fields, opts = {}) {
  let r = request(server).post('/api/mail').set(auth(u.security.token));
  const all = { kind: 'Courier', sender: 'Amazon', broughtBy: 'Delivery man', ...fields };
  for (const [k, v] of Object.entries(all)) r = r.field(k, v);
  if (opts.cover !== false) {
    r = r.attach('cover', jpeg, { filename: 'c.jpg', contentType: 'image/jpeg' });
    r = r.attach('coverBack', jpeg, { filename: 'b.jpg', contentType: 'image/jpeg' });
  }
  if (opts.person !== false) r = r.attach('person', jpeg, { filename: 'p.jpg', contentType: 'image/jpeg' });
  return r;
}

/** @param {string} who @param {string} [event] */
async function inboxOf(who, event) {
  const r = await get(who, '/api/notifications', { limit: 100 }).expect(200);
  return r.body.data.filter((/** @type {any} */ n) => !event || n.event === event);
}
const settingsNow = async () => (await get('admin', '/api/settings').expect(200)).body.settings;

beforeAll(async () => {
  uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gatebook-platform-test-'));
  process.env.NODE_ENV = 'test';
  process.env.UPLOAD_DIR = uploadDir;
  process.env.JWT_SECRET = 'test-jwt';
  process.env.FILE_URL_SECRET = 'test-files';
  process.env.PACE_EMPLOYEES_URL = '';
  process.env.FIREBASE_SERVICE_ACCOUNT = path.join(uploadDir, 'missing.json');

  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('gatebook-platform-test'));
  const { bootstrap } = await import('../src/services/bootstrap.js');
  const { createApp } = await import('../src/app.js');
  realtime = await import('../src/realtime.js');
  pushMod = await import('../src/services/push.js');
  engine = await import('../src/services/escalation.js');
  models = {
    Visit: (await import('../src/models/Visit.js')).Visit,
    MailItem: (await import('../src/models/MailItem.js')).MailItem,
    Escalation: (await import('../src/models/Escalation.js')).Escalation,
  };
  await bootstrap();
  pushMod.setPushSenderForTests(null);

  server = http.createServer(createApp());
  realtime.initRealtime(server);
  await new Promise((r) => server.listen(0, '127.0.0.1', () => r(undefined)));
  jpeg = await sharp({ create: { width: 200, height: 150, channels: 3, background: '#445566' } })
    .jpeg()
    .toBuffer();

  const login = await request(server)
    .post('/api/auth/login')
    .send({ email: 'admin@gatebook.local', password: 'admin123' });
  u.admin = { token: login.body.token, id: login.body.user.id };
  const people = [
    ['security', { name: 'Gate Guard', role: 'security' }],
    [
      'supervisor',
      { name: 'Ramana Supervisor', role: 'security', isSupervisor: true, designation: 'Security supervisor' },
    ],
    ['viewer', { name: 'Viewer', role: 'viewer' }],
    ['head', { name: 'Anil Head', role: 'host', designation: 'Department head' }],
    ['ravi', { name: 'Ravi Kumar', role: 'host', dept: 'Accounts' }],
    ['priya', { name: 'Priya Nair', role: 'host' }],
  ];
  for (const [key, data] of people) {
    const email = `${key}@platform.local`;
    const c = await request(server)
      .post('/api/users')
      .set(auth(u.admin.token))
      .send({ email, password: 'secret123', ...data })
      .expect(201);
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

describe('module access', () => {
  it('roles start with their default modules; admins have everything', async () => {
    const me = async (/** @type {string} */ who) => (await get(who, '/api/auth/me').expect(200)).body.user;
    const all = ['track', 'visitors', 'expected', 'post', 'material', 'keys', 'incidents', 'patrol', 'gen'];
    expect((await me('admin')).modules).toEqual(all);
    expect((await me('security')).modules).toEqual(all);
    expect((await me('ravi')).modules).toEqual(['expected', 'post', 'material', 'incidents']);
    const defs = (await get('admin', '/api/users/modules').expect(200)).body.modules;
    expect(defs.map((/** @type {any} */ m) => m.key)).toEqual(all);
    expect(defs.find((/** @type {any} */ m) => m.key === 'post').text.host[0]).toBe('My post');
  });

  it('an unticked module is refused by the server; personal actions still work', async () => {
    // A guard without Post room and Overview.
    const r = await patch('admin', `/api/users/${u.security.id}`, { modules: ['visitors', 'expected', 'cameras'] }).expect(
      200,
    );
    expect(r.body.user.modules).toEqual(['visitors', 'expected']); // unknown keys dropped
    const denied = await get('security', '/api/mail').expect(403);
    expect(denied.body.error.message).toBe('You do not have access to this module. Ask the administrator.');
    await get('security', '/api/stats/overview').expect(403);
    await get('security', '/api/visits/inside').expect(200);

    // An employee without Post room: no list, but their own item opens and can be confirmed.
    await patch('admin', `/api/users/${u.security.id}`, { modules: ['track', 'visitors', 'expected', 'post'] }).expect(
      200,
    );
    const item = (await logMail({ recipientId: u.ravi.id }).expect(201)).body.item;
    await post('security', `/api/mail/${item.id}/handover`, { collectedBy: 'Ravi Kumar' }).expect(200);
    await patch('admin', `/api/users/${u.ravi.id}`, { modules: ['expected'] }).expect(200);
    await get('ravi', '/api/mail', { recipient: 'me' }).expect(403);
    await get('ravi', `/api/mail/${item.id}`).expect(200);
    await post('ravi', `/api/mail/${item.id}/confirm`, { ok: true }).expect(200);
    // Without Expected, the expected list is refused.
    await patch('admin', `/api/users/${u.ravi.id}`, { modules: [] }).expect(200);
    await get('ravi', '/api/expected').expect(403);
    // My visitors always works.
    await get('ravi', '/api/visits/mine').expect(200);
    await patch('admin', `/api/users/${u.ravi.id}`, { modules: ['expected', 'post'] }).expect(200);
  });

  it('changing the role resets ticks to the new role’s defaults', async () => {
    const c = await post('admin', '/api/users', {
      email: 'mover@platform.local',
      password: 'secret123',
      name: 'Mover',
      role: 'host',
      modules: ['post'],
    }).expect(201);
    expect(c.body.user.modules).toEqual(['post']);
    const r = await patch('admin', `/api/users/${c.body.user.id}`, { role: 'security' }).expect(200);
    expect(r.body.user.modules).toEqual(['track', 'visitors', 'expected', 'post', 'material', 'keys', 'incidents', 'patrol', 'gen']);
  });
});

describe('hierarchy', () => {
  it('reports-to is saved, cycles and self-reports are refused, the org chart lists everyone', async () => {
    await patch('admin', `/api/users/${u.ravi.id}`, { reportsTo: u.head.id }).expect(200);
    await patch('admin', `/api/users/${u.security.id}`, { reportsTo: u.supervisor.id }).expect(200);
    const self = await patch('admin', `/api/users/${u.head.id}`, { reportsTo: u.head.id }).expect(400);
    expect(self.body.error.field).toBe('reportsTo');
    const loop = await patch('admin', `/api/users/${u.head.id}`, { reportsTo: u.ravi.id }).expect(400);
    expect(loop.body.error.message).toBe(
      'Ravi Kumar already reports to this person (directly or through others). Pick someone higher up.',
    );
    await patch('admin', `/api/users/${u.head.id}`, { reportsTo: 'nope' }).expect(400);

    const org = (await get('admin', '/api/users/org').expect(200)).body.users;
    const ravi = org.find((/** @type {any} */ x) => x.id === u.ravi.id);
    expect(ravi).toMatchObject({ reportsTo: u.head.id, role: 'host', active: true });
    expect(org.find((/** @type {any} */ x) => x.id === u.supervisor.id)).toMatchObject({
      isSupervisor: true,
      designation: 'Security supervisor',
    });
    await get('security', '/api/users/org').expect(403);
  });

  it('employees cannot be gate supervisors', async () => {
    const r = await patch('admin', `/api/users/${u.priya.id}`, { isSupervisor: true }).expect(200);
    expect(r.body.user.isSupervisor).toBe(false);
  });
});

describe('escalation engine', () => {
  it('the visitor matrix: guards at 5 min (no-reply alarm), then the host’s manager', async () => {
    const v = (await checkIn({ hostId: u.ravi.id, name: 'Waiting Long' }).expect(201)).body.visit;
    const t0 = new Date(v.inAt).getTime();
    expect((await engine.runMatrix('visitor', { nowMs: t0 + 4 * 60_000 })).sent).toBe(0);

    const r1 = await engine.runMatrix('visitor', { nowMs: t0 + 6 * 60_000 });
    expect(r1).toMatchObject({ noReply: 1 });
    const noReply = (await inboxOf('security', 'visit_no_reply')).filter((/** @type {any} */ n) => n.data.id === v.id);
    expect(noReply).toHaveLength(1);
    expect(noReply[0].alarm).toBe(true);
    // The supervisor is a manager (the guard reports to them), not a guard on duty.
    expect((await inboxOf('supervisor', 'visit_no_reply')).some((/** @type {any} */ n) => n.data.id === v.id)).toBe(
      false,
    );
    // Nothing goes out twice.
    expect((await engine.runMatrix('visitor', { nowMs: t0 + 7 * 60_000 })).sent).toBe(0);

    await engine.runMatrix('visitor', { nowMs: t0 + 16 * 60_000 });
    const toHead = (await inboxOf('head', 'escalation')).filter((/** @type {any} */ n) => n.data.id === v.id);
    expect(toHead).toHaveLength(1);
    expect(toHead[0].title).toBe("⏰ Visitor still waiting: host's manager");
    // The manager can open the visit from that notification; someone outside the chain cannot.
    await get('head', `/api/visits/mine/${v.id}`).expect(200);
    await get('priya', `/api/visits/mine/${v.id}`).expect(404);

    const log = (await get('admin', '/api/escalations', { matrix: 'visitor' }).expect(200)).body.data.filter(
      (/** @type {any} */ e) => e.ref === v.id,
    );
    expect(log.map((/** @type {any} */ e) => [e.step, e.target, e.targetName])).toEqual([
      [1, 'l1', 'Level 1: Anil Head'],
      [0, 'guards', 'Guards on duty'],
    ]);
    expect(log[1].recipients.map((/** @type {any} */ r) => r.name)).toContain('Gate Guard');
    expect(log[1].recipients.map((/** @type {any} */ r) => r.name)).not.toContain('Ramana Supervisor');
    await post('ravi', `/api/visits/${v.id}/respond`, { status: 'accepted' }).expect(200);
    await post('security', `/api/visits/${v.id}/exit`, {}).expect(200);
  });

  it('nobody at a level → admins, with a note; repeats go out once per interval', async () => {
    const s = await settingsNow();
    await put('admin', '/api/settings', {
      ...s,
      esc: {
        ...s.esc,
        visitor: [
          { after: 1, to: 'l2', repeat: 0, alarm: false, label: '' },
          { after: 2, to: 'supervisors', repeat: 5, alarm: false, label: 'Still waiting' },
        ],
      },
    }).expect(200);
    const v = (await checkIn({ hostId: u.ravi.id }).expect(201)).body.visit;
    const t0 = new Date(v.inAt).getTime();
    await engine.runMatrix('visitor', { nowMs: t0 + 90_000 });
    const l2 = await models.Escalation.findOne({ ref: v.id, step: 0 }).lean();
    expect(l2).toMatchObject({ targetName: 'Level 2', note: 'Nobody set at Level 2: sent to admins' });
    expect(l2.recipients.map((/** @type {any} */ r) => r.id)).toEqual([u.admin.id]);
    // No guards step any more → no "no reply" flag on the visit.
    expect((await get('security', `/api/visits/${v.id}`).expect(200)).body.visit.escalatedAt).toBeNull();

    await engine.runMatrix('visitor', { nowMs: t0 + 3 * 60_000 }); // repeat #1
    await engine.runMatrix('visitor', { nowMs: t0 + 4 * 60_000 }); // same interval: nothing
    await engine.runMatrix('visitor', { nowMs: t0 + 8 * 60_000 }); // repeat #2
    const reps = await models.Escalation.find({ ref: v.id, step: 1 }).sort({ occurrence: 1 }).lean();
    expect(reps.map((/** @type {any} */ e) => e.occurrence)).toEqual([1, 2]);
    expect(reps[0].recipients.map((/** @type {any} */ r) => r.name)).toEqual(['Ramana Supervisor']);
    await put('admin', '/api/settings', s).expect(200);
    await post('security', `/api/visits/${v.id}/exit`, {}).expect(200);
  });

  it('post not collected reminds the receiver, then their manager; overstay tells guards and the host', async () => {
    const item = (await logMail({ recipientId: u.ravi.id, sender: 'Bank' }).expect(201)).body.item;
    const t0 = new Date(item.receivedAt).getTime();
    await engine.runMatrix('mail', { nowMs: t0 + 241 * 60_000 });
    expect(
      (await inboxOf('ravi', 'escalation')).some(
        (/** @type {any} */ n) => n.data.id === item.id && n.title === '📬 Reminder: post waiting for you',
      ),
    ).toBe(true);
    await engine.runMatrix('mail', { nowMs: t0 + 1441 * 60_000 });
    expect((await inboxOf('head', 'escalation')).some((/** @type {any} */ n) => n.data.id === item.id)).toBe(true);
    await post('security', `/api/mail/${item.id}/handover`, { collectedBy: 'Ravi' }).expect(200);
    const before = await models.Escalation.countDocuments({ ref: item.id });
    await engine.runMatrix('mail', { nowMs: t0 + 4321 * 60_000 });
    expect(await models.Escalation.countDocuments({ ref: item.id })).toBe(before); // handed over: stops

    const v = (await checkIn({ hostId: u.priya.id, name: 'Long Stay' }).expect(201)).body.visit;
    const inAt = new Date(v.inAt).getTime();
    await engine.runMatrix('overstay', { nowMs: inAt + 4 * 3_600_000 + 60_000 });
    expect(
      (await inboxOf('priya', 'escalation')).some(
        (/** @type {any} */ n) => n.data.id === v.id && /still inside/.test(n.title),
      ),
    ).toBe(true);
    expect((await inboxOf('security', 'escalation')).some((/** @type {any} */ n) => n.data.id === v.id)).toBe(true);
    await post('security', `/api/visits/${v.id}/exit`, {}).expect(200);
  });

  it('steps older than a day are not sent after downtime', () => {
    const step = { after: 10, to: 'guards', repeat: 0, alarm: false, label: '' };
    expect(engine.dueOccurrence(step, 0, 9 * 60_000)).toBe(0);
    expect(engine.dueOccurrence(step, 0, 11 * 60_000)).toBe(1);
    expect(engine.dueOccurrence(step, 0, 26 * 3_600_000)).toBe(0);
    expect(engine.dueOccurrence({ ...step, repeat: 60 }, 0, 26 * 3_600_000)).toBe(26);
  });

  it('the log is admin-only, filters by days and exports CSV', async () => {
    await get('security', '/api/escalations').expect(403);
    await get('admin', '/api/escalations', { days: 3 }).expect(400);
    const r = await get('admin', '/api/escalations', { days: 1 }).expect(200);
    expect(r.body.pagination.total).toBeGreaterThan(0);
    const csv = await get('admin', '/api/escalations/export.csv').expect(200);
    expect(csv.text).toContain('"Date & time","Module","Gate","Item","Escalation","Sent to","People","Note"');
    expect(csv.text).toContain('"Host has not replied"');
  });

  it('matrix validation and the host reply minutes follow the guards step', async () => {
    const s = await settingsNow();
    expect(s.esc.visitor[0]).toMatchObject({ after: 5, to: 'guards', alarm: true });
    const bad = await put('admin', '/api/settings', { ...s, esc: { visitor: [{ after: 5, to: 'everyone' }] } }).expect(
      400,
    );
    expect(bad.body.error.code).toBe('validation');
    const moved = await put('admin', '/api/settings', { ...s, esc: { visitor: [{ after: 9, to: 'guards' }] } }).expect(
      200,
    );
    expect(moved.body.settings.hostReplyMinutes).toBe(9);
    expect(moved.body.settings.esc.mail).toEqual(s.esc.mail); // other matrices kept
    await put('admin', '/api/settings', s).expect(200);
  });
});

describe('branding', () => {
  it('company details are saved; the logo is uploaded, served publicly and removed', async () => {
    const s = await settingsNow();
    const saved = await put('admin', '/api/settings', {
      ...s,
      company: { name: 'TrustLab', legalName: 'TrustLab Diagnostics Private Limited', gstin: '36ABCDE1234F1Z5' },
    }).expect(200);
    expect(saved.body.settings.company).toMatchObject({
      name: 'TrustLab',
      legalName: 'TrustLab Diagnostics Private Limited',
      address: '',
      logoUrl: null,
    });

    const png = await sharp({
      create: { width: 1200, height: 400, channels: 4, background: { r: 0, g: 80, b: 160, alpha: 0 } },
    })
      .png()
      .toBuffer();
    await request(server)
      .post('/api/settings/logo')
      .set(auth(u.security.token))
      .attach('logo', png, { filename: 'l.png', contentType: 'image/png' })
      .expect(403);
    const notImage = await request(server)
      .post('/api/settings/logo')
      .set(auth(u.admin.token))
      .attach('logo', Buffer.from('hello'), { filename: 'l.txt', contentType: 'text/plain' })
      .expect(400);
    expect(notImage.body.error.message).toBe('Upload a PNG or JPEG image.');
    const up = await request(server)
      .post('/api/settings/logo')
      .set(auth(u.admin.token))
      .attach('logo', png, { filename: 'l.png', contentType: 'image/png' })
      .expect(200);
    const logoUrl = up.body.settings.company.logoUrl;
    expect(logoUrl).toMatch(/^\/api\/brand\/logo\?v=\d+$/);

    const brand = await request(server).get('/api/brand').expect(200); // no sign-in
    expect(brand.body).toEqual({ name: 'TrustLab', logoUrl });
    const img = await request(server).get(logoUrl).buffer(true).expect(200);
    expect(img.headers['content-type']).toBe('image/png');
    const meta = await sharp(img.body).metadata();
    expect(meta.width).toBe(800); // resized to fit 800 × 400

    // Saving company details again keeps the logo.
    const again = await put('admin', '/api/settings', {
      ...(await settingsNow()),
      company: { name: 'TrustLab Labs' },
    }).expect(200);
    expect(again.body.settings.company).toMatchObject({
      name: 'TrustLab Labs',
      legalName: 'TrustLab Diagnostics Private Limited',
      logoUrl,
    });
    await request(server).delete('/api/settings/logo').set(auth(u.admin.token)).expect(200);
    await request(server).get('/api/brand/logo').expect(404);
    expect((await request(server).get('/api/brand').expect(200)).body.logoUrl).toBeNull();
  });
});

describe('rules', () => {
  it('visitor photo and pass number can be made optional', async () => {
    const s = await settingsNow();
    expect(s).toMatchObject({
      visitorPhotoRequired: true,
      visitorPassRequired: true,
      mailCoverRequired: true,
      mailPersonPhotoRequired: true,
    });
    expect((await checkIn({ host: 'Front Office' }, { photo: false }).expect(400)).body.error.field).toBe('photo');
    expect((await checkIn({ host: 'Front Office', badge: '' }).expect(400)).body.error.field).toBe('badge');

    await put('admin', '/api/settings', { ...s, visitorPhotoRequired: false, visitorPassRequired: false }).expect(200);
    const a = (await checkIn({ host: 'Front Office', badge: '' }, { photo: false }).expect(201)).body.visit;
    expect(a).toMatchObject({ badge: '', photoUrl: '' });
    // Several open visits without a pass don't collide.
    const b = (await checkIn({ host: 'Front Office', badge: '' }, { photo: false }).expect(201)).body.visit;
    expect(b.badge).toBe('');
    const ex = await post('security', `/api/visits/${a.id}/exit`, {}).expect(200);
    expect(ex.body.visit.passReturned).toBe(false); // no pass to return
    await post('security', `/api/visits/${b.id}/exit`, {}).expect(200);
    await put('admin', '/api/settings', s).expect(200);
  });

  it('post photos can be made optional', async () => {
    const s = await settingsNow();
    expect((await logMail({ recipientName: 'Front Office' }, { person: false }).expect(400)).body.error.field).toBe(
      'person',
    );
    await put('admin', '/api/settings', { ...s, mailCoverRequired: false, mailPersonPhotoRequired: false }).expect(200);
    const item = (await logMail({ recipientName: 'Front Office' }, { cover: false, person: false }).expect(201)).body
      .item;
    expect(item).toMatchObject({ coverPhotoUrl: '', coverBackPhotoUrl: null, personPhotoUrl: '' });
    await put('admin', '/api/settings', s).expect(200);
  });
});
