import { Router } from 'express';
import { currentUser, requireAuth, requireGate } from '../middleware/auth.js';
import { Expected } from '../models/Expected.js';
import { FuelEntry, GenRun, Generator } from '../models/Generator.js';
import { Incident } from '../models/Incident.js';
import { KeyMove } from '../models/Key.js';
import { MailItem } from '../models/MailItem.js';
import { MP_GATE, MaterialPass } from '../models/MaterialPass.js';
import { PatrolRound, PatrolScan } from '../models/Patrol.js';
import { Visit } from '../models/Visit.js';
import { formatDate, formatDateTime, formatDuration, formatTime } from '../services/format.js';
import { checkDueAt, fuelEstimate, lastCheck } from '../services/gen.js';
import { hasModule } from '../services/modules.js';
import { queryString } from '../services/pagination.js';
import { hhmm, localDayStartMs, slotProgress, slotsBetween } from '../services/patrol.js';
import { getSettings } from '../services/settings.js';

/**
 * TRACK (docs/API.md "TRACK"): everything at a gate that needs someone to act now, worked out on the server so the
 * web app and the phones show the same list. Gate users; each category only for those with its module.
 */
export const trackRouter = Router();
trackRouter.use(requireAuth, requireGate);

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/** Category order and the module each needs. */
export const TRACK_CATS = /** @type {const} */ ([
  ['visitors', 'Visitors at the gate', ['visitors', 'track']],
  ['material', 'Material', ['material']],
  ['keys', 'Keys', ['keys']],
  ['patrol', 'Patrols', ['patrol']],
  ['incidents', 'Incidents', ['incidents']],
  ['gen', 'Generator', ['gen']],
  ['post', 'Post room', ['post']],
]);

/**
 * @typedef {object} TrackItem
 * @property {string} id      stable key for the item
 * @property {string} cat     category (TRACK_CATS)
 * @property {string} kind    what it is: visit_go | visit_declined | visit_noreply | visit_manual | mail_disputed |
 *   material_disputed | material_overdue | key_overdue | patrol_late | patrol_due | incident_critical | gen_low | gen_check
 * @property {'go' | 'bad' | 'slow' | 'phone' | 'alarm'} tone  go = ready to act, alarm = ringing (patrol late)
 * @property {string} title
 * @property {string} body
 * @property {string} at      when it started (sort / "since")
 * @property {{ type: string, id: string }} ref  what to open
 * @property {Record<string, unknown>} [extra]  data for the buttons (phone numbers, badge, …)
 */

/** @param {string} site */
const at = (site) => (site ? { site } : {});
/** @param {Date | number} d */
const iso = (d) => new Date(d).toISOString();

