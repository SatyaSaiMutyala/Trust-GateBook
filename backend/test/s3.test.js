// S3 photo storage. Never talks to AWS: every S3 call goes to aws-sdk-client-mock, and the client is created
// with obviously fake credentials only so the presigner can compute a signature offline.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const BUCKET = 'test-bucket';
const s3Mock = mockClient(S3Client);

/** @type {MongoMemoryServer} */
let mongod;
/** @type {import('express').Express} */
let app;
/** @type {string} */
let uploadDir;
/** @type {Buffer} */
let jpeg;
/** @type {any} */
let config;
/** @type {any} */
let storage;
/** @type {any} */
let Visit;
/** @type {any} */
let MailItem;
/** @type {Record<string, { token: string, id: string }>} */
const u = {};

/** @param {string} t */
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const KEY_RE = (/** @type {string} */ kind) => new RegExp(`^gatebook/${kind}/[a-f0-9]{32}\\.jpg$`);
const URL_RE = (/** @type {string} */ kind) =>
  new RegExp(`^https://${BUCKET}\\.s3\\.ap-south-1\\.amazonaws\\.com/gatebook/${kind}/[a-f0-9]{32}\\.jpg\\?`);

/** @param {Record<string, string>} fields @param {Record<string, Buffer>} files */
function multipart(url, fields, files) {
  let r = request(app).post(url).set(auth(u.security.token));
  for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
  for (const [k, buf] of Object.entries(files)) r = r.attach(k, buf, { filename: `${k}.jpg`, contentType: 'image/jpeg' });
  return r;
}

const checkIn = (/** @type {Record<string, string>} */ over = {}, /** @type {Record<string, Buffer>} */ files = {}) =>
  multipart(
    '/api/visits',
    { badge: 'S3-1', phone: '9000012345', name: 'Cloud Visitor', purpose: 'Meeting', host: 'Priya', ...over },
    { photo: jpeg, ...files },
  );

/** Write a local photo like the pre-S3 server did. */
async function localPhoto() {
  const name = `${crypto.randomBytes(16).toString('hex')}.jpg`;
  await fs.writeFile(path.join(uploadDir, name), jpeg);
  return name;
}

beforeAll(async () => {
  uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gatebook-s3-test-'));
  Object.assign(process.env, {
    NODE_ENV: 'test',
    UPLOAD_DIR: uploadDir,
    JWT_SECRET: 'test-jwt',
    FILE_URL_SECRET: 'test-files',
    PACE_EMPLOYEES_URL: '',
    FIREBASE_SERVICE_ACCOUNT: path.join(uploadDir, 'missing.json'),
    STORAGE: 's3',
    AWS_BUCKET: BUCKET,
    AWS_DEFAULT_REGION: 'ap-south-1',
    AWS_S3_PREFIX: 'gatebook',
  });

  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('gatebook-s3-test'));
  ({ config } = await import('../src/config.js'));
  storage = await import('../src/services/storage.js');
  ({ Visit } = await import('../src/models/Visit.js'));
  ({ MailItem } = await import('../src/models/MailItem.js'));
  storage.setS3ClientForTests(
    new S3Client({ region: 'ap-south-1', credentials: { accessKeyId: 'fake-test-key', secretAccessKey: 'fake-test-secret' } }),
  );
  const { bootstrap } = await import('../src/services/bootstrap.js');
  const { createApp } = await import('../src/app.js');
  await bootstrap();
  app = createApp();
  jpeg = await sharp({ create: { width: 1200, height: 900, channels: 3, background: '#3366aa' } }).jpeg().toBuffer();

  const l = await request(app).post('/api/auth/login').send({ email: 'admin@gatebook.local', password: 'admin123' });
  u.admin = { token: l.body.token, id: l.body.user.id };
  for (const [key, role] of [['security', 'security'], ['ravi', 'host']]) {
    const email = `${key}@test.local`;
    const c = await request(app).post('/api/users').set(auth(u.admin.token)).send({ name: key, email, password: 'secret123', role }).expect(201);
    const t = await request(app).post('/api/auth/login').send({ email, password: 'secret123' });
    u[key] = { token: t.body.token, id: c.body.user.id };
  }
});

