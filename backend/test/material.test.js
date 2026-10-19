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
let MaterialPass;
/** @type {Record<string, { token: string, id: string }>} */
const u = {};

/** @param {string} t */
const auth = (t) => ({ Authorization: `Bearer ${t}` });
/** @param {string} who @param {string} url @param {object} [body] */
const post = (who, url, body = {}) => request(server).post(url).set(auth(u[who].token)).send(body);
/** @param {string} who @param {string} url @param {object} [body] */
const put = (who, url, body = {}) => request(server).put(url).set(auth(u[who].token)).send(body);
/** @param {string} who @param {string} url @param {Record<string, unknown>} [query] */
const get = (who, url, query = {}) => request(server).get(url).query(query).set(auth(u[who].token));
/** Multipart POST (release / return with photos). @param {string} who @param {string} url */
const form = (who, url) => request(server).post(url).set(auth(u[who].token));
const settingsNow = async () => (await get('admin', '/api/settings').expect(200)).body.settings;

/**
 * A new pass (multipart).
 * @param {string} who
 * @param {Record<string, string | number | boolean>} fields
 * @param {{ challan?: number, carrier?: boolean, boxPhotos?: number }} [files]
 */
function newPass(who, fields, files = {}) {
  let r = request(server).post('/api/material').set(auth(u[who].token));
  for (const [k, v] of Object.entries(fields)) r = r.field(k, String(v));
  for (let i = 0; i < (files.challan ?? 1); i++)
    r = r.attach('challan', jpeg, { filename: `c${i}.jpg`, contentType: 'image/jpeg' });
  for (let i = 0; i < (files.boxPhotos ?? 0); i++)
    r = r.attach('boxPhoto', jpeg, { filename: `b${i}.jpg`, contentType: 'image/jpeg' });
  if (files.carrier) r = r.attach('carrier', jpeg, { filename: 'p.jpg', contentType: 'image/jpeg' });
  return r;
}

let seq = 0;
/** A visitor checked in for `hostId`. @param {string} hostId */
async function visitFor(hostId) {
  seq += 1;
  const r = await request(server)
    .post('/api/visits')
    .set(auth(u.security.token))
    .field('badge', `M${seq}`)
    .field('phone', `94000${String(seq).padStart(5, '0')}`)
    .field('name', `Carrier ${seq}`)
    .field('company', 'Sysmex')
    .field('purpose', 'Meeting')
    .field('hostId', hostId)
    .attach('photo', jpeg, { filename: 'p.jpg', contentType: 'image/jpeg' })
    .expect(201);
  return r.body.visit;
}

/** @param {string} who @param {string} event */
async function inboxOf(who, event) {
  const r = await get(who, '/api/notifications', { limit: 100 }).expect(200);
  return r.body.data.filter((/** @type {any} */ n) => n.event === event);
}

beforeAll(async () => {
  uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gatebook-material-test-'));
  process.env.NODE_ENV = 'test';
  process.env.UPLOAD_DIR = uploadDir;
  process.env.JWT_SECRET = 'test-jwt';
  process.env.FILE_URL_SECRET = 'test-files';
  process.env.PACE_EMPLOYEES_URL = '';
  process.env.FIREBASE_SERVICE_ACCOUNT = path.join(uploadDir, 'missing.json');

  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('gatebook-material-test'));
  const { bootstrap } = await import('../src/services/bootstrap.js');
  const { createApp } = await import('../src/app.js');
  realtime = await import('../src/realtime.js');
  engine = await import('../src/services/escalation.js');
  MaterialPass = (await import('../src/models/MaterialPass.js')).MaterialPass;
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
    ['viewer', { name: 'Viewer', role: 'viewer' }],
    ['ravi', { name: 'Ravi Kumar', role: 'host' }],
    ['priya', { name: 'Priya Nair', role: 'host' }],
  ]) {
    const email = `${key}@material.local`;
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
  await realtime?.closeRealtime();
  await new Promise((r) => (server ? server.close(() => r(undefined)) : r(undefined)));
  await mongoose.disconnect();
  await mongod?.stop();
  await fs.rm(uploadDir, { recursive: true, force: true });
});

