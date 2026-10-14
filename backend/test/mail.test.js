import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** @type {MongoMemoryServer} */
let mongod;
/** @type {import('express').Express} */
let app;
/** @type {string} */
let uploadDir;
/** @type {Buffer} */
let jpeg;

/** @type {Record<string, { token: string, id: string }>} */
const u = {};

/** @param {string} t */
const auth = (t) => ({ Authorization: `Bearer ${t}` });

/**
 * @param {string} who key in `u`
 * @param {Record<string, string>} fields
 * @param {{ cover?: boolean, person?: boolean }} [photos]
 */
function logMail(who, fields, photos = {}) {
  let r = request(app).post('/api/mail').set(auth(u[who].token));
  for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
  if (photos.cover !== false) r = r.attach('cover', jpeg, { filename: 'c.jpg', contentType: 'image/jpeg' });
  if (photos.person !== false) r = r.attach('person', jpeg, { filename: 'p.jpg', contentType: 'image/jpeg' });
  return r;
}

/** @param {string} who @param {string} url @param {object} [body] */
const post = (who, url, body = {}) => request(app).post(url).set(auth(u[who].token)).send(body);
/** @param {string} who @param {string} url @param {Record<string, unknown>} [query] */
const get = (who, url, query = {}) => request(app).get(url).query(query).set(auth(u[who].token));

const base = { kind: 'Courier', sender: 'Transasia', broughtBy: 'Ramu', carrier: 'Blue Dart', site: 'Main Gate' };

beforeAll(async () => {
  uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gatebook-mail-test-'));
  process.env.NODE_ENV = 'test';
  process.env.UPLOAD_DIR = uploadDir;
  process.env.JWT_SECRET = 'test-jwt';
  process.env.FILE_URL_SECRET = 'test-files';
  process.env.PACE_EMPLOYEES_URL = ''; // local host users (Pace is covered in pace.test.js)

  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('gatebook-mail-test'));
  const { bootstrap } = await import('../src/services/bootstrap.js');
  const { createApp } = await import('../src/app.js');
  await bootstrap();
  app = createApp();

  jpeg = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: '#aa8866' } }).jpeg().toBuffer();

  const login = await request(app).post('/api/auth/login').send({ email: 'admin@gatebook.local', password: 'admin123' });
  u.admin = { token: login.body.token, id: login.body.user.id };

  const people = [
    ['security', { name: 'Gate Guard', role: 'security' }],
    ['viewer', { name: 'Viewer', role: 'viewer' }],
    ['ravi', { name: 'Ravi Kumar', role: 'host', phone: '9876500001', dept: 'Accounts', location: '2nd floor, cabin 3' }],
    ['priya', { name: 'Priya Nair', role: 'host', phone: '9876500002', dept: 'HR', location: 'Ground floor' }],
    ['anil', { name: 'Anil Security', role: 'security', isHost: true, dept: 'IT' }],
    ['gone', { name: 'Gone Host', role: 'host' }],
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
  await request(app).patch(`/api/users/${u.gone.id}`).set(auth(u.admin.token)).send({ active: false }).expect(200);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod?.stop();
  await fs.rm(uploadDir, { recursive: true, force: true });
});

