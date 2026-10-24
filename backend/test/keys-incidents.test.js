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

/** @param {string} who @param {string} event */
async function inboxOf(who, event) {
  // Notifications are stored in the background after the response; give them a moment to land.
  await new Promise((r) => setTimeout(r, 150));
  const r = await get(who, '/api/notifications', { limit: 100 }).expect(200);
  return r.body.data.filter((/** @type {any} */ n) => n.event === event);
}

/** A new incident (multipart). @param {string} who @param {Record<string, string>} fields @param {number} [photos] */
function report(who, fields, photos = 0) {
  let r = request(server).post('/api/incidents').set(auth(u[who].token));
  for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
  for (let i = 0; i < photos; i++) r = r.attach('photos', jpeg, { filename: `i${i}.jpg`, contentType: 'image/jpeg' });
  return r;
}

let keySeq = 0;
/** @param {Record<string, unknown>} [more] */
async function newKey(more = {}) {
  keySeq += 1;
  const r = await post('admin', '/api/keys', {
    number: `k-${keySeq}`,
    name: `Store room ${keySeq}`,
    site: 'Main Gate',
    ...more,
  }).expect(201);
  return r.body.key;
}

beforeAll(async () => {
  uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gatebook-ops-test-'));
  process.env.NODE_ENV = 'test';
  process.env.UPLOAD_DIR = uploadDir;
  process.env.JWT_SECRET = 'test-jwt';
  process.env.FILE_URL_SECRET = 'test-files';
  process.env.PACE_EMPLOYEES_URL = '';
  process.env.FIREBASE_SERVICE_ACCOUNT = path.join(uploadDir, 'missing.json');

  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('gatebook-ops-test'));
  const { bootstrap } = await import('../src/services/bootstrap.js');
  const { createApp } = await import('../src/app.js');
  realtime = await import('../src/realtime.js');
  engine = await import('../src/services/escalation.js');
  await bootstrap();

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
  for (const [key, data] of [
    ['security', { name: 'Suresh Reddy', role: 'security' }],
    ['supervisor', { name: 'Sameer Supervisor', role: 'security', isSupervisor: true }],
    ['viewer', { name: 'Viewer', role: 'viewer' }],
    ['priya', { name: 'Priya Nair', role: 'host' }],
    ['ravi', { name: 'Ravi Kumar', role: 'host' }],
    ['anil', { name: 'Anil Rao', role: 'host' }],
  ]) {
    const email = `${key}@ops.local`;
    const c = await request(server)
      .post('/api/users')
      .set(auth(u.admin.token))
      .send({ email, password: 'secret123', ...data })
      .expect(201);
    const l = await request(server).post('/api/auth/login').send({ email, password: 'secret123' });
    u[String(key)] = { token: l.body.token, id: c.body.user.id };
  }
  // Ravi reports to Priya.
  await patch('admin', `/api/users/${u.ravi.id}`, { reportsTo: u.priya.id }).expect(200);
});

afterAll(async () => {
  await realtime?.closeRealtime();
  await new Promise((r) => (server ? server.close(() => r(undefined)) : r(undefined)));
  await mongoose.disconnect();
  await mongod?.stop();
  await fs.rm(uploadDir, { recursive: true, force: true });
});

describe('modules', () => {
  it('keys is for gate users, incidents for everyone', async () => {
    const me = await get('security', '/api/auth/me').expect(200);
    expect(me.body.user.modules).toEqual(expect.arrayContaining(['keys', 'incidents']));
    const host = await get('ravi', '/api/auth/me').expect(200);
    expect(host.body.user.modules).toContain('incidents');
    expect(host.body.user.modules).not.toContain('keys');
    await get('ravi', '/api/keys').expect(403);
  });

  it('settings carry keyReturnHours and incidentTypes, and validate them', async () => {
    const s = (await get('admin', '/api/settings').expect(200)).body.settings;
    expect(s.keyReturnHours).toBe(4);
    expect(s.incidentTypes).toContain('Fire / smoke');
    expect(Object.keys(s.esc)).toEqual(expect.arrayContaining(['keys', 'incident_critical', 'incident_low']));
    const bad = await put('admin', '/api/settings', { ...s, keyReturnHours: 900 }).expect(400);
    expect(bad.body.error.field).toBe('keyReturnHours');
  });
});