afterAll(async () => {
  s3Mock.restore();
  storage?.setS3ClientForTests(null);
  await mongoose.disconnect();
  await mongod?.stop();
  await fs.rm(uploadDir, { recursive: true, force: true });
});

beforeEach(() => {
  s3Mock.reset();
  s3Mock.on(PutObjectCommand).resolves({});
  s3Mock.on(DeleteObjectCommand).resolves({});
});

describe('configuration', () => {
  it('validates STORAGE at start-up', () => {
    const saved = { storage: config.storage, ...config.s3 };
    try {
      expect(() => storage.assertStorageConfig()).not.toThrow();
      config.s3.bucket = '';
      expect(() => storage.assertStorageConfig()).toThrow(/AWS_BUCKET/);
      config.storage = 'local';
      expect(() => storage.assertStorageConfig()).not.toThrow();
      expect(() => storage.assertStorageConfig({ requireS3: true })).toThrow(/AWS_BUCKET/);
      config.storage = 's3';
      config.s3.bucket = BUCKET;
      config.s3.region = '';
      expect(() => storage.assertStorageConfig()).toThrow(/AWS_DEFAULT_REGION/);
      config.storage = 'ftp';
      expect(() => storage.assertStorageConfig()).toThrow(/STORAGE must be/);
    } finally {
      config.storage = saved.storage;
      config.s3.bucket = saved.bucket;
      config.s3.region = saved.region;
    }
    expect(config.s3.prefix).toBe('gatebook/'); // trailing slash added
  });
});

