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
let adminToken = '';
let securityToken = '';
let viewerToken = '';

/** @param {string} t */
const auth = (t) => ({ Authorization: `Bearer ${t}` });

/**
 * Multipart check-in.
 * @param {string} token
 * @param {Record<string, string>} fields
 * @param {Buffer | null} [photo]
 */
function checkIn(token, fields, photo = jpeg) {
  let r = request(app).post('/api/visits').set(auth(token));
  for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
  if (photo) r = r.attach('photo', photo, { filename: 'photo.jpg', contentType: 'image/jpeg' });
  return r;
}

const base = {
  badge: '12',
  phone: '98765 43210',
  name: 'Ravi Kumar',
  company: 'Acme Labs',
  purpose: 'Meeting',
  host: 'Priya',
  dept: 'Laboratory',
  site: 'Main Gate',
};

beforeAll(async () => {
  uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gatebook-test-'));
  process.env.NODE_ENV = 'test';
  process.env.UPLOAD_DIR = uploadDir;
  process.env.JWT_SECRET = 'test-jwt';
  process.env.FILE_URL_SECRET = 'test-files';
  process.env.PACE_EMPLOYEES_URL = ''; // local host users (Pace is covered in pace.test.js)

  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('gatebook-test'));

  const { bootstrap } = await import('../src/services/bootstrap.js');
  const { createApp } = await import('../src/app.js');
  await bootstrap();
  app = createApp();

  jpeg = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#88aacc' } })
    .jpeg()
    .toBuffer();

  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@gatebook.local', password: 'admin123' });
  adminToken = login.body.token;

  for (const role of ['security', 'viewer']) {
    await request(app)
      .post('/api/users')
      .set(auth(adminToken))
      .send({ name: `${role} user`, email: `${role}@test.local`, password: 'secret123', role })
      .expect(201);
    const r = await request(app).post('/api/auth/login').send({ email: `${role}@test.local`, password: 'secret123' });
    if (role === 'security') securityToken = r.body.token;
    else viewerToken = r.body.token;
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod?.stop();
  await fs.rm(uploadDir, { recursive: true, force: true });
});

describe('auth', () => {
  it('logs in the bootstrap admin and returns a user', async () => {
    const r = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ADMIN@gatebook.local', password: 'admin123' })
      .expect(200);
    expect(r.body.token).toBeTypeOf('string');
    expect(r.body.user).toMatchObject({ email: 'admin@gatebook.local', role: 'admin', active: true });
    const me = await request(app).get('/api/auth/me').set(auth(r.body.token)).expect(200);
    expect(me.body.user.id).toBe(r.body.user.id);
  });

  it('rejects a wrong password with the error envelope', async () => {
    const r = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@gatebook.local', password: 'nope' })
      .expect(401);
    expect(r.body.error.code).toBe('unauthorized');
    expect(r.body.error.message).toBeTypeOf('string');
  });

  it('rejects requests without a token', async () => {
    const r = await request(app).get('/api/settings').expect(401);
    expect(r.body.error.code).toBe('unauthorized');
  });
});