/** Visitors waiting on the gate: send in, declined, no reply, host not on Gatebook. */
async function visitorItems(site, settings, nowMs) {
  const visits = await Visit.find({
    ...at(site),
    outAt: null,
    allowedAt: null,
    hostStatus: { $in: ['accepted', 'declined', 'waiting', 'manual'] },
  })
    .sort({ inAt: 1 })
    .lean();
  /** @type {TrackItem[]} */
  const out = [];
  const replyMin = settings.hostReplyMinutes;
  for (const v of visits) {
    const base = {
      cat: 'visitors',
      ref: { type: 'visit', id: v.pass },
      extra: { visitId: v.pass, name: v.name, badge: v.badge ?? '', hostPhone: v.hostPhone ?? '' },
    };
    const pass = v.badge ? ` · pass ${v.badge}` : '';
    if (v.hostStatus === 'accepted') {
      const pre = v.hostVia === 'preapproved';
      out.push({
        ...base,
        id: `visit_go:${v.pass}`,
        kind: 'visit_go',
        tone: 'go',
        title: `Send ${v.name} in${pass}`,
        body:
          (pre
            ? `Expected visitor, pre-approved by ${v.host}`
            : `${v.host} accepted${v.hostAt ? ` at ${formatTime(v.hostAt)}` : ''}`) +
          (v.hostLocation ? ` · ${v.hostLocation}` : '') +
          (v.hostNote ? ` · “${v.hostNote}”` : ''),
        at: iso(v.hostAt ?? v.inAt),
      });
    } else if (v.hostStatus === 'declined') {
      out.push({
        ...base,
        id: `visit_declined:${v.pass}`,
        kind: 'visit_declined',
        tone: 'bad',
        title: `${v.name}: host declined`,
        body: `${v.host}${v.hostNote ? `: “${v.hostNote}”` : ''}. ${v.badge ? `Collect pass ${v.badge} and record exit.` : 'Record exit.'}`,
        at: iso(v.hostAt ?? v.inAt),
      });
    } else if (v.hostStatus === 'waiting' && v.escalatedAt) {
      out.push({
        ...base,
        id: `visit_noreply:${v.pass}`,
        kind: 'visit_noreply',
        tone: 'slow',
        title: `No reply${replyMin ? ` in ${replyMin} min` : ''}: call ${v.host}`,
        body: `${v.name} has waited ${formatDuration(nowMs - v.inAt.getTime())}.${v.hostPhone ? ` Host phone ${v.hostPhone}.` : ' No phone number saved for this host.'}`,
        at: iso(v.escalatedAt),
      });
    } else if (v.hostStatus === 'manual') {
      out.push({
        ...base,
        id: `visit_manual:${v.pass}`,
        kind: 'visit_manual',
        tone: 'phone',
        title: `Call ${v.host} to confirm ${v.name}`,
        body: `Host is not registered on Gatebook.${v.badge ? ` ${v.name} has pass ${v.badge}.` : ''}`,
        at: iso(v.inAt),
      });
    }
  }
  // Order within visitors: send in, declined, no reply, call to confirm.
  const rank = { go: 0, bad: 1, slow: 2, phone: 3 };
  return out.sort((a, b) => /** @type {any} */ (rank)[a.tone] - /** @type {any} */ (rank)[b.tone]);
}

/** Post the receiver says they did not get. */
async function postItems(site) {
  const items = await MailItem.find({ ...at(site), status: 'disputed' })
    .sort({ confirmedAt: 1 })
    .lean();
  return items.map((m) => ({
    id: `mail_disputed:${m.code}`,
    cat: 'post',
    kind: 'mail_disputed',
    tone: /** @type {const} */ ('bad'),
    title: `${m.recipientName} says they did not get it`,
    body: `${m.kind} from ${m.sender}, handed to ${m.collectedBy || 'someone'}${m.handedAt ? ` at ${formatTime(m.handedAt)}` : ''}${m.disputeNote ? ` · “${m.disputeNote}”` : ''}`,
    at: iso(m.confirmedAt ?? m.handedAt ?? m.receivedAt),
    ref: { type: 'mail', id: m.code },
  }));
}

/** Material: boxes the employee says did not reach them; returnable material past its date. */
async function materialItems(site, nowMs) {
  const passes = await MaterialPass.find({
    ...at(site),
    $or: [
      { status: 'disputed' },
      { status: { $in: ['pending_return', 'partly_returned'] }, returnDue: { $ne: null, $lt: new Date(nowMs) } },
    ],
  })
    .sort({ createdAt: 1 })
    .lean();
  return passes.map((m) => {
    const who = m.carrier?.name || m.pickerName || m.carrier?.company || '';
    const boxes = `${m.boxes} box${m.boxes === 1 ? '' : 'es'}`;
    const ref = { type: 'material', id: m.code };
    if (m.status === 'disputed')
      return {
        id: `material_disputed:${m.code}`,
        cat: 'material',
        kind: 'material_disputed',
        tone: /** @type {const} */ ('bad'),
        title: `${m.authorisedBy?.name ?? 'The employee'} says boxes not received: ${m.code}`,
        body: `${boxes}${who ? ` · brought by ${who}` : ''}${m.receiptNote ? ` · “${m.receiptNote}”` : ''}`,
        at: iso(m.receivedAt ?? m.createdAt),
        ref,
      };
    return {
      id: `material_overdue:${m.code}`,
      cat: 'material',
      kind: 'material_overdue',
      tone: /** @type {const} */ ('bad'),
      title: m.direction === 'out' ? `Material not back: ${m.code}` : `Material not taken back out: ${m.code}`,
      body: `${boxes}${who ? ` · ${who}` : ''} · was due ${formatDate(/** @type {Date} */ (m.returnDue))}`,
      at: iso(/** @type {Date} */ (m.returnDue)),
      ref,
    };
  });
}