describe('material IN', () => {
  it('a visitor brings boxes for an employee: they are asked to accept, then accept', async () => {
    const v = await visitFor(u.ravi.id);
    const r = await newPass('security', {
      direction: 'in',
      boxes: 3,
      visitId: v.id,
      challanType: 'Delivery challan',
      refNo: 'dc-5521',
    }).expect(201);
    const p = r.body.pass;
    expect(p.id).toMatch(/^MP-\d{6}-[A-Z2-9]{4}$/);
    expect(p).toMatchObject({
      direction: 'in',
      mode: 'visitor',
      boxes: 3,
      status: 'awaiting_receipt',
      refNo: 'DC-5521',
      authorisedBy: { id: u.ravi.id },
      checkedBoxes: 3,
    });
    expect(p.carrier).toMatchObject({ name: v.name, company: 'Sysmex', visitId: v.id, visitBadge: v.badge });
    expect(p.carrier.photoUrl).toMatch(/^\/api\/files\//);
    expect(p.challanPhotoUrls).toHaveLength(1);
    const told = (await inboxOf('ravi', 'material_in')).filter((/** @type {any} */ n) => n.data.id === p.id);
    expect(told[0].title).toBe('📦 3 boxes brought in for you');

    // Priya is not the receiver; Ravi sees it under "to do".
    await post('priya', `/api/material/${p.id}/receipt`, { ok: true }).expect(404);
    const todo = (await get('ravi', '/api/material', { tab: 'todo' }).expect(200)).body;
    expect(todo.data.map((/** @type {any} */ x) => x.id)).toContain(p.id);
    expect(todo.counts.todo).toBeGreaterThanOrEqual(1);
    const ok = await post('ravi', `/api/material/${p.id}/receipt`, { ok: true, note: 'All fine' }).expect(200);
    expect(ok.body.pass).toMatchObject({ status: 'received', receiptVia: 'app', receivedBy: { id: u.ravi.id } });
    await post('ravi', `/api/material/${p.id}/receipt`, { ok: true }).expect(409);
  });

  it('"not received" tells security; security can record it received on paper (with a note)', async () => {
    const p = (
      await newPass(
        'security',
        { direction: 'in', boxes: 2, authorisedBy: u.priya.id, carrierName: 'Blue Dart' },
        { carrier: true },
      ).expect(201)
    ).body.pass;
    expect(p.mode).toBe('gate');
    const no = await post('priya', `/api/material/${p.id}/receipt`, {
      ok: false,
      note: 'Only 1 box reached me',
    }).expect(200);
    expect(no.body.pass).toMatchObject({ status: 'disputed', receiptNote: 'Only 1 box reached me' });
    expect((await inboxOf('security', 'material_disputed')).some((/** @type {any} */ n) => n.data.id === p.id)).toBe(
      true,
    );
    await post('security', `/api/material/${p.id}/receipt`, { ok: true }).expect(400);
    const sec = await post('security', `/api/material/${p.id}/receipt`, {
      ok: true,
      note: 'Signed on the challan copy',
    }).expect(200);
    expect(sec.body.pass).toMatchObject({ status: 'received', receiptVia: 'security' });
  });

  it('without an employee security receives it; a returnable IN stays open until taken back out', async () => {
    const p = (
      await newPass(
        'security',
        {
          direction: 'in',
          boxes: 1,
          carrierName: 'Vendor tech',
          returnable: true,
          returnDue: new Date(Date.now() + 7 * 86_400_000).toISOString(),
          items: JSON.stringify([{ desc: 'Service tool kit', qty: 1, unit: 'Set', serial: 'TK-2210' }]),
        },
        { carrier: true },
      ).expect(201)
    ).body.pass;
    expect(p).toMatchObject({ status: 'pending_return', receiptVia: 'security' });
    expect(p.items).toEqual([
      { desc: 'Boxes', qty: 1, unit: 'Box', serial: '', outstanding: 1 },
      { desc: 'Service tool kit', qty: 1, unit: 'Set', serial: 'TK-2210', outstanding: 1 },
    ]);
    const part = await form('security', `/api/material/${p.id}/return`)
      .field('lines', JSON.stringify([{ i: 1, qty: 1 }]))
      .field('note', 'Kit taken back');
    expect(part.status).toBe(200);
    expect(part.body.pass.status).toBe('partly_returned');
    const tooMany = await form('security', `/api/material/${p.id}/return`).field(
      'lines',
      JSON.stringify([{ i: 1, qty: 1 }]),
    );
    expect(tooMany.status).toBe(400);
    const rest = await form('security', `/api/material/${p.id}/return`).field('note', 'Box gone');
    expect(rest.body.pass).toMatchObject({ status: 'returned', returnNote: 'Box gone' });
    expect(rest.body.pass.returns).toHaveLength(2);
  });
});

describe('material OUT', () => {
  it('security-made OUT naming an employee waits for approval; release needs the right count', async () => {
    const v = await visitFor(u.priya.id);
    const p = (
      await newPass('security', {
        direction: 'out',
        boxes: 4,
        visitId: v.id,
        authorisedBy: u.ravi.id,
        challanType: 'Transfer challan',
      }).expect(201)
    ).body.pass;
    expect(p).toMatchObject({ status: 'awaiting_approval', mode: 'visitor' });
    expect((await inboxOf('ravi', 'material_approval')).some((/** @type {any} */ n) => n.data.id === p.id)).toBe(true);
    await form('security', `/api/material/${p.id}/release`).field('boxes', '4').expect(409);
    await post('priya', `/api/material/${p.id}/decision`, { approve: true }).expect(404);
    const ok = await post('ravi', `/api/material/${p.id}/decision`, { approve: true, note: 'Send it' }).expect(200);
    expect(ok.body.pass).toMatchObject({ status: 'ready', approvedBy: { id: u.ravi.id }, approvalNote: 'Send it' });
    expect((await inboxOf('security', 'material_decision')).some((/** @type {any} */ n) => n.data.id === p.id)).toBe(
      true,
    );
    await post('ravi', `/api/material/${p.id}/decision`, { approve: false }).expect(409);
    const wrong = await form('security', `/api/material/${p.id}/release`).field('boxes', '3');
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.message).toBe('The pass is for 4 boxes but you counted 3. Do not release.');
    const rel = await form('security', `/api/material/${p.id}/release`)
      .field('boxes', '4')
      .field('vehicle', 'ts09ek4410');
    expect(rel.body.pass).toMatchObject({ status: 'done', checkedBoxes: 4, releasedBy: { id: u.security.id } });
    expect(rel.body.pass.carrier.vehicle).toBe('TS09EK4410');
  });

  it('rejected passes cannot be released; with the approval rule off security releases at once', async () => {
    const p = (
      await newPass(
        'security',
        { direction: 'out', boxes: 1, authorisedBy: u.ravi.id, carrierName: 'DTDC' },
        { carrier: true },
      ).expect(201)
    ).body.pass;
    await post('ravi', `/api/material/${p.id}/decision`, { approve: false, note: 'Not mine' }).expect(200);
    await form('security', `/api/material/${p.id}/release`).field('boxes', '1').expect(409);
    const s = await settingsNow();
    await put('admin', '/api/settings', { ...s, mpApprovalInApp: false }).expect(200);
    const q = (
      await newPass(
        'security',
        { direction: 'out', boxes: 2, authorisedBy: u.ravi.id, carrierName: 'DTDC' },
        { carrier: true },
      ).expect(201)
    ).body.pass;
    expect(q).toMatchObject({ status: 'done', checkedBoxes: 2 });
    expect(q.releasedAt).toBeTypeOf('string');
    await put('admin', '/api/settings', s).expect(200);
  });

  it('an employee leaves boxes for pickup: handed in, then collected with a photo and count', async () => {
    const p = (
      await newPass('ravi', {
        mode: 'pickup',
        boxes: 2,
        pickerName: 'Transasia rider',
        pickerCompany: 'Transasia',
        returnable: true,
        returnDue: new Date(Date.now() - 3_600_000).toISOString(),
      }).expect(201)
    ).body.pass;
    expect(p).toMatchObject({
      direction: 'out',
      mode: 'pickup',
      status: 'awaiting_drop',
      requestedBy: { id: u.ravi.id },
      authorisedBy: { id: u.ravi.id },
    });
    const drop = await post('security', `/api/material/${p.id}/drop`, { boxes: 1 }).expect(400);
    expect(drop.body.error.message).toBe('The pass says 2 boxes. You counted 1.');
    await post('security', `/api/material/${p.id}/drop`, { boxes: 2 }).expect(200);
    const noPhoto = await form('security', `/api/material/${p.id}/release`).field('boxes', '2');
    expect(noPhoto.status).toBe(400);
    expect(noPhoto.body.error.field).toBe('carrier');
    const rel = await form('security', `/api/material/${p.id}/release`)
      .field('boxes', '2')
      .attach('carrier', jpeg, { filename: 'p.jpg', contentType: 'image/jpeg' });
    expect(rel.status).toBe(200);
    expect(rel.body.pass).toMatchObject({
      status: 'pending_return',
      overdue: true,
      carrier: { name: 'Transasia rider', company: 'Transasia' },
    });
    const overdue = (await get('security', '/api/material', { tab: 'overdue' }).expect(200)).body;
    expect(overdue.data.map((/** @type {any} */ x) => x.id)).toContain(p.id);
    expect(overdue.counts.overdue).toBeGreaterThanOrEqual(1);
    // The overdue escalation reaches the guards and Ravi.
    await engine.runMatrix('material', { nowMs: Date.now() + 60_000 });
    expect(
      (await inboxOf('ravi', 'escalation')).some(
        (/** @type {any} */ n) => n.data.type === 'material' && n.data.id === p.id,
      ),
    ).toBe(true);
  });

  it('employees: only OUT, need a visitor or pickup; viewers cannot create; rules are enforced', async () => {
    await newPass('ravi', { boxes: 1 }).expect(400);
    await newPass('viewer', { direction: 'in', boxes: 1, carrierName: 'X' }, { carrier: true }).expect(403);
    const noChallan = await newPass(
      'security',
      { direction: 'in', boxes: 1, carrierName: 'X' },
      { challan: 0, carrier: true },
    ).expect(400);
    expect(noChallan.body.error.field).toBe('challan');
    const noAuth = await newPass(
      'security',
      { direction: 'out', boxes: 1, carrierName: 'X' },
      { carrier: true },
    ).expect(400);
    expect(noAuth.body.error.message).toBe('Pick the employee sending the boxes.');
    const noCarrierPhoto = await newPass('security', { direction: 'in', boxes: 1, carrierName: 'X' }).expect(400);
    expect(noCarrierPhoto.body.error.field).toBe('carrier');
    await newPass('security', { direction: 'in', boxes: 0, carrierName: 'X' }, { carrier: true }).expect(400);
    const v = await visitFor(u.ravi.id);
    const mine = (await newPass('ravi', { visitId: v.id, boxes: 1 }).expect(201)).body.pass;
    expect(mine).toMatchObject({ status: 'ready', mode: 'visitor', direction: 'out' });
    await post('priya', `/api/material/${mine.id}/cancel`).expect(404);
    const c = await post('ravi', `/api/material/${mine.id}/cancel`).expect(200);
    expect(c.body.pass.status).toBe('cancelled');
    await post('ravi', `/api/material/${mine.id}/cancel`).expect(409);
  });

  it('module access: without Material the list is refused, answering your own pass still works', async () => {
    const p = (
      await newPass(
        'security',
        { direction: 'in', boxes: 1, authorisedBy: u.priya.id, carrierName: 'X' },
        { carrier: true },
      ).expect(201)
    ).body.pass;
    await request(server)
      .patch(`/api/users/${u.priya.id}`)
      .set(auth(u.admin.token))
      .send({ modules: ['expected', 'post'] })
      .expect(200);
    await get('priya', '/api/material').expect(403);
    await post('priya', `/api/material/${p.id}/receipt`, { ok: true }).expect(200);
    await request(server)
      .patch(`/api/users/${u.priya.id}`)
      .set(auth(u.admin.token))
      .send({ modules: ['expected', 'post', 'material'] })
      .expect(200);
  });
});

