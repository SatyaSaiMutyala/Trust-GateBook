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
let P;
/** @type {any} */
let models;
/** @type {any} */
let Escalation;
/** @type {Record<string, { token: string, id: string }>} */
const u = {};
const MIN = 60_000;

/** @param {string} t */
const auth = (t) => ({ Authorization: `Bearer ${t}` });
/** @param {string} who @param {string} url @param {object} [body] */
const post = (who, url, body = {}) => request(server).post(url).set(auth(u[who].token)).send(body);
/** @param {string} who @param {string} url @param {object} [body] */
const patch = (who, url, body = {}) => request(server).patch(url).set(auth(u[who].token)).send(body);
/** @param {string} who @param {string} url @param {Record<string, unknown>} [query] */
const get = (who, url, query = {}) => request(server).get(url).query(query).set(auth(u[who].token));
/** Multipart POST with optional photo. @param {string} who @param {string} url @param {Record<string, string>} fields @param {string} [photoField] */
function form(who, url, fields, photoField) {
  let r = request(server).post(url).set(auth(u[who].token));
  for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
  if (photoField) r = r.attach(photoField, jpeg, { filename: 'p.jpg', contentType: 'image/jpeg' });
  return r;
}
/** "HH:MM" (display time zone) `offsetMin` from now. @param {number} offsetMin */
const timeAt = (offsetMin) => P.hhmm(Date.now() + offsetMin * MIN);
/** Escalations sent for refs starting with `prefix`. @param {string} matrix @param {string} prefix */
const sent = async (matrix, prefix) =>
  (await Escalation.find({ matrix, ref: { $regex: `^${prefix}` } }).lean()).map((/** @type {any} */ e) => e.label);

beforeAll(async () => {
  uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gatebook-patrol-test-'));
  process.env.NODE_ENV = 'test';
  process.env.UPLOAD_DIR = uploadDir;
  process.env.JWT_SECRET = 'test-jwt';
  process.env.FILE_URL_SECRET = 'test-files';
  process.env.PACE_EMPLOYEES_URL = '';
  process.env.FIREBASE_SERVICE_ACCOUNT = path.join(uploadDir, 'missing.json');

  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('gatebook-patrol-test'));
  const { bootstrap } = await import('../src/services/bootstrap.js');
  const { createApp } = await import('../src/app.js');
  realtime = await import('../src/realtime.js');
  engine = await import('../src/services/escalation.js');
  P = await import('../src/services/patrol.js');
  models = { ...(await import('../src/models/Patrol.js')), ...(await import('../src/models/Generator.js')) };
  Escalation = (await import('../src/models/Escalation.js')).Escalation;
  await bootstrap();
  await Promise.all(Object.values(models).map((/** @type {any} */ m) => m.init()));

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
    ['supervisor', { name: 'Ramana Supervisor', role: 'security', isSupervisor: true }],
    ['security', { name: 'Suresh Guard', role: 'security' }],
    ['viewer', { name: 'Viewer', role: 'viewer' }],
    ['ravi', { name: 'Ravi Kumar', role: 'host' }],
  ]) {
    const email = `${key}@patrol.local`;
    const c = await request(server)
      .post('/api/users')
      .set(auth(u.admin.token))
      .send({ email, password: 'secret123', ...data })
      .expect(201);
    const l = await request(server).post('/api/auth/login').send({ email, password: 'secret123' });
    u[String(key)] = { token: l.body.token, id: c.body.user.id };
  }
  // The guard reports to the supervisor (patrol Level 1).
  await patch('admin', `/api/users/${u.security.id}`, { reportsTo: u.supervisor.id }).expect(200);
});

afterAll(async () => {
  await realtime?.closeRealtime();
  await new Promise((r) => (server ? server.close(() => r(undefined)) : r(undefined)));
  await mongoose.disconnect();
  await mongod?.stop();
  await fs.rm(uploadDir, { recursive: true, force: true });
});