describe('visits', () => {
  let passId = '';
  let photoUrl = '';

  it('checks a visitor in (happy path)', async () => {
    const r = await checkIn(securityToken, { ...base, vehicle: 'ka01ab1234', persons: '2' }).expect(201);
    const v = r.body.visit;
    expect(v.pass).toMatch(/^GB-\d{6}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/);
    expect(v.id).toBe(v.pass);
    expect(v).toMatchObject({
      badge: '12',
      name: 'Ravi Kumar',
      persons: 2,
      vehicle: 'KA01AB1234',
      idType: 'Aadhaar',
      outAt: null,
      passReturned: null,
      overstay: false,
      idPhotoUrl: null,
      guardOut: null,
    });
    expect(v.guardIn.name).toBe('security user');
    expect(v.photoUrl).toMatch(/^\/api\/files\/[a-f0-9]{32}\.jpg\?exp=\d+&sig=[0-9a-f]{64}$/);
    passId = v.pass;
    photoUrl = v.photoUrl;

    const img = await request(app).get(photoUrl).expect(200);
    expect(img.headers['content-type']).toBe('image/jpeg');
    const meta = await sharp(img.body).metadata();
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(520);
  });

  it('rejects a badge already held at the same gate (badge_in_use)', async () => {
    const r = await checkIn(securityToken, { ...base, badge: '12', phone: '9000000001', name: 'Someone Else' }).expect(
      409,
    );
    expect(r.body.error.code).toBe('badge_in_use');
    expect(r.body.error.message).toMatch(/^Pass 12 is with Ravi Kumar \(inside since \d{1,2}:\d{2} (am|pm)\)\./);
    const check = await request(app)
      .get('/api/visits/badge-check')
      .query({ badge: '12', site: 'Main Gate' })
      .set(auth(viewerToken))
      .expect(200);
    expect(check.body.inUse.pass).toBe(passId);
  });

  it('rejects a phone that is already inside (already_inside)', async () => {
    const r = await checkIn(securityToken, { ...base, badge: '99', phone: '+91 9876543210' }).expect(409);
    expect(r.body.error.code).toBe('already_inside');
    expect(r.body.error.message).toBe('This mobile number is already inside. Close the open entry first.');
  });

  it('validates required fields in order', async () => {
    const r1 = await checkIn(securityToken, { ...base, name: '' }).expect(400);
    expect(r1.body.error).toMatchObject({ code: 'validation', field: 'name' });
    const r2 = await checkIn(securityToken, { ...base, phone: '12345' }).expect(400);
    expect(r2.body.error).toMatchObject({ code: 'validation', field: 'phone' });
    const r3 = await checkIn(securityToken, { ...base, badge: '50', phone: '9111111111', site: 'Back Gate' }).expect(400);
    expect(r3.body.error).toMatchObject({ code: 'validation', field: 'site' });
    const r4 = await checkIn(securityToken, { ...base, badge: '50', phone: '9111111111' }, null).expect(400);
    expect(r4.body.error).toMatchObject({ code: 'validation', field: 'photo' });
  });

  it('forbids viewers from checking in or recording exits', async () => {
    const r = await checkIn(viewerToken, { ...base, badge: '77', phone: '9222222222' }).expect(403);
    expect(r.body.error.code).toBe('forbidden');
    const e = await request(app).post(`/api/visits/${passId}/exit`).set(auth(viewerToken)).send({}).expect(403);
    expect(e.body.error.code).toBe('forbidden');
  });

  it('validates and records an exit', async () => {
    const before = await request(app)
      .post(`/api/visits/${passId}/exit`)
      .set(auth(securityToken))
      .send({ outAt: '2000-01-01T00:00:00.000Z' })
      .expect(400);
    expect(before.body.error).toMatchObject({ code: 'validation', field: 'outAt' });

    const future = await request(app)
      .post(`/api/visits/${passId}/exit`)
      .set(auth(securityToken))
      .send({ outAt: new Date(Date.now() + 60 * 60_000).toISOString() })
      .expect(400);
    expect(future.body.error).toMatchObject({ code: 'validation', field: 'outAt' });

    const ok = await request(app)
      .post(`/api/visits/${passId}/exit`)
      .set(auth(securityToken))
      .send({ exitNote: 'left by car' })
      .expect(200);
    expect(ok.body.visit.outAt).toBeTypeOf('string');
    expect(ok.body.visit.passReturned).toBe(true);
    expect(ok.body.visit.exitNote).toBe('left by car');
    expect(ok.body.visit.guardOut.name).toBe('security user');

    // Closed: security cannot change it, admin can correct it.
    const again = await request(app).post(`/api/visits/${passId}/exit`).set(auth(securityToken)).send({}).expect(409);
    expect(again.body.error.code).toBe('conflict');
    const corrected = await request(app)
      .post(`/api/visits/${passId}/exit`)
      .set(auth(adminToken))
      .send({ passReturned: false })
      .expect(200);
    expect(corrected.body.visit.passReturned).toBe(false);
    expect(corrected.body.visit.exitNote).toBe('left by car');

    // The badge is free again.
    await checkIn(securityToken, { ...base, phone: '9333333333', name: 'Next Visitor' }).expect(201);
  });

  it('serves files only with a valid signature', async () => {
    const url = new URL(photoUrl, 'http://x');
    const name = url.pathname.split('/').pop() ?? '';
    const exp = url.searchParams.get('exp') ?? '';
    const sig = url.searchParams.get('sig') ?? '';

    const badSig = sig.replace(/^./, sig[0] === 'a' ? 'b' : 'a');
    expect((await request(app).get(`/api/files/${name}?exp=${exp}&sig=${badSig}`).expect(403)).body.error.code).toBe(
      'forbidden',
    );
    await request(app).get(`/api/files/${name}`).expect(403);
    await request(app).get(`/api/files/${name}?exp=${Number(exp) + 300}&sig=${sig}`).expect(403);
    await request(app).get(`/api/files/${name}?exp=1&sig=${sig}`).expect(403);
    await request(app).get(`/api/files/..%2F..%2Fpackage.json?exp=${exp}&sig=${sig}`).expect(403);
    await request(app).get(`/api/files/${name}?exp=${exp}&sig=${sig}`).expect(200);
  });

  it('lists, exports CSV and computes the overview', async () => {
    const list = await request(app).get('/api/visits').query({ q: 'ravi' }).set(auth(viewerToken)).expect(200);
    expect(list.body.pagination.total).toBe(1);
    expect(list.body.data[0].name).toBe('Ravi Kumar');
    expect(list.body.summary).toEqual({ persons: 2, inside: 0 });

    const inside = await request(app).get('/api/visits/inside').set(auth(viewerToken)).expect(200);
    expect(inside.body.data).toHaveLength(1);
    expect(inside.body.pagination.total).toBe(1);

    const lookup = await request(app).get('/api/visits/lookup').query({ phone: '09876543210' }).set(auth(viewerToken));
    expect(lookup.body.open).toBeNull();
    expect(lookup.body.data).toHaveLength(1);
    expect(lookup.body.pagination).toMatchObject({ page: 1, limit: 5, total: 1 });

    const csv = await request(app).get('/api/visits/export.csv').set(auth(viewerToken)).expect(200);
    expect(csv.headers['content-type']).toMatch(/^text\/csv/);
    expect(csv.headers['content-disposition']).toMatch(/visitor-log-\d{4}-\d{2}-\d{2}\.csv/);
    expect(csv.text.charCodeAt(0)).toBe(0xfeff);
    expect(csv.text).toContain('"Pass no.","Entry ID","Name","Mobile"');

    const ov = await request(app).get('/api/stats/overview').set(auth(viewerToken)).expect(200);
    expect(ov.body.overview).toMatchObject({
      insideNow: 1,
      entriesToday: 2,
      personsToday: 3,
      overstayCount: 0,
      overstayHours: 4,
    });
    expect(ov.body.overview.byHour).toHaveLength(17);
  });
});

