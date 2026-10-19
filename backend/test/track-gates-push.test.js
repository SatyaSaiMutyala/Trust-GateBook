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
let engine;
/** @type {any} */
let webpush;
/** @type {any} */
let models;
/** @type {Record<string, { token: string, id: string }>} */
const u = {};
const MIN = 60_000;
const GUNTUR = 'Guntur Lab';

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
/** @param {string} who @param {string} [site] */
const track = async (who, site) => (await get(who, '/api/track', site ? { site } : {}).expect(200)).body;
/** @param {any} t @param {string} kind */
const kinds = (t, kind) => t.items.filter((/** @type {any} */ i) => i.kind === kind);

let seq = 0;
/** A visitor checked in at `site` for `hostId`. @param {string} hostId @param {string} [site] */
async function visitFor(hostId, site = 'Main Gate') {
  seq += 1;
  const r = await request(server)
    .post('/api/visits')
    .set(auth(u.security.token))
    .field('badge', `T${seq}`)
    .field('phone', `95000${String(seq).padStart(5, '0')}`)
    .field('name', `Visitor ${seq}`)
    .field('company', 'Sysmex')
    .field('purpose', 'Meeting')
    .field('hostId', hostId)
    .field('site', site)
    .attach('photo', jpeg, { filename: 'p.jpg', contentType: 'image/jpeg' })
    .expect(201);
  return r.body.visit;
}

beforeAll(async () => {
  uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gatebook-track-test-'));
  process.env.NODE_ENV = 'test';
  process.env.UPLOAD_DIR = uploadDir;
  process.env.JWT_SECRET = 'test-jwt';
  process.env.FILE_URL_SECRET = 'test-files';
  process.env.PACE_EMPLOYEES_URL = '';
  process.env.FIREBASE_SERVICE_ACCOUNT = path.join(uploadDir, 'missing.json');

  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('gatebook-track-test'));
  const { bootstrap } = await import('../src/services/bootstrap.js');
  const { createApp } = await import('../src/app.js');
  realtime = await import('../src/realtime.js');
  engine = await import('../src/services/escalation.js');
  webpush = await import('../src/services/webpush.js');
  models = {
    ...(await import('../src/models/Key.js')),
    ...(await import('../src/models/WebPush.js')),
    ...(await import('../src/models/Escalation.js')),
  };
  await bootstrap();
  await Promise.all([models.WebPushSub.init(), models.AppSecret.init()]);

  server = http.createServer(createApp());
  realtime.initRealtime(server);
  await new Promise((r) => server.listen(0, '127.0.0.1', () => r(undefined)));
  jpeg = await sharp({ create: { width: 300, height: 400, channels: 3, background: '#445566' } })
    .jpeg()
    .toBuffer();

  const login = await request(server)
    .post('/api/auth/login')
    .send({ email: 'admin@gatebook.local', password: 'admin123' });
  u.admin = { token: login.body.token, id: login.body.user.id };
  const s = (await get('admin', '/api/settings').expect(200)).body.settings;
  await put('admin', '/api/settings', { ...s, sites: ['Main Gate', GUNTUR] }).expect(200);
  for (const [key, data] of [
    ['security', { name: 'Suresh Main', role: 'security', site: 'Main Gate' }],
    ['guntur', { name: 'Guntur Guard', role: 'security', site: GUNTUR }],
    ['roamer', { name: 'Roaming Guard', role: 'security' }],
    ['ravi', { name: 'Ravi Kumar', role: 'host' }],
  ]) {
    const email = `${key}@track.local`;
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
  webpush?.setWebPushSenderForTests(null);
  await realtime?.closeRealtime();
  await new Promise((r) => (server ? server.close(() => r(undefined)) : r(undefined)));
  await mongoose.disconnect();
  await mongod?.stop();
  await fs.rm(uploadDir, { recursive: true, force: true });
});