/** Keys past their return time. */
async function keyItems(site, nowMs) {
  const moves = await KeyMove.find({ ...at(site), returnedAt: null, dueAt: { $ne: null, $lt: new Date(nowMs) } })
    .sort({ dueAt: 1 })
    .lean();
  return moves.map((m) => ({
    id: `key_overdue:${m._id}`,
    cat: 'keys',
    kind: 'key_overdue',
    tone: /** @type {const} */ ('bad'),
    title: `Key ${m.key.number} not returned`,
    body: `${m.key.name} · with ${m.taker.name}${m.taker.phone ? ` (${m.taker.phone})` : ''} · was due ${formatDateTime(/** @type {Date} */ (m.dueAt))}`,
    at: iso(/** @type {Date} */ (m.dueAt)),
    ref: { type: 'key', id: m._id.toString() },
    extra: {
      moveId: m._id.toString(),
      phone: m.taker.phone ?? '',
      number: m.key.number,
      name: m.key.name,
      takerName: m.taker.name,
    },
  }));
}

/** Patrol rounds open now (started in the last 4 hours): late ones ring. */
async function patrolItems(site, nowMs) {
  const rounds = await PatrolRound.find({ ...at(site), active: true }).lean();
  const slots = slotsBetween(rounds, nowMs - 4 * HOUR, nowMs).filter((s) => s.at <= nowMs && nowMs <= s.end);
  if (!slots.length) return [];
  const scans = (
    await PatrolScan.find(
      { roundId: { $ne: null }, slotAt: { $gte: new Date(slots[0].at) } },
      { checkpointId: 1, roundId: 1, slotAt: 1, at: 1 },
    ).lean()
  ).map((s) => ({ ...s, slotAt: s.slotAt?.getTime() ?? null, at: s.at.getTime() }));
  const byId = new Map(rounds.map((r) => [r._id.toString(), r]));
  /** @type {TrackItem[]} */
  const out = [];
  for (const sl of slots) {
    const r = /** @type {any} */ (byId.get(sl.roundId));
    const p = slotProgress(sl, r, scans, nowMs);
    if (p.status !== 'open') continue;
    const what = `${r.name} ${hhmm(sl.at)}`;
    const base = {
      cat: 'patrol',
      at: iso(sl.at),
      ref: { type: 'patrol', id: sl.key },
      extra: { slotKey: sl.key, done: p.done, total: p.total },
    };
    if (p.late)
      out.push({
        ...base,
        id: `patrol_late:${sl.key}`,
        kind: 'patrol_late',
        tone: 'alarm',
        title: `LATE: ${what} ${p.done ? 'not finished' : 'not started'}`,
        body: `${p.done} of ${p.total} scanned · ${Math.round((nowMs - sl.at) / MIN)} min after start time · supervisor is alerted per the escalation matrix`,
      });
    else
      out.push({
        ...base,
        id: `patrol_due:${sl.key}`,
        kind: 'patrol_due',
        tone: 'phone',
        title: `Patrol due: ${what}`,
        body: `${p.done} of ${p.total} checkpoints scanned · on time till ${hhmm(sl.at + p.graceMin * MIN)} · ${formatDuration(sl.end - nowMs)} left`,
      });
  }
  return out;
}

/** Critical incidents not closed. */
async function incidentItems(site) {
  const list = await Incident.find({ ...at(site), severity: 'critical', status: { $ne: 'closed' } })
    .sort({ reportedAt: 1 })
    .lean();
  return list.map((i) => ({
    id: `incident_critical:${i.code}`,
    cat: 'incidents',
    kind: 'incident_critical',
    tone: /** @type {const} */ ('bad'),
    title: `Critical incident: ${i.type}`,
    body: `${i.location || i.site} · reported ${formatDateTime(i.reportedAt)} by ${i.reportedBy.name}${i.assignedTo ? ` · with ${i.assignedTo.name}` : ' · not assigned'}`,
    at: iso(i.reportedAt),
    ref: { type: 'incident', id: i.code },
  }));
}