describe('S3 driver', () => {
  it('check-in uploads to S3, stores an s3: ref and returns a pre-signed https URL', async () => {
    const r = await checkIn({}, { idPhoto: jpeg }).expect(201);
    const puts = s3Mock.commandCalls(PutObjectCommand);
    expect(puts).toHaveLength(2);
    const [photoPut, idPut] = puts.map((c) => c.args[0].input);
    for (const put of [photoPut, idPut]) {
      expect(put).toMatchObject({ Bucket: BUCKET, ContentType: 'image/jpeg', CacheControl: 'private, max-age=3600' });
      expect(put.Key).toMatch(KEY_RE('visits'));
    }
    expect((await sharp(/** @type {Buffer} */ (photoPut.Body)).metadata()).width).toBe(520);
    expect((await sharp(/** @type {Buffer} */ (idPut.Body)).metadata()).width).toBe(900);

    const doc = await Visit.findOne({ pass: r.body.visit.pass }).lean();
    expect(doc.photo).toBe(`s3:${photoPut.Key}`);
    expect(doc.idPhoto).toBe(`s3:${idPut.Key}`);

    const url = new URL(r.body.visit.photoUrl);
    expect(r.body.visit.photoUrl).toMatch(URL_RE('visits'));
    expect(url.pathname).toBe(`/${photoPut.Key}`);
    expect(url.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('3900');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    expect(r.body.visit.idPhotoUrl).toMatch(URL_RE('visits'));

    // Same URL within the 5-minute window (cacheable), a fresh one later.
    const again = await request(app).get(`/api/visits/${r.body.visit.pass}`).set(auth(u.security.token)).expect(200);
    expect(again.body.visit.photoUrl).toBe(r.body.visit.photoUrl);
    expect(await storage.url(doc.photo, Date.now() + 10 * 60_000)).not.toBe(r.body.visit.photoUrl);
    await request(app).post(`/api/visits/${r.body.visit.pass}/exit`).set(auth(u.security.token)).send({}).expect(200);
  });

  it('mail create stores all three photos under mail/', async () => {
    const r = await multipart(
      '/api/mail',
      { kind: 'Courier', sender: 'Transasia', broughtBy: 'Ramu', recipientId: u.ravi.id },
      { cover: jpeg, coverBack: jpeg, person: jpeg },
    ).expect(201);
    const keys = s3Mock.commandCalls(PutObjectCommand).map((c) => c.args[0].input.Key);
    expect(keys).toHaveLength(3);
    for (const k of keys) expect(k).toMatch(KEY_RE('mail'));
    const doc = await MailItem.findOne({ code: r.body.item.id }).lean();
    expect([doc.cover, doc.coverBack, doc.person]).toEqual(keys.map((k) => `s3:${k}`));
    const bodies = s3Mock.commandCalls(PutObjectCommand).map((c) => /** @type {Buffer} */ (c.args[0].input.Body));
    expect(await Promise.all(bodies.map(async (b) => (await sharp(b).metadata()).width))).toEqual([1100, 1100, 640]);
    expect(r.body.item.coverPhotoUrl).toMatch(URL_RE('mail'));
    expect(r.body.item.coverBackPhotoUrl).toMatch(URL_RE('mail'));
    expect(new URL(r.body.item.coverBackPhotoUrl).pathname).toBe(`/${keys[1]}`);
    expect(r.body.item.personPhotoUrl).toMatch(URL_RE('mail'));
    const list = await request(app).get('/api/mail').set(auth(u.ravi.token)).expect(200);
    expect(list.body.data[0].coverPhotoUrl).toMatch(URL_RE('mail'));
  });

  it('removes the saved mail photos when the third upload fails', async () => {
    s3Mock.on(PutObjectCommand).resolvesOnce({}).resolvesOnce({}).rejectsOnce(new Error('S3 unavailable'));
    const before = await MailItem.countDocuments();
    await multipart(
      '/api/mail',
      { kind: 'Courier', sender: 'Fail Co', broughtBy: 'Ramu', recipientName: 'Someone' },
      { cover: jpeg, coverBack: jpeg, person: jpeg },
    ).expect(500);
    const putKeys = s3Mock.commandCalls(PutObjectCommand).map((c) => c.args[0].input.Key);
    expect(putKeys).toHaveLength(3);
    const deleted = s3Mock.commandCalls(DeleteObjectCommand).map((c) => c.args[0].input);
    expect(deleted).toEqual([
      { Bucket: BUCKET, Key: putKeys[0] },
      { Bucket: BUCKET, Key: putKeys[1] },
    ]);
    expect(await MailItem.countDocuments()).toBe(before);
  });

  it('cleans up the first upload when the second fails', async () => {
    s3Mock.on(PutObjectCommand).resolvesOnce({}).rejectsOnce(new Error('S3 unavailable'));
    await checkIn({ badge: 'S3-2', phone: '9000012346' }, { idPhoto: jpeg }).expect(500);
    const firstKey = s3Mock.commandCalls(PutObjectCommand)[0].args[0].input.Key;
    const deletes = s3Mock.commandCalls(DeleteObjectCommand).map((c) => c.args[0].input);
    expect(deletes).toEqual([{ Bucket: BUCKET, Key: firstKey }]);
    expect(await Visit.exists({ phone10: '9000012346' })).toBeNull();
  });

  it('remove() deletes only keys it created', async () => {
    await storage.remove('s3:gatebook/visits/0123456789abcdef0123456789abcdef.jpg');
    await storage.remove('s3:../../etc/passwd');
    await storage.remove('s3:other/thing.png');
    expect(s3Mock.commandCalls(DeleteObjectCommand).map((c) => c.args[0].input.Key)).toEqual([
      'gatebook/visits/0123456789abcdef0123456789abcdef.jpg',
    ]);
  });

  it('keeps serving pre-S3 local photos through /api/files', async () => {
    const name = await localPhoto();
    const v = await Visit.create({
      pass: 'GB-261015-OLD1', badge: 'OLD', name: 'Old Record', phone: '9111111111', phone10: '9111111111',
      purpose: 'Meeting', host: 'X', site: 'Main Gate', inAt: new Date(), photo: name, outAt: new Date(),
      passReturned: true,
    });
    const r = await request(app).get(`/api/visits/${v.pass}`).set(auth(u.security.token)).expect(200);
    expect(r.body.visit.photoUrl).toMatch(new RegExp(`^/api/files/${name}\\?exp=\\d+&sig=[0-9a-f]{64}$`));
    const img = await request(app).get(r.body.visit.photoUrl).expect(200);
    expect(img.headers['content-type']).toBe('image/jpeg');
    expect(s3Mock.commandCalls(PutObjectCommand)).toHaveLength(0);
  });
});