describe('users, profile, hosts, settings', () => {
  it('serializes the new user fields and forces isHost for hosts', async () => {
    const r = await get('admin', '/api/users', { role: 'host', limit: 100 }).expect(200);
    const ravi = r.body.data.find((/** @type {any} */ x) => x.id === u.ravi.id);
    expect(ravi).toMatchObject({ role: 'host', isHost: true, phone: '9876500001', dept: 'Accounts' });
    const s = await get('admin', '/api/users', { q: '98765' }).expect(200);
    expect(s.body.pagination.total).toBe(2);
  });

  it('lets anyone edit their own phone / dept / location', async () => {
    const r = await request(app)
      .patch('/api/auth/me')
      .set(auth(u.viewer.token))
      .send({ phone: '+91 90000 11111', location: 'Lab block' })
      .expect(200);
    expect(r.body.user).toMatchObject({ phone: '+91 90000 11111', location: 'Lab block', role: 'viewer', isHost: false });
    await request(app).patch('/api/auth/me').set(auth(u.viewer.token)).send({ role: 'admin' }).expect(400);
  });

  it('paginates the recipient directory and hides phones from hosts', async () => {
    const all = await get('security', '/api/hosts', { limit: 2 }).expect(200);
    // ravi, priya, anil (isHost); not the deactivated host, not admin/viewer
    expect(all.body.pagination).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2, hasNextPage: true, hasPrevPage: false });
    expect(all.body.data.map((/** @type {any} */ h) => h.name)).toEqual(['Anil Security', 'Priya Nair']);
    const p2 = await get('security', '/api/hosts', { limit: 2, page: 2 }).expect(200);
    expect(p2.body.data).toEqual([
      { id: u.ravi.id, name: 'Ravi Kumar', dept: 'Accounts', location: '2nd floor, cabin 3', phone: '9876500001' },
    ]);
    const asHost = await get('priya', '/api/hosts', { q: 'accounts' }).expect(200);
    expect(asHost.body.data).toHaveLength(1);
    expect(asHost.body.data[0].phone).toBe('');
    await get('security', '/api/hosts', { sort: 'dept' }).expect(400);
  });

  it('has mailKinds, merged in for settings stored before the post room', async () => {
    const { Settings } = await import('../src/models/Settings.js');
    await Settings.collection.updateOne({ key: 'global' }, { $unset: { mailKinds: '' } });
    const r = await get('ravi', '/api/settings').expect(200);
    expect(r.body.settings.mailKinds).toContain('Courier');
    const put = await request(app)
      .put('/api/settings')
      .set(auth(u.admin.token))
      .send({ ...r.body.settings, mailKinds: ['Courier', 'Letter', 'Parcel'] })
      .expect(200);
    expect(put.body.settings.mailKinds).toEqual(['Courier', 'Letter', 'Parcel']);
  });

  it('keeps hosts out of visits, stats and settings writes', async () => {
    for (const url of ['/api/visits', '/api/visits/inside', '/api/visits/export.csv', '/api/stats/overview']) {
      const r = await get('ravi', url).expect(403);
      expect(r.body.error.code).toBe('forbidden');
    }
    await request(app).put('/api/settings').set(auth(u.ravi.token)).send({}).expect(403);
    await get('ravi', '/api/mail/export.csv').expect(403);
    await logMail('ravi', { ...base, recipientId: u.ravi.id }).expect(403);
  });
});