/** Generators low on diesel or due a level check. */
async function genItems(site, settings, nowMs) {
  const gens = await Generator.find({ ...at(site), active: true }).lean();
  /** @type {TrackItem[]} */
  const out = [];
  for (const g of gens) {
    const id = g._id.toString();
    const [fuel, runs] = await Promise.all([
      FuelEntry.find({ genId: id }).sort({ at: -1 }).limit(200).lean(),
      GenRun.find({ genId: id, $or: [{ stopAt: null }, { stopAt: { $gte: new Date(nowMs - 120 * DAY) } }] }).lean(),
    ]);
    const est = fuelEstimate(g, fuel, runs, nowMs);
    if (est && est.pct !== null && est.pct < g.lowPct)
      out.push({
        id: `gen_low:${id}`,
        cat: 'gen',
        kind: 'gen_low',
        tone: 'bad',
        title: `Low diesel: ${g.name}`,
        body: `About ${Math.round(est.litres)} L left (${Math.round(est.pct)}%). Arrange a refill.`,
        at: iso(g.lowSince ?? nowMs),
        ref: { type: 'gen', id },
        extra: { genId: id },
      });
    const due = checkDueAt(g, lastCheck(fuel), settings);
    if (nowMs >= due)
      out.push({
        id: `gen_check:${id}`,
        cat: 'gen',
        kind: 'gen_check',
        tone: 'slow',
        title: `Diesel level check due: ${g.name}`,
        body: 'Photograph the gauge or dipstick and record the level.',
        at: iso(due),
        ref: { type: 'gen', id },
        extra: { genId: id },
      });
  }
  return out;
}

/** Expected visitors / deliveries in the next 2 hours (not counted as items). */
async function expectedSoon(site, nowMs) {
  const list = await Expected.find({
    ...at(site),
    status: 'expected',
    expectedAt: { $gte: new Date(localDayStartMs(nowMs)), $lte: new Date(nowMs + 2 * HOUR) },
  })
    .sort({ expectedAt: 1 })
    .limit(50)
    .lean();
  return list.map((e) => ({
    id: e.code,
    kind: e.kind,
    title: e.kind === 'delivery' ? `Delivery · ${e.company || e.name}` : e.name,
    body: `${formatTime(e.expectedAt)}${e.kind === 'delivery' ? (e.boxes ? ` · ${e.boxes} box${e.boxes === 1 ? '' : 'es'}` : '') : e.company ? ` · ${e.company}` : ''} · for ${e.contact?.name ?? e.host.name}`,
    at: iso(e.expectedAt),
  }));
}

// GET /api/track?site= — { items, counts { total, urgent, byCat }, cats, expectedSoon, materialInProgress }
trackRouter.get('/', async (req, res) => {
  const user = currentUser(req);
  const site = queryString(req.query, 'site') ?? '';
  const nowMs = Date.now();
  const settings = await getSettings();
  const can = (/** @type {readonly string[]} */ mods) => mods.some((m) => hasModule(user, /** @type {any} */ (m)));
  /** @type {Record<string, () => Promise<TrackItem[]>>} */
  const load = {
    visitors: () => visitorItems(site, settings, nowMs),
    material: () => materialItems(site, nowMs),
    keys: () => keyItems(site, nowMs),
    patrol: () => patrolItems(site, nowMs),
    incidents: () => incidentItems(site),
    gen: () => genItems(site, settings, nowMs),
    post: () => postItems(site),
  };
  const cats = TRACK_CATS.filter(([, , mods]) => can(mods));
  const lists = await Promise.all(cats.map(([k]) => load[k]()));
  const items = lists.flat();
  const [soon, inProgress] = await Promise.all([
    can(['visitors', 'track', 'expected']) ? expectedSoon(site, nowMs) : [],
    can(['material'])
      ? MaterialPass.countDocuments({ ...at(site), status: { $in: [...MP_GATE, 'awaiting_receipt'] } })
      : 0,
  ]);
  /** @type {Record<string, number>} */
  const byCat = {};
  for (const i of items) byCat[i.cat] = (byCat[i.cat] ?? 0) + 1;
  res.json({
    items,
    counts: { total: items.length, urgent: items.filter((i) => i.tone !== 'phone').length, byCat },
    cats: cats.map(([key, label]) => ({ key, label })),
    expectedSoon: soon,
    materialInProgress: inProgress,
    now: iso(nowMs),
  });
});