describe('slot maths', () => {
  it('times are normalised; wall-clock times use the display time zone (IST)', () => {
    expect(P.normTimes('23:00, 9:05 21:00 bad 9:05 24:00')).toEqual(['09:05', '21:00', '23:00']);
    // Midnight IST on 19 Oct 2026 = 18:30 UTC on 18 Oct.
    expect(new Date(P.zonedTime(2026, 10, 19, 0, 0)).toISOString()).toBe('2026-10-18T18:30:00.000Z');
  });

  it('a night round crosses midnight; progress and final status follow the scans', () => {
    const round = {
      _id: 'r1',
      site: 'Main Gate',
      name: 'Night',
      times: ['23:30', '00:30'],
      windowMin: 45,
      onTimeMin: 10,
      checkpointIds: ['a', 'b'],
      active: true,
    };
    const from = P.zonedTime(2026, 10, 19, 23, 0);
    const slots = P.slotsBetween([round], from, from + 3 * 3_600_000);
    expect(slots.map((/** @type {any} */ s) => P.hhmm(s.at))).toEqual(['23:30', '00:30']);
    const s = slots[0];
    const scan = (/** @type {string} */ cp, /** @type {number} */ min) => ({
      checkpointId: cp,
      roundId: 'r1',
      slotAt: s.at,
      at: s.at + min * MIN,
    });
    expect(P.slotProgress(s, round, [], s.at - MIN).status).toBe('upcoming');
    expect(P.slotProgress(s, round, [scan('a', 3)], s.at + 5 * MIN)).toMatchObject({
      status: 'open',
      done: 1,
      late: false,
    });
    const late = P.slotProgress(s, round, [scan('a', 15), scan('b', 20)], s.end + MIN);
    expect(late).toMatchObject({ status: 'done', late: true, lateMin: 15 });
    expect(P.logStatus(late)).toBe('late');
    expect(P.logStatus(P.slotProgress(s, round, [scan('a', 3)], s.end + MIN))).toBe('partial');
    expect(P.logStatus(P.slotProgress(s, round, [], s.end + MIN))).toBe('missed');
    // A schedule change does not judge earlier slots.
    expect(P.slotsBetween([{ ...round, activeFrom: new Date(s.end + MIN) }], from, from + 3 * 3_600_000)).toHaveLength(
      1,
    );
  });
});