describe('lists, links and documents', () => {
  it('gate tabs, visitors list, search and counts', async () => {
    const all = (await get('security', '/api/material', { tab: 'all' }).expect(200)).body;
    expect(all.pagination.total).toBeGreaterThan(5);
    expect(all.counts).toMatchObject({
      boxesInToday: expect.any(Number),
      boxesOutToday: expect.any(Number),
      accept: expect.any(Number),
      gate: expect.any(Number),
    });
    const ins = (await get('security', '/api/material', { tab: 'all', dir: 'in' }).expect(200)).body.data;
    expect(ins.every((/** @type {any} */ x) => x.direction === 'in')).toBe(true);
    const found = (await get('security', '/api/material', { tab: 'all', q: 'DC-5521' }).expect(200)).body.data;
    expect(found).toHaveLength(1);
    await get('security', '/api/material', { tab: 'todo' }).expect(400);
    const visitors = (await get('ravi', '/api/material/visitors').expect(200)).body.data;
    expect(visitors.length).toBeGreaterThan(0);
    expect(visitors[0].phone).toBe(''); // employees don't get visitor phone numbers
  });

  it('a delivery expected for an employee is received as Material IN', async () => {
    const e = (
      await post('ravi', '/api/expected', {
        kind: 'delivery',
        company: 'Reagent Co',
        boxes: 3,
        hostId: u.ravi.id,
        expectedAt: new Date(Date.now() + 60_000).toISOString(),
      }).expect(201)
    ).body.expected;
    const p = (
      await newPass(
        'security',
        { direction: 'in', boxes: 3, authorisedBy: u.ravi.id, carrierName: 'Courier', expectedId: e.code },
        { carrier: true },
      ).expect(201)
    ).body.pass;
    expect(p.expectedId).toBe(e.code);
    const after = (await get('ravi', `/api/expected/${e.code}`).expect(200)).body.expected;
    expect(after).toMatchObject({ status: 'arrived', mpId: p.id });
  });

  it('gate pass PDF and CSV', async () => {
    const one = (await get('security', '/api/material', { tab: 'all' }).expect(200)).body.data[0];
    const pdf = await get('security', `/api/material/${one.id}/pdf`).buffer(true).expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.body.subarray(0, 5).toString()).toBe('%PDF-');
    const csv = await get('security', '/api/material/export.csv', { tab: 'all' }).expect(200);
    expect(csv.text).toContain('"Pass no.","IN / OUT","Type","Mode"');
    expect(csv.text).toContain(one.id);
    expect(await MaterialPass.countDocuments()).toBeGreaterThan(5);
  });
});
