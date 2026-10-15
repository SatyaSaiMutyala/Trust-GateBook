import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const PACE_URL = 'https://pace.test/api/v1/employees';

/** Fake Pace data set. */
const EMPLOYEES = [
  { id: 1, emp_code: 'TLE0145', name: 'Ravi Kumar', designation: 'Accountant', department: 'Accounts', branch: 'Bengaluru', email: 'Ravi.Kumar@trustlab.test', phone: '9876500001', status: 'active' },
  { id: 2, emp_code: 'TLC0186', name: 'Priya Nair', designation: 'HR Executive', department: 'HR', branch: 'Mysuru', email: 'priya@trustlab.test', phone: '9876500002', status: 'active' },
  { id: 3, emp_code: 'TLE0200', name: 'Anil Shetty', designation: null, department: 'IT', branch: 'Bengaluru', email: 'gate.guard@test.local', phone: '9876500003', status: 'active' },
  { id: 4, emp_code: 'TLE0300', name: 'Zara Khan', designation: 'Chemist', department: 'Laboratory', branch: null, email: 'zara@trustlab.test', phone: '9876500004', status: 'active' },
  { id: 5, emp_code: 'TLE0999', name: 'Old Timer', designation: 'Clerk', department: 'Accounts', branch: 'Bengaluru', email: 'old@trustlab.test', phone: '9876500009', status: 'archived' },
];

/** @type {'ok' | 'down' | 'unsuccessful'} */
let paceMode = 'ok';
/** @type {URL[]} */
let paceCalls = [];

/** Minimal Pace emulation: status, q (LIKE over several fields), department, sort=name, page/per_page. */
async function fakeFetch(/** @type {string | URL} */ input) {
  const url = new URL(String(input));
  if (url.origin + url.pathname !== PACE_URL) throw new Error(`unexpected fetch ${url}`);
  paceCalls.push(url);
  if (paceMode === 'down') throw new TypeError('fetch failed');
  if (paceMode === 'unsuccessful') return Response.json({ success: false, message: 'boom' }, { status: 200 });
  const p = url.searchParams;
  const status = p.get('status') ?? 'active';
  const q = (p.get('q') ?? '').toLowerCase();
  let items = EMPLOYEES.filter((e) => status === 'all' || e.status === status)
    .filter((e) => !p.get('department') || e.department === p.get('department'))
    .filter((e) =>
      !q ||
      [e.emp_code, e.department, e.branch, e.phone, e.name, e.email, e.designation]
        .some((f) => (f ?? '').toLowerCase().includes(q)),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  const perPage = Number(p.get('per_page') ?? 15);
  const page = Number(p.get('page') ?? 1);
  const total = items.length;
  const lastPage = Math.max(1, Math.ceil(total / perPage));
  items = items.slice((page - 1) * perPage, page * perPage);
  return Response.json({
    success: true,
    message: 'ok',
    data: {
      items: items.map((e) => ({ ...e, initials: 'XX', whatsapp_number: e.phone, join_date: '2024-01-01', manager: null })),
      pagination: { current_page: page, per_page: perPage, total, last_page: lastPage, from: 1, to: items.length, has_more: page < lastPage },
    },
  });
}

/** @type {MongoMemoryServer} */
let mongod;
/** @type {import('express').Express} */
let app;
/** @type {string} */
let uploadDir;
/** @type {Buffer} */
let jpeg;
/** @type {() => void} */
let clearPaceCache;
/** @type {Record<string, { token: string, id: string }>} */
const u = {};

/** @param {string} t */
const auth = (t) => ({ Authorization: `Bearer ${t}` });
/** @param {string} who @param {string} url @param {object} [body] */
const post = (who, url, body = {}) => request(app).post(url).set(auth(u[who].token)).send(body);
/** @param {string} who @param {string} url @param {Record<string, unknown>} [query] */
const get = (who, url, query = {}) => request(app).get(url).query(query).set(auth(u[who].token));

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

beforeAll(async () => {
  uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gatebook-pace-test-'));
  process.env.NODE_ENV = 'test';
  process.env.UPLOAD_DIR = uploadDir;
  process.env.JWT_SECRET = 'test-jwt';
  process.env.FILE_URL_SECRET = 'test-files';
  process.env.PACE_EMPLOYEES_URL = PACE_URL;
  vi.stubGlobal('fetch', vi.fn(fakeFetch)); // never hit the real network

  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('gatebook-pace-test'));
  const { bootstrap } = await import('../src/services/bootstrap.js');
  const { createApp } = await import('../src/app.js');
  ({ clearPaceCache } = await import('../src/services/pace.js'));
  await bootstrap();
  app = createApp();
  jpeg = await sharp({ create: { width: 300, height: 200, channels: 3, background: '#778899' } }).jpeg().toBuffer();

  const login = await request(app).post('/api/auth/login').send({ email: 'admin@gatebook.local', password: 'admin123' });
  u.admin = { token: login.body.token, id: login.body.user.id };
  for (const [key, role] of [['security', 'security'], ['viewer', 'viewer']]) {
    const email = key === 'security' ? 'gate.guard@test.local' : `${key}@test.local`;
    const c = await request(app)
      .post('/api/users')
      .set(auth(u.admin.token))
      .send({ name: `${key} user`, email, password: 'secret123', role })
      .expect(201);
    const l = await request(app).post('/api/auth/login').send({ email, password: 'secret123' });
    u[key] = { token: l.body.token, id: c.body.user.id };
  }
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await mongoose.disconnect();
  await mongod?.stop();
  await fs.rm(uploadDir, { recursive: true, force: true });
});