describe('patrols', () => {
  /** @type {any[]} */
  const cps = [];
  /** @type {any} */
  let round;

  it('modules: security and viewers have Patrols and Generator, employees do not', async () => {
    const me = (await get('security', '/api/auth/me').expect(200)).body.user;
    expect(me.modules).toEqual(expect.arrayContaining(['patrol', 'gen']));
    await get('ravi', '/api/patrol').expect(403);
    await get('ravi', '/api/gen').expect(403);
  });

  it('admin sets up checkpoints (codes only for admins) and rounds, with validation', async () => {
    await post('admin', '/api/patrol/checkpoints', { name: 'X' }).expect(400);
    for (const [name, photoRequired] of [
      ['Main gate cabin', false],
      ['Reception', false],
      ['Server room door', true],
    ]) {
      cps.push(
        (
          await post('admin', '/api/patrol/checkpoints', {
            site: 'Main Gate',
            name,
            location: 'Ground floor',
            photoRequired,
          }).expect(201)
        ).body.checkpoint,
      );
    }
    expect(cps[0].code).toMatch(/^[A-Z0-9]{6}$/);
    const asGuard = (await get('security', '/api/patrol').expect(200)).body;
    expect(asGuard.checkpoints[0].code).toBeUndefined();
    await post('security', '/api/patrol/checkpoints', { site: 'Main Gate', name: 'Y' }).expect(403);

    const base = { site: 'Main Gate', name: 'Day round', checkpointIds: cps.map((c) => c.id) };
    expect((await post('admin', '/api/patrol/rounds', { ...base, times: 'nope' }).expect(400)).body.error.message).toBe(
      'Add at least one start time, like 22:00',
    );
    expect(
      (await post('admin', '/api/patrol/rounds', { ...base, times: ['09:00'], checkpointIds: [] }).expect(400)).body
        .error.message,
    ).toBe('Pick at least one checkpoint');
    expect(
      (await post('admin', '/api/patrol/rounds', { ...base, name: '', times: ['09:00'] }).expect(400)).body.error
        .message,
    ).toBe('Give the round a name');
    // Started 5 minutes ago, 45 minutes to finish.
    round = (await post('admin', '/api/patrol/rounds', { ...base, times: [timeAt(-5)] }).expect(201)).body.round;
    expect(round).toMatchObject({ windowMin: 45, onTimeMin: 10, times: [timeAt(-5)] });
  });

  it('a guard scans: wrong code, photo rule, issue note, then the round completes', async () => {
    expect((await form('security', '/api/patrol/scan', { code: 'ZZZZZZ' }).expect(404)).body.error.message).toBe(
      'This code does not match any active checkpoint',
    );
    const look = (await get('security', '/api/patrol/lookup', { code: cps[0].code.toLowerCase() }).expect(200)).body;
    expect(look).toMatchObject({ round: { name: 'Day round' }, done: 0, total: 3 });
    const first = (await form('security', '/api/patrol/scan', { code: cps[0].code }).expect(201)).body;
    expect(first.scan).toMatchObject({ roundName: 'Day round', status: 'ok', by: { name: 'Suresh Guard' } });
    expect(first).toMatchObject({ done: 1, total: 3 });
    expect(
      (await form('security', '/api/patrol/scan', { code: cps[1].code, status: 'issue' }).expect(400)).body.error
        .message,
    ).toBe('Describe the issue in the note');
    await form('security', '/api/patrol/scan', {
      code: cps[1].code,
      status: 'issue',
      note: 'Door unlocked',
      manual: 'true',
    }).expect(201);
    expect((await form('security', '/api/patrol/scan', { code: cps[2].code }).expect(400)).body.error.message).toBe(
      'A photo is required at this checkpoint',
    );
    const last = (await form('security', '/api/patrol/scan', { code: cps[2].code }, 'scanPhoto').expect(201)).body;
    expect(last).toMatchObject({ done: 3, total: 3 });
    expect(last.scan.photoUrl).toMatch(/^\/api\/files\//);
    await form('viewer', '/api/patrol/scan', { code: cps[0].code }).expect(403);

    const board = (await get('viewer', '/api/patrol').expect(200)).body;
    const slot = board.slots.find((/** @type {any} */ s) => s.roundId === round.id && s.status !== 'upcoming');
    expect(slot).toMatchObject({ status: 'done', done: 3, total: 3, late: false });
    expect(slot.checkpoints[1]).toMatchObject({ status: 'issue', by: 'Suresh Guard' });
    const scans = (await get('security', '/api/patrol/scans').expect(200)).body;
    expect(scans.data).toHaveLength(3);
    expect(scans.data.find((/** @type {any} */ s) => s.manual)).toMatchObject({ note: 'Door unlocked' });
  });

  it('an issue scan can become an incident (source patrol)', async () => {
    const r = await form('security', '/api/incidents', {
      type: 'Other',
      severity: 'low',
      description: 'Door unlocked',
      location: 'Reception',
      source: 'patrol',
    }).expect(201);
    expect(r.body.incident.source).toBe('patrol');
  });

  it('a late round escalates: due, alarm (repeating), supervisor; when time runs out: missed', async () => {
    const late = (
      await post('admin', '/api/patrol/rounds', {
        site: 'Main Gate',
        name: 'Late round',
        times: [timeAt(-20)],
        checkpointIds: [cps[0].id, cps[1].id],
      }).expect(201)
    ).body.round;
    const now = Date.now();
    await engine.runMatrix('patrol', { nowMs: now });
    let labels = await sent('patrol', late.id);
    expect(labels).toEqual(expect.arrayContaining(['Round due', 'Round late: alarm on guard phone']));
    expect(labels).not.toContain('Escalate to supervisor');
    // +15 min → 35 min after the start: the repeat (every 5) and the supervisor.
    await engine.runMatrix('patrol', { nowMs: now + 15 * MIN });
    labels = await sent('patrol', late.id);
    expect(labels.filter((l) => l === 'Round late: alarm on guard phone').length).toBeGreaterThanOrEqual(2);
    expect(labels).toContain('Escalate to supervisor');
    const sup = await Escalation.findOne({ ref: { $regex: `^${late.id}` }, label: 'Escalate to supervisor' }).lean();
    expect(sup.recipients.map((/** @type {any} */ r) => r.name)).toEqual(['Ramana Supervisor']);
    // After the end (start + 45 min).
    await engine.runMatrix('patrol', { nowMs: now + 30 * MIN });
    labels = await sent('patrol', late.id);
    expect(labels).toEqual(expect.arrayContaining(['Round missed: supervisor', 'Round missed: admin report']));
  });

  it('a started round gets no more late alarms', async () => {
    const own = (await post('admin', '/api/patrol/checkpoints', { site: 'Main Gate', name: 'Terrace door' }).expect(201)).body.checkpoint;
    const r2 = (
      await post('admin', '/api/patrol/rounds', {
        site: 'Main Gate',
        name: 'Started round',
        times: [timeAt(-2)],
        checkpointIds: [own.id, cps[0].id],
      }).expect(201)
    ).body.round;
    const s = (await form('security', '/api/patrol/scan', { code: own.code }).expect(201)).body;
    expect(s.round.name).toBe('Started round');
    await engine.runMatrix('patrol', { nowMs: Date.now() + 20 * MIN });
    const labels = await sent('patrol', r2.id);
    expect(labels).toContain('Round due');
    expect(labels).not.toContain('Round late: alarm on guard phone');
  });

  it('the late & missed log lists ended rounds with status and escalations; CSV', async () => {
    // Judge from 2 days ago: today's and yesterday's slot 3 h ago have ended unscanned.
    const r3 = (
      await post('admin', '/api/patrol/rounds', {
        site: 'Main Gate',
        name: 'Old round',
        times: [timeAt(-180)],
        checkpointIds: [cps[0].id],
      }).expect(201)
    ).body.round;
    await models.PatrolRound.updateOne({ _id: r3.id }, { $set: { activeFrom: new Date(Date.now() - 2 * 86_400_000) } });
    const log = (await get('security', '/api/patrol/log', { days: 7 }).expect(200)).body;
    const rows = log.data.filter((/** @type {any} */ r) => r.roundId === r3.id);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows[0]).toMatchObject({ logStatus: 'missed', done: 0, total: 1, missing: ['Main gate cabin'] });
    expect(log.summary.missed).toBeGreaterThanOrEqual(2);
    const all = (await get('security', '/api/patrol/log', { days: 1, filter: 'all' }).expect(200)).body;
    expect(all.summary.rounds).toBeGreaterThanOrEqual(1);
    await get('security', '/api/patrol/log', { days: 5 }).expect(400);
    const csv = await get('viewer', '/api/patrol/log.csv', { days: 7 }).expect(200);
    expect(csv.text).toContain('Old round');
    expect(csv.text).toContain('Missed');
  });

  it('a new code stops the old one; a schedule change restarts judging', async () => {
    const old = cps[1].code;
    const r = (await patch('admin', `/api/patrol/checkpoints/${cps[1].id}`, { newCode: true }).expect(200)).body
      .checkpoint;
    expect(r.code).not.toBe(old);
    await form('security', '/api/patrol/scan', { code: old }).expect(404);
    const before = await models.PatrolRound.findById(round.id).lean();
    await patch('admin', `/api/patrol/rounds/${round.id}`, { onTimeMin: 15 }).expect(200);
    expect((await models.PatrolRound.findById(round.id).lean()).activeFrom.getTime()).toBe(before.activeFrom.getTime());
    await patch('admin', `/api/patrol/rounds/${round.id}`, { times: ['08:00', '20:00'] }).expect(200);
    expect((await models.PatrolRound.findById(round.id).lean()).activeFrom.getTime()).toBeGreaterThan(
      before.activeFrom.getTime(),
    );
  });
});