describe('gates', () => {
  it('a user has a gate ("" = all gates); only gates from Settings', async () => {
    const me = (await get('security', '/api/auth/me').expect(200)).body.user;
    expect(me.site).toBe('Main Gate');
    expect((await get('roamer', '/api/auth/me').expect(200)).body.user.site).toBe('');
    const bad = await patch('admin', `/api/users/${u.roamer.id}`, { site: 'Nowhere' }).expect(400);
    expect(bad.body.error.message).toBe('Choose the gate from the list.');
    const org = (await get('admin', '/api/users/org').expect(200)).body.users;
    expect(org.find((/** @type {any} */ x) => x.id === u.guntur.id).site).toBe(GUNTUR);
  });

  it('escalations to guards go to the guards of that gate (and those at all gates)', async () => {
    const k = (await post('admin', '/api/keys', { number: 'G-1', name: 'Lab store', site: GUNTUR }).expect(201)).body
      .key;
    const r = await post('guntur', `/api/keys/${k.id}/issue`, {
      takerName: 'Electrician',
      dueAt: new Date(Date.now() + MIN).toISOString(),
    }).expect(201);
    await engine.runMatrix('keys', { nowMs: Date.now() + 2 * MIN });
    const e = await models.Escalation.findOne({ matrix: 'keys', ref: r.body.move.id, target: 'guards' }).lean();
    expect(e.recipients.map((/** @type {any} */ x) => x.name).sort()).toEqual(['Guntur Guard', 'Roaming Guard']);
  });
});

describe('TRACK', () => {
  it('visitors: send in, declined; filtered by gate', async () => {
    const v1 = await visitFor(u.ravi.id);
    const v2 = await visitFor(u.ravi.id, GUNTUR);
    await post('ravi', `/api/visits/${v1.id}/respond`, { status: 'accepted', note: 'Send up' }).expect(200);
    await post('ravi', `/api/visits/${v2.id}/respond`, { status: 'declined', note: 'Not today' }).expect(200);
    const all = await track('security');
    const go = kinds(all, 'visit_go').find((/** @type {any} */ i) => i.ref.id === v1.id);
    expect(go).toMatchObject({ cat: 'visitors', tone: 'go', title: `Send ${v1.name} in · pass ${v1.badge}` });
    expect(go.body).toContain('Ravi Kumar accepted');
    expect(go.body).toContain('“Send up”');
    expect(kinds(all, 'visit_declined').map((/** @type {any} */ i) => i.ref.id)).toContain(v2.id);
    const main = await track('security', 'Main Gate');
    expect(kinds(main, 'visit_declined').map((/** @type {any} */ i) => i.ref.id)).not.toContain(v2.id);
    // Allowed in → gone.
    await post('security', `/api/visits/${v1.id}/allow`, {}).expect(200);
    expect(kinds(await track('security'), 'visit_go').map((/** @type {any} */ i) => i.ref.id)).not.toContain(v1.id);
  });

  it('keys overdue, critical incidents, low diesel; counts and categories', async () => {
    const k = (await post('admin', '/api/keys', { number: 'M-1', name: 'Server room', site: 'Main Gate' }).expect(201))
      .body.key;
    const r = await post('security', `/api/keys/${k.id}/issue`, {
      takerName: 'Raju',
      takerPhone: '98480',
      dueAt: new Date(Date.now() + MIN).toISOString(),
    }).expect(201);
    await models.KeyMove.updateOne({ _id: r.body.move.id }, { $set: { dueAt: new Date(Date.now() - 10 * MIN) } });
    await request(server)
      .post('/api/incidents')
      .set(auth(u.security.token))
      .field('type', 'Fire / smoke')
      .field('severity', 'critical')
      .field('description', 'Smoke')
      .expect(201);
    await request(server)
      .post('/api/incidents')
      .set(auth(u.security.token))
      .field('type', 'Other')
      .field('severity', 'high')
      .field('description', 'x')
      .expect(201);
    const g = (
      await post('admin', '/api/gen/generators', { name: 'DG-1', site: 'Main Gate', tankL: 100, lowPct: 30 }).expect(
        201,
      )
    ).body.generator;
    await request(server)
      .post(`/api/gen/${g.id}/fuel`)
      .set(auth(u.security.token))
      .field('kind', 'check')
      .field('levelL', '10')
      .attach('genPhoto', jpeg, { filename: 'g.jpg', contentType: 'image/jpeg' })
      .expect(201);

    const t = await track('security', 'Main Gate');
    expect(kinds(t, 'key_overdue')[0]).toMatchObject({ title: 'Key M-1 not returned', extra: { phone: '98480' } });
    expect(kinds(t, 'incident_critical')).toHaveLength(1);
    expect(t.items.some((/** @type {any} */ i) => i.cat === 'incidents' && i.kind !== 'incident_critical')).toBe(false);
    expect(kinds(t, 'gen_low')[0].body).toContain('About 10 L left (10%)');
    expect(t.counts.total).toBe(t.items.length);
    expect(t.counts.byCat.keys).toBe(1);
    expect(t.cats.map((/** @type {any} */ c) => c.key)).toEqual([
      'visitors',
      'material',
      'keys',
      'patrol',
      'incidents',
      'gen',
      'post',
    ]);
  });

  it('a late patrol round rings (alarm); categories follow the person’s modules', async () => {
    const cp = (await post('admin', '/api/patrol/checkpoints', { site: 'Main Gate', name: 'Cabin' }).expect(201)).body
      .checkpoint;
    const P = await import('../src/services/patrol.js');
    await post('admin', '/api/patrol/rounds', {
      site: 'Main Gate',
      name: 'Day',
      times: [P.hhmm(Date.now() - 20 * MIN)],
      checkpointIds: [cp.id],
    }).expect(201);
    const t = await track('security', 'Main Gate');
    expect(kinds(t, 'patrol_late')[0]).toMatchObject({
      tone: 'alarm',
      title: expect.stringMatching(/^LATE: Day \d\d:\d\d not started$/),
    });
    // Without Keys and Patrols, those categories are left out.
    await patch('admin', `/api/users/${u.roamer.id}`, { modules: ['visitors', 'incidents'] }).expect(200);
    const r = await track('roamer');
    expect(r.cats.map((/** @type {any} */ c) => c.key)).toEqual(['visitors', 'incidents']);
    expect(r.items.every((/** @type {any} */ i) => ['visitors', 'incidents'].includes(i.cat))).toBe(true);
    await get('ravi', '/api/track').expect(403);
  });

  it('the patrol board, generator status and material list filter by gate', async () => {
    expect((await get('security', '/api/patrol', { site: GUNTUR }).expect(200)).body.checkpoints).toHaveLength(0);
    expect((await get('security', '/api/patrol', { site: 'Main Gate' }).expect(200)).body.checkpoints).toHaveLength(1);
    expect((await get('security', '/api/gen', { site: GUNTUR }).expect(200)).body.generators).toHaveLength(0);
    await get('security', '/api/material', { site: GUNTUR, tab: 'all' }).expect(200);
  });
});