describe('key register', () => {
  it('admin adds keys; number is upper-cased and unique per site', async () => {
    const r = await post('admin', '/api/keys', {
      number: 'srv-1',
      name: 'Server room',
      site: 'Main Gate',
      copies: 2,
      restricted: true,
      authorised: 'IT team only',
    }).expect(201);
    expect(r.body.key).toMatchObject({
      number: 'SRV-1',
      copies: 2,
      restricted: true,
      authorised: 'IT team only',
      active: true,
      out: [],
    });
    const dup = await post('admin', '/api/keys', { number: 'SRV-1', name: 'Other', site: 'Main Gate' }).expect(409);
    expect(dup.body.error.message).toBe('Key number SRV-1 already exists at Main Gate.');
    const missing = await post('admin', '/api/keys', { number: 'X' }).expect(400);
    expect(missing.body.error.message).toBe('Key number, what it opens and gate/site are required.');
    await post('admin', '/api/keys', { number: 'X', name: 'Y', site: 'Nowhere' }).expect(400);
    await post('security', '/api/keys', { number: 'X', name: 'Y', site: 'Main Gate' }).expect(403);
  });

  it('issue to a person not on Gatebook, with the default return time', async () => {
    const key = await newKey();
    const before = Date.now();
    const r = await post('security', `/api/keys/${key.id}/issue`, {
      takerName: 'Electrician Raju',
      takerPhone: '98480 11111',
      purpose: 'Fix wiring',
    }).expect(201);
    expect(r.body.move).toMatchObject({
      taker: { id: null, name: 'Electrician Raju' },
      state: 'out',
      issuedBy: { name: 'Suresh Reddy' },
    });
    const due = new Date(r.body.move.dueAt).getTime();
    expect(due - before).toBeGreaterThanOrEqual(4 * 3_600_000 - 1000);
    expect(r.body.key.out).toHaveLength(1);
    const again = await post('security', `/api/keys/${key.id}/issue`, { takerName: 'Someone' }).expect(409);
    expect(again.body.error.message).toBe(`Key ${key.number} is already out.`);
    const nobody = await post('security', `/api/keys/${key.id}/issue`, {}).expect(400);
    expect(nobody.body.error.message).toBe('Who is taking the key?');
  });

  it('copies: two can be out, the third is refused; also when racing', async () => {
    const key = await newKey({ copies: 2 });
    const results = await Promise.all(
      [1, 2, 3, 4].map((n) => post('security', `/api/keys/${key.id}/issue`, { takerName: `T${n}` })),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(2);
    const refused = results.filter((r) => r.status === 409);
    expect(refused).toHaveLength(2);
    expect(refused[0].body.error.message).toBe(`All 2 copies of key ${key.number} are already out.`);
  });

  it('issue to a Gatebook user notifies them; return once; returned late is shown', async () => {
    const key = await newKey();
    const due = new Date(Date.now() + 60 * 60_000).toISOString();
    const r = await post('security', `/api/keys/${key.id}/issue`, { takerId: u.ravi.id, dueAt: due }).expect(201);
    expect(r.body.move.taker).toMatchObject({ id: u.ravi.id, name: 'Ravi Kumar' });
    await new Promise((res) => setTimeout(res, 100));
    expect((await inboxOf('ravi', 'key_issued')).some((n) => n.data.id === r.body.move.id)).toBe(true);
    const back = await post('security', `/api/keymoves/${r.body.move.id}/return`, { note: 'OK' }).expect(200);
    expect(back.body.move).toMatchObject({
      state: 'returned',
      returnedByName: 'Ravi Kumar',
      receivedBy: { name: 'Suresh Reddy' },
      returnNote: 'OK',
    });
    expect(back.body.key.out).toHaveLength(0);
    const twice = await post('security', `/api/keymoves/${r.body.move.id}/return`).expect(409);
    expect(twice.body.error.message).toBe('This key has already been returned.');
    await post('security', `/api/keymoves/${new mongoose.Types.ObjectId()}/return`).expect(404);
    // The key can go out again.
    await post('security', `/api/keys/${key.id}/issue`, { takerName: 'Again', dueAt: null }).expect(201);
  });

  it('my keys: an employee sees the keys issued to them, and the ones they gave back this week', async () => {
    const [a, b, c] = [await newKey(), await newKey(), await newKey()];
    const later = new Date(Date.now() + 3 * 3_600_000).toISOString();
    const sooner = new Date(Date.now() + 3_600_000).toISOString();
    const ma = await post('security', `/api/keys/${a.id}/issue`, { takerId: u.anil.id, dueAt: later }).expect(201);
    const mb = await post('security', `/api/keys/${b.id}/issue`, { takerId: u.anil.id, dueAt: sooner }).expect(201);
    const mc = await post('security', `/api/keys/${c.id}/issue`, { takerId: u.anil.id, dueAt: null }).expect(201);
    // Someone else's key and a key typed by name do not show.
    await post('security', `/api/keys/${(await newKey()).id}/issue`, { takerId: u.priya.id }).expect(201);
    await post('security', `/api/keys/${(await newKey()).id}/issue`, { takerName: 'Anil Rao' }).expect(201);

    const r = await get('anil', '/api/mykeys').expect(200);
    expect(r.body.data.map((/** @type {any} */ m) => m.id)).toEqual([
      mb.body.move.id,
      ma.body.move.id,
      mc.body.move.id,
    ]);
    expect(r.body.data[0]).toMatchObject({ key: { number: b.number }, state: 'out', taker: { id: u.anil.id } });
    expect(r.body.counts).toEqual({ out: 3, overdue: 0 });
    expect(r.body.returned).toEqual([]);

    await post('security', `/api/keymoves/${ma.body.move.id}/return`).expect(200);
    const after = await get('anil', '/api/mykeys').expect(200);
    expect(after.body.data).toHaveLength(2);
    expect(after.body.returned).toEqual([expect.objectContaining({ id: ma.body.move.id, state: 'returned' })]);
    // Read only: still no key board for employees.
    await get('anil', '/api/keys').expect(403);
    await request(server).get('/api/mykeys').expect(401);
  });

  it('due time is validated', async () => {
    const key = await newKey();
    const past = await post('security', `/api/keys/${key.id}/issue`, {
      takerName: 'A',
      dueAt: new Date(Date.now() - 3_600_000).toISOString(),
    }).expect(400);
    expect(past.body.error.field).toBe('dueAt');
    await post('security', `/api/keys/${key.id}/issue`, { takerName: 'A', dueAt: 'soon' }).expect(400);
    await post('security', `/api/keys/${key.id}/issue`, {
      takerName: 'A',
      dueAt: new Date(Date.now() + 40 * 86_400_000).toISOString(),
    }).expect(400);
  });

  it('edit: copies cannot drop below what is out; an out key cannot be retired', async () => {
    const key = await newKey({ copies: 2 });
    await post('security', `/api/keys/${key.id}/issue`, { takerName: 'A' }).expect(201);
    await post('security', `/api/keys/${key.id}/issue`, { takerName: 'B' }).expect(201);
    const fewer = await patch('admin', `/api/keys/${key.id}`, { copies: 1 }).expect(409);
    expect(fewer.body.error.field).toBe('copies');
    await patch('admin', `/api/keys/${key.id}`, { active: false }).expect(409);
    const ok = await patch('admin', `/api/keys/${key.id}`, { name: 'Renamed', location: 'Block B' }).expect(200);
    expect(ok.body.key).toMatchObject({ name: 'Renamed', location: 'Block B', copies: 2, number: key.number });
    await patch('security', `/api/keys/${key.id}`, { name: 'x' }).expect(403);
    await patch('admin', `/api/keys/${new mongoose.Types.ObjectId()}`, { name: 'x' }).expect(404);
    // Retired keys cannot be issued.
    const spare = await newKey();
    await patch('admin', `/api/keys/${spare.id}`, { active: false }).expect(200);
    const retired = await post('security', `/api/keys/${spare.id}/issue`, { takerName: 'A' }).expect(409);
    expect(retired.body.error.message).toBe(`Key ${spare.number} is not in use.`);
  });

  it('board counts, diary, CSV; viewers read but cannot issue', async () => {
    const board = await get('viewer', '/api/keys').expect(200);
    expect(board.body.counts.total).toBeGreaterThan(0);
    expect(board.body.counts.out).toBeGreaterThan(0);
    const diary = await get('security', '/api/keymoves', { period: 'today' }).expect(200);
    expect(diary.body.data.length).toBeGreaterThan(0);
    expect(diary.body.counts.out).toBeGreaterThan(0);
    const out = await get('security', '/api/keymoves', { state: 'returned' }).expect(200);
    expect(out.body.data.every((/** @type {any} */ m) => m.state.startsWith('returned'))).toBe(true);
    await get('security', '/api/keymoves', { period: '1y' }).expect(400);
    const csv = await get('viewer', '/api/keymoves/export.csv').expect(200);
    expect(csv.headers['content-disposition']).toContain('key-diary.csv');
    expect(csv.text).toContain('Electrician Raju');
    const key = board.body.keys.find((/** @type {any} */ k) => k.active && k.out.length < k.copies);
    await post('viewer', `/api/keys/${key.id}/issue`, { takerName: 'A' }).expect(403);
  });

  it('an overdue key escalates: guards and the holder at once, supervisors after 30 min, manager after 2 h', async () => {
    const key = await newKey({ name: 'Lab store' });
    const r = await post('security', `/api/keys/${key.id}/issue`, {
      takerId: u.ravi.id,
      dueAt: new Date(Date.now() + 60_000).toISOString(),
    }).expect(201);
    const due = new Date(r.body.move.dueAt).getTime();
    await engine.runMatrix('keys', { nowMs: due + 1000 });
    await engine.runMatrix('keys', { nowMs: due + 31 * 60_000 });
    await engine.runMatrix('keys', { nowMs: due + 121 * 60_000 });
    await new Promise((res) => setTimeout(res, 150));
    const mine = (/** @type {any[]} */ list) =>
      list.filter((n) => n.data.type === 'key' && n.data.id === r.body.move.id);
    expect(mine(await inboxOf('ravi', 'escalation')).map((n) => n.title)).toContain('🔑 Please return the key');
    expect(mine(await inboxOf('security', 'escalation')).map((n) => n.title)).toContain('🔑 Key not returned');
    expect(mine(await inboxOf('supervisor', 'escalation')).map((n) => n.title)).toContain('🔑 Key overdue 30 min');
    expect(mine(await inboxOf('priya', 'escalation')).map((n) => n.title)).toContain(
      "🔑 Key overdue: holder's manager",
    );
    // Back → no more steps.
    await post('security', `/api/keymoves/${r.body.move.id}/return`).expect(200);
    await engine.runMatrix('keys', { nowMs: due + 241 * 60_000 });
    await new Promise((res) => setTimeout(res, 150));
    expect(mine(await inboxOf('admin', 'escalation'))).toHaveLength(0);
  });
});

describe('incidents', () => {
  /** @type {any} */
  let inc;

  it('validates the report', async () => {
    expect((await report('ravi', { severity: 'low', description: 'x' }).expect(400)).body.error.message).toBe(
      'Pick the type of incident.',
    );
    expect(
      (await report('ravi', { type: 'Water leak', severity: 'huge', description: 'x' }).expect(400)).body.error.message,
    ).toBe('Pick how serious it is.');
    expect((await report('ravi', { type: 'Water leak', severity: 'low' }).expect(400)).body.error.message).toBe(
      'Describe what happened.',
    );
    await report('ravi', { type: 'Not a type', severity: 'low', description: 'x' }).expect(400);
    await report('ravi', {
      type: 'Water leak',
      severity: 'low',
      description: 'x',
      occurredAt: new Date(Date.now() + 3_600_000).toISOString(),
    }).expect(400);
    await report('viewer', { type: 'Water leak', severity: 'low', description: 'x' }).expect(403);
  });

  it('an employee reports a high incident with photos; supervisors and admins are told at once', async () => {
    const r = await report(
      'ravi',
      {
        type: 'Water leak',
        severity: 'high',
        description: 'Water on the lab floor',
        location: 'Lab 2',
        people: 'None',
        actionTaken: 'Mopped',
      },
      2,
    ).expect(201);
    inc = r.body.incident;
    expect(inc.id).toMatch(/^IN-\d{6}-[A-Z2-9]{4}$/);
    expect(inc).toMatchObject({
      status: 'open',
      severity: 'high',
      reportedBy: { id: u.ravi.id },
      site: 'Main Gate',
      location: 'Lab 2',
      assignedTo: null,
    });
    expect(inc.photoUrls).toHaveLength(2);
    const img = await request(server).get(inc.photoUrls[0]).expect(200);
    expect(img.headers['content-type']).toBe('image/jpeg');
    await new Promise((res) => setTimeout(res, 300));
    const sup = await inboxOf('supervisor', 'escalation');
    expect(sup.some((n) => n.data.type === 'incident' && n.data.id === inc.id)).toBe(true);
    const adm = await inboxOf('admin', 'escalation');
    expect(adm.some((n) => n.data.id === inc.id && n.title.includes('High incident reported'))).toBe(true);
  });

  it('who sees what: gate sees all, employees their own', async () => {
    expect(
      (await get('security', '/api/incidents').expect(200)).body.data.some((/** @type {any} */ i) => i.id === inc.id),
    ).toBe(true);
    expect(
      (await get('ravi', '/api/incidents').expect(200)).body.data.some((/** @type {any} */ i) => i.id === inc.id),
    ).toBe(true);
    expect((await get('anil', '/api/incidents').expect(200)).body.data).toHaveLength(0);
    await get('anil', `/api/incidents/${inc.id}`).expect(404);
    await get('ravi', '/api/incidents/export.csv').expect(403);
    const csv = await get('viewer', '/api/incidents/export.csv', { tab: 'all' }).expect(200);
    expect(csv.text).toContain(inc.id);
    await get('ravi', '/api/incidents', { tab: 'bad' }).expect(400);
  });

  it('security assigns it; the assignee is told and can now update and close, but not assign', async () => {
    const empty = await post('security', `/api/incidents/${inc.id}/update`, {}).expect(400);
    expect(empty.body.error.message).toBe('Write an update, change the status or assign someone.');
    await post('ravi', `/api/incidents/${inc.id}/update`, { status: 'in_progress' }).expect(403);
    await post('ravi', `/api/incidents/${inc.id}/update`, { assignTo: u.anil.id }).expect(403);
    const a = await post('security', `/api/incidents/${inc.id}/update`, {
      text: 'Plumber called',
      assignTo: u.anil.id,
      status: 'in_progress',
    }).expect(200);
    expect(a.body.incident).toMatchObject({ status: 'in_progress', assignedTo: { id: u.anil.id, name: 'Anil Rao' } });
    expect(a.body.incident.updates.at(-1)).toMatchObject({
      text: 'Plumber called',
      status: 'in_progress',
      assignTo: { id: u.anil.id },
    });
    await new Promise((res) => setTimeout(res, 100));
    expect((await inboxOf('anil', 'incident_assigned')).some((n) => n.data.id === inc.id)).toBe(true);
    expect((await inboxOf('ravi', 'incident_update')).some((n) => n.data.id === inc.id)).toBe(true);
    // Anil sees it now.
    await get('anil', `/api/incidents/${inc.id}`).expect(200);
    await post('anil', `/api/incidents/${inc.id}/update`, { assignTo: u.ravi.id }).expect(403);
    await post('ravi', `/api/incidents/${inc.id}/update`, { text: 'Still leaking' }).expect(200);
    // Assigning someone without the module is refused.
    await patch('admin', `/api/users/${u.priya.id}`, { modules: ['expected'] }).expect(200);
    const noMod = await post('security', `/api/incidents/${inc.id}/update`, { assignTo: u.priya.id }).expect(400);
    expect(noMod.body.error.message).toBe('Priya Nair does not have the Incidents module.');
    await patch('admin', `/api/users/${u.priya.id}`, { modules: ['expected', 'post', 'material', 'incidents'] }).expect(
      200,
    );
  });

  it('close needs a resolution; the reporter is told; admin reopens', async () => {
    await post('ravi', `/api/incidents/${inc.id}/close`, { resolution: 'x' }).expect(403);
    const none = await post('anil', `/api/incidents/${inc.id}/close`, {}).expect(400);
    expect(none.body.error.message).toBe('Write how it was resolved.');
    const c = await post('anil', `/api/incidents/${inc.id}/close`, { resolution: 'Pipe fixed' }).expect(200);
    expect(c.body.incident).toMatchObject({ status: 'closed', resolution: 'Pipe fixed', closedBy: { id: u.anil.id } });
    await new Promise((res) => setTimeout(res, 100));
    expect((await inboxOf('ravi', 'incident_closed')).some((n) => n.data.id === inc.id)).toBe(true);
    await post('anil', `/api/incidents/${inc.id}/close`, { resolution: 'again' }).expect(409);
    await post('security', `/api/incidents/${inc.id}/update`, { text: 'x' }).expect(409);
    await post('security', `/api/incidents/${inc.id}/reopen`).expect(403);
    const o = await post('admin', `/api/incidents/${inc.id}/reopen`, { text: 'Leaking again' }).expect(200);
    expect(o.body.incident).toMatchObject({ status: 'open', closedAt: null, resolution: '' });
    expect(o.body.incident.updates.at(-1)).toMatchObject({ text: 'Leaking again', status: 'open' });
    await post('admin', `/api/incidents/${inc.id}/reopen`).expect(409);
    const counts = (await get('security', '/api/incidents').expect(200)).body.counts;
    expect(counts.open).toBeGreaterThanOrEqual(1);
  });

  it('critical incidents alarm, then go up the chain to the reporter manager', async () => {
    const r = await report('ravi', {
      type: 'Fire / smoke',
      severity: 'critical',
      description: 'Smoke from the panel',
    }).expect(201);
    const id = r.body.incident.id;
    const t0 = new Date(r.body.incident.reportedAt).getTime();
    await engine.runMatrix('incident_critical', { nowMs: t0 + 16 * 60_000 });
    await new Promise((res) => setTimeout(res, 300));
    const sup = (await inboxOf('supervisor', 'escalation')).filter((n) => n.data.id === id);
    expect(sup.some((n) => n.alarm && n.title.startsWith('🚨'))).toBe(true);
    const mgr = (await inboxOf('priya', 'escalation')).filter((n) => n.data.id === id);
    expect(mgr.map((n) => n.title)).toContain('🚨 Critical incident open 15 min');
    // Low incidents only go to admins at once.
    const low = await report('anil', { type: 'Other', severity: 'low', description: 'Bulb out' }).expect(201);
    await new Promise((res) => setTimeout(res, 300));
    expect((await inboxOf('supervisor', 'escalation')).some((n) => n.data.id === low.body.incident.id)).toBe(false);
    expect((await inboxOf('admin', 'escalation')).some((n) => n.data.id === low.body.incident.id)).toBe(true);
  });
});