describe('generator & diesel', () => {
  /** @type {any} */
  let gen;

  it('admin adds a generator; validation', async () => {
    expect(
      (await post('admin', '/api/gen/generators', { name: 'DG-1', site: 'Main Gate' }).expect(400)).body.error.message,
    ).toBe('Name, gate/site and tank capacity are required');
    await post('security', '/api/gen/generators', { name: 'DG-1', site: 'Main Gate', tankL: 100 }).expect(403);
    gen = (
      await post('admin', '/api/gen/generators', {
        name: 'DG-1',
        site: 'Main Gate',
        kva: '125',
        tankL: 100,
        rateLph: 10,
        lowPct: 30,
      }).expect(201)
    ).body.generator;
    expect(gen).toMatchObject({ name: 'DG-1', tankL: 100, running: null, estimate: null, lastCheck: null });
  });

  it('start, refuse a second start, stop with hour meter rules', async () => {
    const run = (await post('security', `/api/gen/${gen.id}/start`, { reason: 'Power cut', hm: 1180.2 }).expect(201))
      .body.run;
    expect(run).toMatchObject({ reason: 'Power cut', hmStart: 1180.2, stopAt: null });
    expect((await post('security', `/api/gen/${gen.id}/start`, {}).expect(409)).body.error.message).toBe(
      'DG-1 is already running',
    );
    const status = (await get('viewer', '/api/gen').expect(200)).body.generators[0];
    expect(status.running.id).toBe(run.id);
    expect((await post('security', `/api/gen/runs/${run.id}/stop`, { hm: 1100 }).expect(400)).body.error.message).toBe(
      "Hour meter can't be lower than at start (1180.2)",
    );
    const stopped = (
      await post('security', `/api/gen/runs/${run.id}/stop`, { hm: 1181, note: 'Grid restored' }).expect(200)
    ).body.run;
    expect(stopped).toMatchObject({ hmEnd: 1181, note: 'Grid restored', stoppedBy: { name: 'Suresh Guard' } });
    await post('security', `/api/gen/runs/${run.id}/stop`, {}).expect(409);
    await post('viewer', `/api/gen/${gen.id}/start`, {}).expect(403);
    const runs = (await get('security', '/api/gen/runs').expect(200)).body;
    expect(runs.data[0]).toMatchObject({ genName: 'DG-1', reason: 'Power cut' });
    expect((await get('security', '/api/gen/runs.csv').expect(200)).text).toContain('Grid restored');
  });

  it('diesel: check needs a level and a gauge photo; fills; the estimate and low diesel', async () => {
    expect(
      (await form('security', `/api/gen/${gen.id}/fuel`, { kind: 'check' }, 'genPhoto').expect(400)).body.error.message,
    ).toBe('Enter the level reading in litres');
    expect(
      (await form('security', `/api/gen/${gen.id}/fuel`, { kind: 'check', levelL: '20' }).expect(400)).body.error
        .message,
    ).toBe('A photo of the gauge or dipstick is required');
    expect(
      (await form('security', `/api/gen/${gen.id}/fuel`, { kind: 'check', levelL: '200' }, 'genPhoto').expect(400)).body
        .error.message,
    ).toBe('Level must be between 0 and the tank capacity (100 L)');
    expect((await form('security', `/api/gen/${gen.id}/fuel`, { kind: 'fill' }).expect(400)).body.error.message).toBe(
      'Enter the litres filled',
    );
    await form('security', `/api/gen/${gen.id}/fuel`, { kind: 'check', levelL: '20', hm: '1181' }, 'genPhoto').expect(
      201,
    );
    let g = (await get('security', '/api/gen').expect(200)).body.generators[0];
    expect(g).toMatchObject({ low: true, checkOverdue: false, estimate: { litres: 20, pct: 20 } });
    expect(g.lastCheck.photoUrl).toMatch(/^\/api\/files\//);

    // Low diesel escalates at once to guards and admins.
    await engine.runMatrix('genlow');
    expect(await sent('genlow', gen.id)).toEqual(
      expect.arrayContaining(['Low diesel', 'Low diesel: arrange a refill']),
    );
    const lowSince = (await models.Generator.findById(gen.id).lean()).lowSince;
    expect(lowSince).toBeTruthy();

    await form('security', `/api/gen/${gen.id}/fuel`, {
      kind: 'fill',
      litres: '60',
      vendor: 'HP bunk',
      billNo: '2231',
      amount: '5460',
    }).expect(201);
    g = (await get('security', '/api/gen').expect(200)).body.generators[0];
    expect(g).toMatchObject({ low: false, estimate: { litres: 80 }, month: { filledL: 60 } });
    await engine.runMatrix('genlow');
    expect((await models.Generator.findById(gen.id).lean()).lowSince).toBeNull();

    const fuel = (await get('security', '/api/gen/fuel', { genId: gen.id }).expect(200)).body;
    expect(fuel.data.map((/** @type {any} */ f) => f.kind)).toEqual(['fill', 'check']);
    expect((await get('viewer', '/api/gen/fuel.csv').expect(200)).text).toContain('HP bunk');
  });

  it('the weekly level check falls due and escalates', async () => {
    const days = (await get('admin', '/api/settings').expect(200)).body.settings.genCheckDays;
    expect(days).toBe(7);
    const now = Date.now();
    await engine.runMatrix('gencheck', { nowMs: now + 6 * 86_400_000 });
    expect(await sent('gencheck', gen.id)).toHaveLength(0);
    // The sweep runs all the time: step through the days in 3-hour steps.
    for (let h = 6 * 24; h <= 9 * 24; h += 3) await engine.runMatrix('gencheck', { nowMs: now + h * 3_600_000 });
    expect(await sent('gencheck', gen.id)).toEqual(
      expect.arrayContaining(['Diesel level check due', 'Diesel check 1 day overdue']),
    );
  });

  it('the overview carries patrol and generator numbers', async () => {
    const o = (await get('security', '/api/stats/overview').expect(200)).body.overview;
    expect(o.patrolsToday).toEqual(
      expect.objectContaining({ ended: expect.any(Number), complete: expect.any(Number), dueNow: expect.any(Number) }),
    );
    expect(typeof o.genRunning).toBe('number');
    expect(typeof o.genAlerts).toBe('number');
  });
});