beforeEach(() => {
  paceMode = 'ok';
  paceCalls = [];
  clearPaceCache();
});

describe('GET /api/hosts from Pace', () => {
  it('maps employees and pagination, and asks Pace for active employees by name', async () => {
    const r = await get('security', '/api/hosts', { limit: 2 }).expect(200);
    expect(r.body.pagination).toEqual({ page: 1, limit: 2, total: 4, totalPages: 2, hasNextPage: true, hasPrevPage: false });
    expect(r.body.data).toEqual([
      {
        id: 'pace:TLE0200',
        name: 'Anil Shetty',
        dept: 'IT',
        location: 'Bengaluru',
        phone: '9876500003',
        empCode: 'TLE0200',
        designation: '',
        branch: 'Bengaluru',
      },
      {
        id: 'pace:TLC0186',
        name: 'Priya Nair',
        dept: 'HR',
        location: 'HR Executive · Mysuru',
        phone: '9876500002',
        empCode: 'TLC0186',
        designation: 'HR Executive',
        branch: 'Mysuru',
      },
    ]);
    const params = Object.fromEntries(paceCalls[0].searchParams);
    expect(params).toEqual({ status: 'active', sort: 'name', dir: 'asc', page: '1', per_page: '2' });

    const p2 = await get('security', '/api/hosts', { limit: 2, page: 2 }).expect(200);
    expect(p2.body.data.map((/** @type {any} */ h) => h.name)).toEqual(['Ravi Kumar', 'Zara Khan']);
    expect(p2.body.pagination).toMatchObject({ page: 2, hasNextPage: false, hasPrevPage: true });

    const q = await get('security', '/api/hosts', { q: 'tlc0186', dept: 'HR' }).expect(200);
    expect(q.body.data.map((/** @type {any} */ h) => h.id)).toEqual(['pace:TLC0186']);
    expect(Object.fromEntries(paceCalls.at(-1).searchParams)).toMatchObject({ q: 'tlc0186', department: 'HR' });

    const none = await get('security', '/api/hosts', { q: 'nobody-at-all' }).expect(200);
    expect(none.body.pagination).toMatchObject({ total: 0, totalPages: 0, hasNextPage: false });
  });

  it('hides phones from viewers and employees', async () => {
    const r = await get('viewer', '/api/hosts', { limit: 100 }).expect(200);
    expect(r.body.data).toHaveLength(4);
    expect(r.body.data.every((/** @type {any} */ h) => h.phone === '')).toBe(true);
  });

  it('caches identical queries for 60 s', async () => {
    await get('security', '/api/hosts', { limit: 3 }).expect(200);
    await get('viewer', '/api/hosts', { limit: 3 }).expect(200);
    expect(paceCalls).toHaveLength(1);
    const again = await get('security', '/api/hosts', { limit: 3 }).expect(200);
    expect(again.body.data[0].phone).toBe('9876500003'); // phone filtering happens after the cache
    await get('security', '/api/hosts', { limit: 4 }).expect(200);
    expect(paceCalls).toHaveLength(2);
  });

  it('returns 502 upstream when Pace is down or unsuccessful', async () => {
    for (const mode of /** @type {const} */ (['down', 'unsuccessful'])) {
      paceMode = mode;
      clearPaceCache();
      const r = await get('security', '/api/hosts').expect(502);
      expect(r.body.error).toEqual({
        code: 'upstream',
        message: "The employee directory (Pace) can't be reached right now. Type the receiver's name instead.",
      });
    }
  });

  it('validates paging params before calling Pace', async () => {
    const r = await get('security', '/api/hosts', { limit: 101 }).expect(400);
    expect(r.body.error).toMatchObject({ code: 'validation', field: 'limit' });
    await get('security', '/api/hosts', { sort: 'dept' }).expect(400);
    expect(paceCalls).toHaveLength(0);
  });
});