describe('pagination', () => {
  beforeAll(async () => {
    // 7 more open visits at the gate -> 8 inside in total.
    for (let i = 0; i < 7; i++) {
      await checkIn(securityToken, {
        ...base,
        badge: `P${i}`,
        phone: `90000000${String(i).padStart(2, '0')}`,
        name: `Pager Visitor ${i}`,
        company: i % 2 ? 'Odd Co' : 'Even Co',
      }).expect(201);
    }
  });

  it('returns the exact paginated shape and page 2 contents', async () => {
    const p1 = await request(app).get('/api/visits').query({ limit: 3, sort: 'name' }).set(auth(viewerToken)).expect(200);
    expect(Object.keys(p1.body).sort()).toEqual(['data', 'pagination', 'summary']);
    expect(p1.body.pagination).toEqual({
      page: 1,
      limit: 3,
      total: 9,
      totalPages: 3,
      hasNextPage: true,
      hasPrevPage: false,
    });
    const p2 = await request(app)
      .get('/api/visits')
      .query({ limit: 3, page: 2, sort: 'name' })
      .set(auth(viewerToken))
      .expect(200);
    expect(p2.body.pagination).toMatchObject({ page: 2, hasNextPage: true, hasPrevPage: true });
    const names = [...p1.body.data, ...p2.body.data].map((/** @type {any} */ v) => v.name);
    expect(names).toEqual([...names].sort());
    expect(new Set(names).size).toBe(6);
    expect(p2.body.data.map((/** @type {any} */ v) => v.name)).toEqual([
      'Pager Visitor 2',
      'Pager Visitor 3',
      'Pager Visitor 4',
    ]); // page 1 = Next Visitor, Pager Visitor 0, Pager Visitor 1

    const p3 = await request(app).get('/api/visits').query({ limit: 3, page: 3 }).set(auth(viewerToken)).expect(200);
    expect(p3.body.pagination.hasNextPage).toBe(false);
    const past = await request(app).get('/api/visits').query({ limit: 3, page: 9 }).set(auth(viewerToken)).expect(200);
    expect(past.body.data).toEqual([]);
    expect(past.body.pagination).toMatchObject({ total: 9, totalPages: 3, hasNextPage: false, hasPrevPage: true });
  });

  it('pages the inside list (oldest first) and searches', async () => {
    const r = await request(app).get('/api/visits/inside').query({ limit: 5, page: 2 }).set(auth(viewerToken)).expect(200);
    expect(r.body.pagination).toEqual({ page: 2, limit: 5, total: 8, totalPages: 2, hasNextPage: false, hasPrevPage: true });
    expect(r.body.data).toHaveLength(3);
    expect(r.body.data.at(-1).name).toBe('Pager Visitor 6');

    const s = await request(app).get('/api/visits/inside').query({ q: 'odd co' }).set(auth(viewerToken)).expect(200);
    expect(s.body.pagination.total).toBe(3);
    const rx = await request(app).get('/api/visits').query({ q: '.*' }).set(auth(viewerToken)).expect(200);
    expect(rx.body.pagination.total).toBe(0); // regex characters are escaped
    const over = await request(app).get('/api/visits/inside').query({ overstay: 'true' }).set(auth(viewerToken)).expect(200);
    expect(over.body.pagination.total).toBe(0);
  });

  it('paginates users with filters', async () => {
    const r = await request(app).get('/api/users').query({ limit: 2 }).set(auth(adminToken)).expect(200);
    expect(r.body.pagination).toMatchObject({ page: 1, limit: 2, total: 3, totalPages: 2, hasNextPage: true });
    expect(r.body.data.map((/** @type {any} */ u) => u.name)).toEqual(['Administrator', 'security user']);
    const v = await request(app).get('/api/users').query({ role: 'viewer', active: 'true' }).set(auth(adminToken));
    expect(v.body.data.map((/** @type {any} */ u) => u.email)).toEqual(['viewer@test.local']);
  });

  it('rejects invalid paging params with validation + field', async () => {
    const cases = [
      ['/api/visits', { limit: 101 }, 'limit'],
      ['/api/visits', { limit: 0 }, 'limit'],
      ['/api/visits', { page: 'abc' }, 'page'],
      ['/api/visits', { sort: 'phone' }, 'sort'],
      ['/api/visits/inside', { sort: '-photo' }, 'sort'],
      ['/api/users', { sort: 'passwordHash' }, 'sort'],
      ['/api/visits', { status: 'maybe' }, 'status'],
    ];
    for (const [url, query, field] of cases) {
      const r = await request(app).get(String(url)).query(query).set(auth(adminToken)).expect(400);
      expect(r.body.error).toMatchObject({ code: 'validation', field });
    }
  });
});

// Runs last so the extra records don't change the counts asserted above.
describe('single gate', () => {
  it('defaults the gate to the single configured site when none is sent', async () => {
    const { site: _omit, ...noSite } = base;
    const r = await checkIn(securityToken, { ...noSite, badge: 'SG1', phone: '9222222222' }).expect(201);
    expect(r.body.visit.site).toBe('Main Gate');
    const b = await request(app).get('/api/visits/badge-check').query({ badge: 'sg1' }).set(auth(securityToken)).expect(200);
    expect(b.body.inUse?.pass).toBe(r.body.visit.pass);
  });
});