describe('post room', () => {
  /** @type {any} */
  let item;

  it('validates the recipient', async () => {
    for (const recipientId of ['not-an-id', u.viewer.id, u.gone.id, new mongoose.Types.ObjectId().toString()]) {
      const r = await logMail('security', { ...base, recipientId }).expect(400);
      expect(r.body.error).toMatchObject({ code: 'validation', field: 'recipientId' });
    }
    const none = await logMail('security', { ...base }).expect(400);
    expect(none.body.error).toMatchObject({ code: 'validation', field: 'recipientName' });
    const kind = await logMail('security', { ...base, kind: 'Pigeon', recipientName: 'X' }).expect(400);
    expect(kind.body.error.field).toBe('kind');
    const photo = await logMail('security', { ...base, recipientName: 'X' }, { person: false }).expect(400);
    expect(photo.body.error.field).toBe('person');
  });

  it('logs an item for a Gatebook recipient', async () => {
    const r = await logMail('security', { ...base, recipientId: u.ravi.id, refNo: 'bd123', pieces: '2' }).expect(201);
    item = r.body.item;
    expect(item.id).toMatch(/^ML-\d{6}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/);
    expect(item).toMatchObject({
      status: 'lodged',
      refNo: 'BD123',
      pieces: 2,
      dept: 'Accounts',
      recipientName: 'Ravi Kumar',
      recipient: { id: u.ravi.id, name: 'Ravi Kumar', phone: '9876500001', location: '2nd floor, cabin 3' },
      receivedBy: { id: u.security.id, name: 'Gate Guard' },
      handedAt: null,
      confirmedAt: null,
    });
    expect(item.notifiedAt).toBeTypeOf('string');
    const cover = await request(app).get(item.coverPhotoUrl).expect(200);
    expect((await sharp(cover.body).metadata()).width).toBe(1100);
    const person = await request(app).get(item.personPhotoUrl).expect(200);
    expect((await sharp(person.body).metadata()).width).toBe(640);
  });

  it('runs lodged → remind → handed → confirmed', async () => {
    const early = await post('ravi', `/api/mail/${item.id}/confirm`, { ok: true }).expect(409);
    expect(early.body.error).toMatchObject({ code: 'conflict', message: 'Security has not handed this over yet' });
    expect(early.body.error.item.status).toBe('lodged');

    const rem = await post('security', `/api/mail/${item.id}/remind`).expect(200);
    expect(rem.body.item.remindedAt).toBeTypeOf('string');

    await post('security', `/api/mail/${item.id}/handover`, {}).expect(400);
    const h = await post('security', `/api/mail/${item.id}/handover`, { collectedBy: 'Ravi Kumar', note: 'ID seen' }).expect(200);
    expect(h.body.item).toMatchObject({ status: 'handed', collectedBy: 'Ravi Kumar', handedNote: 'ID seen' });
    expect(h.body.item.handedBy.name).toBe('Gate Guard');

    const twice = await post('security', `/api/mail/${item.id}/handover`, { collectedBy: 'Ravi' }).expect(409);
    expect(twice.body.error).toMatchObject({ code: 'conflict', message: 'Already handed over' });
    await post('security', `/api/mail/${item.id}/remind`).expect(409);

    const notMine = await post('priya', `/api/mail/${item.id}/confirm`, { ok: true }).expect(403);
    expect(notMine.body.error).toMatchObject({ code: 'forbidden', message: 'This item is not addressed to you' });
    await post('security', `/api/mail/${item.id}/confirm`, { ok: true }).expect(403);

    const c = await post('ravi', `/api/mail/${item.id}/confirm`, { ok: true }).expect(200);
    expect(c.body.item.status).toBe('confirmed');
    expect(c.body.item.confirmedAt).toBeTypeOf('string');
    await post('ravi', `/api/mail/${item.id}/confirm`, { ok: false }).expect(409);
  });

  it('runs handed → disputed → resolved (recipient with isHost on a gate role)', async () => {
    const r = await logMail('security', { ...base, kind: 'Letter', recipientId: u.anil.id }).expect(201);
    const id = r.body.item.id;
    expect(r.body.item.dept).toBe('IT');
    await post('security', `/api/mail/${id}/handover`, { collectedBy: 'Someone else' }).expect(200);
    const d = await post('anil', `/api/mail/${id}/confirm`, { ok: false }).expect(200);
    expect(d.body.item).toMatchObject({ status: 'disputed', disputeNote: 'Receiver says it was not collected' });

    await post('viewer', `/api/mail/${id}/resolve`, { note: 'x' }).expect(403);
    const empty = await post('security', `/api/mail/${id}/resolve`, { note: '  ' }).expect(400);
    expect(empty.body.error).toMatchObject({ code: 'validation', field: 'note', message: 'Write what was found or done' });
    const ok = await post('security', `/api/mail/${id}/resolve`, { note: 'Found in the HR tray' }).expect(200);
    expect(ok.body.item).toMatchObject({ status: 'resolved', resolveNote: 'Found in the HR tray' });
    expect(ok.body.item.resolvedBy.name).toBe('Gate Guard');
    await post('security', `/api/mail/${id}/resolve`, { note: 'again' }).expect(409);
  });

  it('closes items for receivers not on Gatebook without a confirmation step', async () => {
    const r = await logMail('admin', { ...base, kind: 'Parcel', recipientName: 'Mr. Outsider', dept: 'Sales' }).expect(201);
    expect(r.body.item).toMatchObject({ recipient: null, recipientName: 'Mr. Outsider', notifiedAt: null, dept: 'Sales' });
    await post('security', `/api/mail/${r.body.item.id}/remind`).expect(409);
    const h = await post('security', `/api/mail/${r.body.item.id}/handover`, { collectedBy: 'Driver' }).expect(200);
    expect(h.body.item.status).toBe('closed');
  });

  it('limits hosts to their own items', async () => {
    await logMail('security', { ...base, recipientId: u.priya.id, sender: 'Income Tax Dept' }).expect(201);
    await logMail('security', { ...base, recipientId: u.ravi.id, sender: 'Bank' }).expect(201);

    const ravi = await get('ravi', '/api/mail', { recipient: u.priya.id }).expect(200);
    expect(ravi.body.data.every((/** @type {any} */ m) => m.recipient?.id === u.ravi.id)).toBe(true);
    expect(ravi.body.pagination.total).toBe(2);
    expect(ravi.body.counts).toEqual({ lodged: 1, handed: 0, disputed: 0 });

    const priyaItem = (await get('priya', '/api/mail').expect(200)).body.data[0];
    expect(priyaItem.sender).toBe('Income Tax Dept');
    const peek = await get('ravi', `/api/mail/${priyaItem.id}`).expect(403);
    expect(peek.body.error.message).toBe('This item is not addressed to you');
    await get('viewer', `/api/mail/${priyaItem.id}`).expect(200);
  });

  it('lists with counts, status lists, search and pagination', async () => {
    const all = await get('viewer', '/api/mail', { limit: 2 }).expect(200);
    expect(Object.keys(all.body).sort()).toEqual(['counts', 'data', 'pagination']);
    expect(all.body.pagination).toEqual({ page: 1, limit: 2, total: 5, totalPages: 3, hasNextPage: true, hasPrevPage: false });
    // lodged: priya + ravi(bank); handed: none; disputed: none (resolved)
    expect(all.body.counts).toEqual({ lodged: 2, handed: 0, disputed: 0 });
    // newest first
    expect(all.body.data.map((/** @type {any} */ m) => m.sender)).toEqual(['Bank', 'Income Tax Dept']);

    const p3 = await get('viewer', '/api/mail', { limit: 2, page: 3 }).expect(200);
    expect(p3.body.data).toHaveLength(1);
    expect(p3.body.pagination).toMatchObject({ hasNextPage: false, hasPrevPage: true });

    const done = await get('viewer', '/api/mail', { status: 'confirmed,closed,resolved' }).expect(200);
    expect(done.body.pagination.total).toBe(3);
    expect(done.body.counts).toEqual(all.body.counts); // counts ignore status/q

    const q = await get('viewer', '/api/mail', { q: 'bd123' }).expect(200);
    expect(q.body.pagination.total).toBe(1);
    const me = await get('anil', '/api/mail', { recipient: 'me' }).expect(200);
    expect(me.body.pagination.total).toBe(1);

    for (const [query, field] of [
      [{ status: 'lost' }, 'status'],
      [{ sort: 'sender' }, 'sort'],
      [{ limit: 101 }, 'limit'],
      [{ recipient: 'bob' }, 'recipient'],
      [{ from: 'yesterday' }, 'from'],
    ]) {
      const r = await get('viewer', '/api/mail', /** @type {any} */ (query)).expect(400);
      expect(r.body.error).toMatchObject({ code: 'validation', field });
    }
  });

  it('exports the post register as CSV', async () => {
    const r = await get('viewer', '/api/mail/export.csv', { status: 'resolved' }).expect(200);
    expect(r.headers['content-disposition']).toMatch(/post-register-\d{4}-\d{2}-\d{2}\.csv/);
    expect(r.text).toContain('"Entry ID","Type","Tracking / ref no.","From (sender)","Brought by","Delivery person"');
    expect(r.text).toContain('"Resolved"');
    expect(r.text.trim().split('\r\n')).toHaveLength(2);
  });
});

// Runs last so the extra records don't change the counts asserted above.
describe('single gate', () => {
  it('defaults the gate to the single configured site when none is sent', async () => {
    const { site: _omit, ...noSite } = base;
    const r = await logMail('security', { ...noSite, recipientName: 'Walk-in Receiver' }).expect(201);
    expect(r.body.item.site).toBe('Main Gate');
  });
});