describe('Pace recipients on POST /api/mail', () => {
  /** @type {string} */
  let raviId;

  it('upserts a password-less host user and reuses it', async () => {
    const r = await logMail({ recipientId: 'pace:TLE0145' }).expect(201);
    const item = r.body.item;
    expect(item.recipient).toMatchObject({ name: 'Ravi Kumar', phone: '9876500001', location: 'Accountant · Bengaluru' });
    expect(item.dept).toBe('Accounts');
    expect(item.notifiedAt).toBeNull(); // can't sign in → not notified
    raviId = item.recipient.id;
    expect(Object.fromEntries(paceCalls[0].searchParams)).toMatchObject({ q: 'TLE0145', status: 'active' });

    const users = await get('admin', '/api/users', { q: 'ravi' }).expect(200);
    expect(users.body.data).toEqual([
      expect.objectContaining({
        id: raviId,
        email: 'ravi.kumar@trustlab.test',
        role: 'host',
        isHost: true,
        active: true,
        canSignIn: false,
        dept: 'Accounts',
      }),
    ]);

    // Second time: same local user, details refreshed from Pace.
    EMPLOYEES[0].phone = '9876500111';
    const again = await logMail({ recipientId: 'pace:tle0145' }).expect(201);
    expect(again.body.item.recipient.id).toBe(raviId);
    expect(again.body.item.recipient.phone).toBe('9876500111');
    const count = await get('admin', '/api/users', { role: 'host' }).expect(200);
    expect(count.body.pagination.total).toBe(1);
  });

  it('links an existing account by email', async () => {
    const r = await logMail({ recipientId: 'pace:TLE0200' }).expect(201);
    expect(r.body.item.recipient.id).toBe(u.security.id);
    expect(r.body.item.recipient.name).toBe('Anil Shetty'); // refreshed from Pace
    expect(r.body.item.notifiedAt).toBeTypeOf('string'); // has a password → notified
    const me = await get('security', '/api/auth/me').expect(200);
    expect(me.body.user).toMatchObject({ role: 'security', isHost: true, canSignIn: true });
    const h = await post('security', `/api/mail/${r.body.item.id}/handover`, { collectedBy: 'Anil' }).expect(200);
    expect(h.body.item.status).toBe('handed');
  });

  it('rejects unknown, archived or malformed Pace ids', async () => {
    for (const recipientId of ['pace:TLE9999', 'pace:TLE0999', 'pace:', 'pace:TLE01']) {
      const r = await logMail({ recipientId }).expect(400);
      expect(r.body.error).toEqual({ code: 'validation', field: 'recipientId', message: "That employee isn't active in Pace." });
    }
    paceMode = 'down';
    const down = await logMail({ recipientId: 'pace:TLE0145' }).expect(502);
    expect(down.body.error.code).toBe('upstream');
  });

  it('skips confirmation for recipients who cannot sign in, until an admin sets a password', async () => {
    const r = await logMail({ recipientId: 'pace:TLE0145' }).expect(201);
    const id = r.body.item.id;
    const remind = await post('security', `/api/mail/${id}/remind`).expect(409);
    expect(remind.body.error).toMatchObject({
      code: 'conflict',
      message: "This receiver can't sign in to Gatebook, so they can't get reminders. Call them instead.",
    });
    const h = await post('security', `/api/mail/${id}/handover`, { collectedBy: 'Ravi' }).expect(200);
    expect(h.body.item.status).toBe('closed');

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ravi.kumar@trustlab.test', password: 'anything' })
      .expect(401);
    expect(login.body.error).toEqual({
      code: 'unauthorized',
      message: "This account can't sign in yet. Ask an admin to set a password.",
    });

    // Admin sets a password → full confirmation flow.
    const patched = await request(app)
      .patch(`/api/users/${raviId}`)
      .set(auth(u.admin.token))
      .send({ password: 'ravi1234' })
      .expect(200);
    expect(patched.body.user.canSignIn).toBe(true);
    const ok = await request(app)
      .post('/api/auth/login')
      .send({ email: 'RAVI.KUMAR@trustlab.test', password: 'ravi1234' })
      .expect(200);
    u.ravi = { token: ok.body.token, id: raviId };

    const r2 = await logMail({ recipientId: 'pace:TLE0145' }).expect(201);
    expect(r2.body.item.notifiedAt).toBeTypeOf('string');
    await post('security', `/api/mail/${r2.body.item.id}/remind`).expect(200);
    const h2 = await post('security', `/api/mail/${r2.body.item.id}/handover`, { collectedBy: 'Ravi' }).expect(200);
    expect(h2.body.item.status).toBe('handed');
    const c = await post('ravi', `/api/mail/${r2.body.item.id}/confirm`, { ok: true }).expect(200);
    expect(c.body.item.status).toBe('confirmed');
    const mine = await get('ravi', '/api/mail').expect(200);
    expect(mine.body.pagination.total).toBe(4);
  });

  it('keeps plain local recipient ids working', async () => {
    const r = await logMail({ recipientId: raviId }).expect(201);
    expect(r.body.item.recipient.id).toBe(raviId);
    expect(paceCalls).toHaveLength(0);
  });
});
