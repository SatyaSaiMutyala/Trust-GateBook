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
let agreement;
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
const settingsNow = async () => (await get('admin', '/api/settings').expect(200)).body.settings;

let seq = 0;
/** @param {Record<string, string>} fields */
function checkIn(fields = {}) {
  seq += 1;
  const all = {
    badge: `T${seq}`,
    phone: `93000${String(seq).padStart(5, '0')}`,
    name: `Visitor ${seq}`,
    purpose: 'Meeting',
    host: 'Front Office',
    ...fields,
  };
  let r = request(server).post('/api/visits').set(auth(u.security.token));
  for (const [k, v] of Object.entries(all)) r = r.field(k, v);
  return r.attach('photo', jpeg, { filename: 'photo.jpg', contentType: 'image/jpeg' });
}

/** Wait for the background agreement PDF of a visit. @param {string} id */
async function agreementOf(id) {
  for (let i = 0; i < 40; i++) {
    const v = (await get('security', `/api/visits/${id}`).expect(200)).body.visit;
    if (v.agreementUrl) return v;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('no agreement');
}

beforeAll(async () => {
  uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gatebook-terms-test-'));
  process.env.NODE_ENV = 'test';
  process.env.UPLOAD_DIR = uploadDir;
  process.env.JWT_SECRET = 'test-jwt';
  process.env.FILE_URL_SECRET = 'test-files';
  process.env.PACE_EMPLOYEES_URL = '';
  process.env.FIREBASE_SERVICE_ACCOUNT = path.join(uploadDir, 'missing.json');

  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('gatebook-terms-test'));
  const { bootstrap } = await import('../src/services/bootstrap.js');
  const { createApp } = await import('../src/app.js');
  realtime = await import('../src/realtime.js');
  agreement = await import('../src/services/agreement.js');
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
    ['ravi', { name: 'Ravi Kumar', role: 'host' }],
  ]) {
    const email = `${key}@terms.local`;
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

describe('terms settings and versions', () => {
  it('starts at version 1, not required, with the default wording', async () => {
    const s = await settingsNow();
    expect(s.terms).toMatchObject({
      required: false,
      version: 1,
      company: '',
      title: 'Visitor Terms & Confidentiality Agreement',
    });
    expect(s.terms.body).toMatch(/^1\. Confidentiality\n/);
    const t = (await get('ravi', '/api/terms').expect(200)).body;
    expect(t.versions.map((/** @type {any} */ x) => x.version)).toEqual([1]);
  });

  it('a new wording is a new version; switching "required" alone is not', async () => {
    const s = await settingsNow();
    const req = await put('admin', '/api/settings', { ...s, terms: { required: true } }).expect(200);
    expect(req.body.settings.terms).toMatchObject({ required: true, version: 1 });
    const v2 = await put('admin', '/api/settings', {
      ...s,
      terms: { ...s.terms, required: true, company: 'TrustLab Diagnostics Private Limited' },
    }).expect(200);
    expect(v2.body.settings.terms).toMatchObject({
      version: 2,
      company: 'TrustLab Diagnostics Private Limited',
      required: true,
    });
    const same = await put('admin', '/api/settings', v2.body.settings).expect(200);
    expect(same.body.settings.terms.version).toBe(2);
    const bad = await put('admin', '/api/settings', { ...s, terms: { body: '   ' } }).expect(400);
    expect(bad.body.error.code).toBe('validation');
    const versions = (await get('admin', '/api/terms').expect(200)).body.versions.map(
      (/** @type {any} */ x) => x.version,
    );
    expect(versions).toEqual([2, 1]);
  });

  it('the public terms page needs no sign-in and can show an earlier version', async () => {
    const cur = await request(server).get('/api/terms/public').expect(200);
    expect(cur.body).toMatchObject({ version: 2, current: 2, company: 'TrustLab Diagnostics Private Limited' });
    const v1 = await request(server).get('/api/terms/public').query({ v: 1 }).expect(200);
    expect(v1.body).toMatchObject({ version: 1, current: 2, company: '' });
    await request(server).get('/api/terms/public').query({ v: 'x' }).expect(400);
    await request(server).get('/api/terms').expect(401);
  });

  it('admins can download a sample agreement', async () => {
    await get('security', '/api/terms/sample.pdf').expect(403);
    const r = await get('admin', '/api/terms/sample.pdf').buffer(true).expect(200);
    expect(r.headers['content-type']).toBe('application/pdf');
    expect(r.body.subarray(0, 5).toString()).toBe('%PDF-');
  });
});

describe('agreement at check-in', () => {
  it('when required, check-in without agreeing is refused', async () => {
    const r = await checkIn().expect(400);
    expect(r.body.error).toMatchObject({
      field: 'terms',
      message: 'The visitor must agree to the terms and conditions.',
    });
  });

  it('agreeing records the version and time, and the PDF is stored with the visit', async () => {
    const v = (await checkIn({ termsAccepted: 'true', name: 'Anil Rao', company: 'Sysmex' }).expect(201)).body.visit;
    expect(v).toMatchObject({ termsVersion: 2 });
    expect(v.termsAt).toBe(v.inAt);
    const done = await agreementOf(v.id);
    expect(done.agreementUrl).toMatch(/^\/api\/files\/[a-f0-9]{32}\.pdf\?exp=\d+&sig=/);
    const pdf = await request(server).get(done.agreementUrl).buffer(true).expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.body.subarray(0, 5).toString()).toBe('%PDF-');

    // A changed wording later does not change what this visitor agreed to.
    const s = await settingsNow();
    await put('admin', '/api/settings', { ...s, terms: { ...s.terms, title: 'Visitor Agreement (2027)' } }).expect(200);
    const again = (await post('security', `/api/visits/${v.id}/agreement`).expect(200)).body.visit;
    expect(again.termsVersion).toBe(2);
    expect(again.agreementUrl).not.toBe(done.agreementUrl);
    const csv = await get('security', '/api/visits/export.csv').expect(200);
    expect(csv.text).toContain('"Terms accepted"');
    expect(csv.text).toMatch(/"Yes, version 2, /);
    await post('security', `/api/visits/${v.id}/exit`).expect(200);
  });

  it('visits without accepted terms have no agreement; employees cannot make one', async () => {
    const s = await settingsNow();
    await put('admin', '/api/settings', { ...s, terms: { required: false } }).expect(200);
    const v = (await checkIn().expect(201)).body.visit;
    expect(v).toMatchObject({ termsVersion: null, termsAt: null, agreementUrl: null });
    const r = await post('security', `/api/visits/${v.id}/agreement`).expect(409);
    expect(r.body.error.message).toBe('This visitor did not accept the terms, so there is no agreement.');
    await post('ravi', `/api/visits/${v.id}/agreement`).expect(403);
    await post('security', `/api/visits/${v.id}/exit`).expect(200);
  });

  it('the PDF keeps unusual characters printable and works without a photo', async () => {
    const pdf = await agreement.renderAgreementPdf({
      visit: { pass: 'GB-1', name: 'అనిల్ Rao → guest', termsVersion: 1, termsAt: new Date() },
      terms: { version: 1, company: '', title: 'T', body: 'Plain paragraph only.' },
      company: { name: '', legalName: '', address: '', phone: '', email: '', website: '', cin: '', gstin: '' },
      photo: null,
      logo: null,
    });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