describe('web push', () => {
  /** @type {{ endpoint: string, payload: any }[]} */
  const sent = [];
  const sub = (/** @type {string} */ n) => ({
    endpoint: `https://push.example.com/${n}`,
    keys: { p256dh: 'BKey', auth: 'auth' },
  });

  it('the public key is served; subscribe, list devices, test alert', async () => {
    webpush.setWebPushSenderForTests(async (/** @type {any} */ s, /** @type {string} */ payload) => {
      if (s.endpoint.endsWith('/gone')) throw Object.assign(new Error('Gone'), { statusCode: 410 });
      sent.push({ endpoint: s.endpoint, payload: JSON.parse(payload) });
    });
    const cfg = await request(server).get('/api/push/config').expect(200);
    expect(cfg.body.publicKey).toMatch(/^[A-Za-z0-9_-]{80,}$/);
    // Same key every time (kept in the database).
    expect((await request(server).get('/api/push/config').expect(200)).body.publicKey).toBe(cfg.body.publicKey);

    await post('ravi', '/api/push/subscribe', { subscription: sub('ravi'), device: 'Windows · Chrome' }).expect(200);
    await post('ravi', '/api/push/subscribe', { subscription: { endpoint: 'nope' } }).expect(400);
    const devices = (await get('ravi', '/api/push/devices').expect(200)).body.devices;
    expect(devices).toEqual([expect.objectContaining({ kind: 'web', name: 'Windows · Chrome' })]);
    const t = (await post('ravi', '/api/push/test').expect(200)).body;
    expect(t.sent).toBe(1);
    expect(sent.at(-1)).toMatchObject({ endpoint: sub('ravi').endpoint, payload: { title: '🔔 Test alert' } });
  });

  it('every notification also goes to the browser; dead subscriptions are dropped', async () => {
    sent.length = 0;
    await post('ravi', '/api/push/subscribe', { subscription: sub('gone') }).expect(200);
    await visitFor(u.ravi.id);
    await new Promise((r) => setTimeout(r, 100));
    await webpush.webPushIdle();
    const arrived = sent.find((s) => s.endpoint.endsWith('/ravi'));
    expect(arrived.payload).toMatchObject({ data: { type: 'visit' } });
    expect(arrived.payload.data.notificationId).toBeTruthy();
    expect(await models.WebPushSub.countDocuments({ endpoint: sub('gone').endpoint })).toBe(0);
    await post('ravi', '/api/push/unsubscribe', { endpoint: sub('ravi').endpoint }).expect(200);
    expect((await get('ravi', '/api/push/devices').expect(200)).body.devices).toHaveLength(0);
  });
});
