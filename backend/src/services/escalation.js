/**
 * Escalation engine (docs/API.md "Escalations"). Every 30 s it walks the open items of each matrix
 * (services/escalationDefs.js) and sends each step that has come due — once, or every `repeat` minutes — to its
 * target, resolved through the reporting hierarchy (`User.reportsTo`). Every step sent is written to the
 * escalation log; the log's unique key makes a step go out once even when sweeps overlap.
 *
 * The visitor matrix's first step to guards is the host-approval "no reply" alert: it also sets `visit.escalatedAt`
 * (the gate's "No reply · call host") and keeps its `visit_no_reply` notification.
 */
import { Escalation } from '../models/Escalation.js';
import { FuelEntry, GenRun, Generator } from '../models/Generator.js';
import { Incident } from '../models/Incident.js';
import { PatrolRound, PatrolScan } from '../models/Patrol.js';
import { KeyMove } from '../models/Key.js';
import { MailItem } from '../models/MailItem.js';
import { MP_OPEN, MaterialPass } from '../models/MaterialPass.js';
import { User } from '../models/User.js';
import { Visit } from '../models/Visit.js';
import { emitVisitUpdated } from '../realtime.js';
import { MATRICES, TARGET_LABEL, noReplyStepIndex } from './escalationDefs.js';
import { formatDuration } from './format.js';
import { checkDueAt, fuelEstimate, lastCheck } from './gen.js';
import { hhmm, slotProgress, slotsBetween } from './patrol.js';
import { hasModule } from './modules.js';
import { notify } from './notify.js';
import { getSettings } from './settings.js';

const SWEEP_EVERY_MS = 30_000;
const MIN_MS = 60_000;
const HOUR_MS = 3_600_000;
/** After downtime, steps that came due longer ago than this are skipped instead of sent late. */
const GRACE_MS = 24 * HOUR_MS;
const MAX_LEVEL_HOPS = 8;

/** @typedef {import('./escalationDefs.js').EscStep} EscStep */
/** @typedef {import('./escalationDefs.js').MatrixKey} MatrixKey */

/**
 * The people in Gatebook who can be reached, loaded once per sweep.
 * @returns {Promise<Directory>}
 */
export async function loadDirectory() {
  const users = await User.find(
    { active: true, status: { $nin: ['pending', 'deleted'] } },
    { name: 1, role: 1, modules: 1, reportsTo: 1, isSupervisor: 1, passwordHash: 1, site: 1 },
  ).lean();
  return new Directory(users);
}

/** Works at this gate, or at all gates. @param {any} u @param {string | undefined} site */
const atSite = (u, site) => !site || !u.site || u.site === site;

class Directory {
  /** @param {any[]} users */
  constructor(users) {
    /** @type {Map<string, any>} */
    this.byId = new Map(users.map((u) => [u._id.toString(), u]));
    /** People someone reports to (managers). */
    this.managers = new Set(users.filter((u) => u.reportsTo).map((u) => u.reportsTo.toString()));
  }

  /** @param {string | null | undefined} id */
  get(id) {
    return id ? (this.byId.get(String(id)) ?? null) : null;
  }

  /** @param {(u: any) => boolean} pred */
  filter(pred) {
    return [...this.byId.values()].filter(pred);
  }

  admins() {
    return this.filter((u) => u.role === 'admin');
  }

  /**
   * Guards on duty: security with the module at this gate (or at all gates), not supervisors or managers. Nobody
   * like that → all such security.
   * @param {string} module
   * @param {string} [site]
   */
  guards(module, site) {
    const security = this.filter(
      (u) => u.role === 'security' && hasModule(u, /** @type {any} */ (module)) && atSite(u, site),
    );
    const onDuty = security.filter((u) => !u.isSupervisor && !this.managers.has(u._id.toString()));
    return onDuty.length ? onDuty : security;
  }

  /** Gate supervisors with the module, at this gate (or all gates). @param {string} module @param {string} [site] */
  supervisors(module, site) {
    return this.filter(
      (u) => u.role !== 'host' && u.isSupervisor && hasModule(u, /** @type {any} */ (module)) && atSite(u, site),
    );
  }

  /**
   * `n` hops up `reportsTo` from a person (cycle-safe); null when the chain is shorter.
   * @param {string | null | undefined} personId
   * @param {number} n
   */
  levelUp(personId, n) {
    let cur = this.get(personId);
    const seen = new Set();
    for (let i = 0; i < n; i++) {
      if (!cur || seen.has(cur._id.toString()) || i > MAX_LEVEL_HOPS) return null;
      seen.add(cur._id.toString());
      cur = this.get(cur.reportsTo);
    }
    return cur;
  }

  /**
   * Who a step reaches. Nobody at a level (or the target is gone) → admins, with a note, so nothing is missed.
   * @param {string} to
   * @param {{ personId: string | null, personName: string, module: string, personGuards?: boolean, site?: string }} ctx
   * @returns {{ users: any[], targetName: string, note: string }}
   */
  resolve(to, ctx) {
    const admins = () => this.admins();
    // Patrol / generator: the people concerned are the guards; their levels go up from each guard.
    if (ctx.personGuards) {
      if (to === 'person') to = 'guards';
      const lv = /^l([123])$/.exec(to);
      if (lv) {
        const n = Number(lv[1]);
        const ups = new Map();
        for (const g of this.guards(ctx.module, ctx.site)) {
          const m = this.levelUp(g._id.toString(), n);
          if (m) ups.set(m._id.toString(), m);
        }
        return ups.size
          ? { users: [...ups.values()], targetName: `Level ${n}: ${[...ups.values()].map((u) => u.name).join(', ')}`, note: '' }
          : { users: admins(), targetName: `Level ${n}`, note: `Nobody set at Level ${n}: sent to admins` };
      }
    }
    if (to === 'guards') {
      const g = this.guards(ctx.module, ctx.site);
      return g.length
        ? { users: g, targetName: TARGET_LABEL.guards, note: '' }
        : { users: admins(), targetName: TARGET_LABEL.guards, note: 'No guards have this module: sent to admins' };
    }
    if (to === 'supervisors') {
      const s = this.supervisors(ctx.module, ctx.site);
      return s.length
        ? { users: s, targetName: TARGET_LABEL.supervisors, note: '' }
        : { users: admins(), targetName: TARGET_LABEL.supervisors, note: 'No gate supervisor set: sent to admins' };
    }
    if (to === 'admins') return { users: admins(), targetName: TARGET_LABEL.admins, note: '' };
    if (to === 'person') {
      const p = this.get(ctx.personId);
      return p
        ? { users: [p], targetName: p.name, note: '' }
        : {
            users: admins(),
            targetName: ctx.personName || 'The person concerned',
            note: `${ctx.personName || 'They'} cannot sign in to Gatebook: sent to admins`,
          };
    }
    const level = /^l([123])$/.exec(to);
    if (level) {
      const n = Number(level[1]);
      const m = this.levelUp(ctx.personId, n);
      return m
        ? { users: [m], targetName: `Level ${n}: ${m.name}`, note: '' }
        : { users: admins(), targetName: `Level ${n}`, note: `Nobody set at Level ${n}: sent to admins` };
    }
    const named = /^user:(.+)$/.exec(to);
    const u = named ? this.get(named[1]) : null;
    return u
      ? { users: [u], targetName: u.name, note: '' }
      : { users: admins(), targetName: 'A named person', note: 'That person is no longer active: sent to admins' };
  }
}

/**
 * Which occurrence of a step is due now (1 = the first; repeats count up), or 0 when not due / too old.
 * @param {EscStep} step
 * @param {number} startMs clock start
 * @param {number} nowMs
 */
export function dueOccurrence(step, startMs, nowMs) {
  const first = startMs + step.after * MIN_MS;
  if (nowMs < first) return 0;
  const n = step.repeat > 0 ? Math.floor((nowMs - first) / (step.repeat * MIN_MS)) + 1 : 1;
  const dueAt = first + (n - 1) * step.repeat * MIN_MS;
  return nowMs - dueAt > GRACE_MS ? 0 : n;
}

/**
 * @typedef {object} Item
 * @property {string} ref
 * @property {'visit' | 'mail' | 'material' | 'key' | 'incident' | 'patrol' | 'gen'} refType
 * @property {string} item  text for the log
 * @property {string} site
 * @property {number} startMs
 * @property {string | null} personId
 * @property {string} personName
 * @property {(step: EscStep) => { title: string, body: string }} message
 * @property {number} [endMs] clock for "when time runs out" steps
 * @property {(step: EscStep) => boolean} [skip] true = do not send this step for this item
 * @property {any} doc
 */

/** Open items per matrix. @param {MatrixKey} key @param {any} settings @param {number} nowMs @returns {Promise<Item[]>} */
async function openItems(key, settings, nowMs) {
  if (key === 'visitor') {
    const visits = await Visit.find({ outAt: null, hostStatus: 'waiting', allowedAt: null }).lean();
    return visits.map((v) => ({
      ref: v.pass,
      refType: 'visit',
      item: `${v.name}${v.badge ? ` · pass ${v.badge}` : ''}`,
      site: v.site,
      startMs: v.inAt.getTime(),
      personId: v.hostId ?? null,
      personName: v.host,
      doc: v,
      message: (s) => ({
        title: `${s.alarm ? '🚨' : '⏰'} ${s.label || `No reply from ${v.host}`}`,
        body: `${v.name} has waited ${formatDuration(nowMs - v.inAt.getTime())} for ${v.host}${v.badge ? ` · pass ${v.badge}` : ''}`,
      }),
    }));
  }
  if (key === 'overstay') {
    const limitMs = settings.overstayHours * HOUR_MS;
    const visits = await Visit.find({ outAt: null, inAt: { $lte: new Date(nowMs - limitMs) } }).lean();
    return visits.map((v) => ({
      ref: v.pass,
      refType: 'visit',
      item: `${v.name}${v.badge ? ` · pass ${v.badge}` : ''}`,
      site: v.site,
      startMs: v.inAt.getTime() + limitMs,
      personId: v.hostId ?? null,
      personName: v.host,
      doc: v,
      message: (s) => ({
        title: `${s.alarm ? '🚨' : '⏰'} ${s.label || 'Visitor overstaying'}`,
        body: `${v.name} has been inside ${formatDuration(nowMs - v.inAt.getTime())} · meeting ${v.host}${v.badge ? ` · pass ${v.badge}` : ''}`,
      }),
    }));
  }
  if (key === 'mpreceipt' || key === 'mpapproval' || key === 'material') return materialItems(key, nowMs);
  if (key === 'keys') return keyItems(nowMs);
  if (key.startsWith('incident_')) return incidentItems(/** @type {any} */ (key), nowMs);
  if (key === 'patrol') return patrolItems(nowMs);
  if (key === 'gencheck' || key === 'genlow') return genItems(key, settings, nowMs);
  const items = await MailItem.find({ status: 'lodged' }).lean();
  return items.map((m) => ({
    ref: m.code,
    refType: 'mail',
    item: `${m.kind} from ${m.sender} for ${m.recipientName}`,
    site: m.site,
    startMs: m.receivedAt.getTime(),
    personId: m.recipient?.id ?? null,
    personName: m.recipientName,
    doc: m,
    message: (s) => ({
      title: `${s.alarm ? '🚨' : '📬'} ${s.label || 'Post not collected'}`,
      body: `${m.kind} from ${m.sender} for ${m.recipientName} · waiting ${formatDuration(nowMs - m.receivedAt.getTime())}`,
    }),
  }));
}

/**
 * Open material passes per matrix: IN waiting for the employee to accept, OUT waiting for approval, returnable
 * passes past their return date. The person concerned is the authorising employee.
 * @param {'mpreceipt' | 'mpapproval' | 'material'} key
 * @param {number} nowMs
 * @returns {Promise<Item[]>}
 */
async function materialItems(key, nowMs) {
  const filter =
    key === 'mpreceipt'
      ? { status: 'awaiting_receipt' }
      : key === 'mpapproval'
        ? { status: 'awaiting_approval' }
        : { status: { $in: MP_OPEN }, returnDue: { $ne: null, $lte: new Date(nowMs) } };
  const passes = await MaterialPass.find(filter).lean();
  return passes.map((m) => {
    const who = m.carrier?.name || m.pickerName || m.carrier?.company || '';
    const what = `${m.direction === 'in' ? 'IN' : 'OUT'} ${m.boxes} box${m.boxes === 1 ? '' : 'es'}${who ? ` · ${who}` : ''} · ${m.code}`;
    return {
      ref: m.code,
      refType: /** @type {const} */ ('material'),
      item: what,
      site: m.site,
      startMs: key === 'material' && m.returnDue ? m.returnDue.getTime() : m.createdAt.getTime(),
      personId: m.authorisedBy?.id ?? null,
      personName: m.authorisedBy?.name ?? '',
      doc: m,
      message: (s) => ({
        title: `${s.alarm ? '🚨' : '📦'} ${s.label || MATRICES[key].title}`,
        body:
          key === 'material'
            ? `${what} · was due ${m.returnDue ? formatDuration(nowMs - m.returnDue.getTime()) + ' ago' : ''}`
            : `${what} · waiting ${formatDuration(nowMs - m.createdAt.getTime())}`,
      }),
    };
  });
}

/** Keys out past their return time. The person concerned is the holder when they are on Gatebook. @param {number} nowMs @returns {Promise<Item[]>} */
async function keyItems(nowMs) {
  const moves = await KeyMove.find({ returnedAt: null, dueAt: { $ne: null, $lte: new Date(nowMs) } }).lean();
  return moves.map((m) => {
    const what = `Key ${m.key.number} (${m.key.name}) with ${m.taker.name}`;
    return {
      ref: m._id.toString(),
      refType: /** @type {const} */ ('key'),
      item: what,
      site: m.site,
      startMs: /** @type {Date} */ (m.dueAt).getTime(),
      personId: m.taker.id ?? null,
      personName: m.taker.name ?? '',
      doc: m,
      message: (s) => ({
        title: `${s.alarm ? '🚨' : '🔑'} ${s.label || MATRICES.keys.title}`,
        body: `${what}${m.taker.phone ? ` · ${m.taker.phone}` : ''} · overdue ${formatDuration(nowMs - /** @type {Date} */ (m.dueAt).getTime())}`,
      }),
    };
  });
}

/**
 * Incidents not closed, one matrix per severity. The person concerned is the assigned person, else the reporter.
 * @param {'incident_critical' | 'incident_high' | 'incident_medium' | 'incident_low'} key
 * @param {number} nowMs
 * @returns {Promise<Item[]>}
 */
async function incidentItems(key, nowMs) {
  const severity = key.slice('incident_'.length);
  const incidents = await Incident.find({ severity, status: { $ne: 'closed' } }).lean();
  return incidents.map((i) => {
    const person = i.assignedTo ?? i.reportedBy;
    const what = `${i.type}${i.location ? ` · ${i.location}` : ''} · ${i.code}`;
    return {
      ref: i.code,
      refType: /** @type {const} */ ('incident'),
      item: what,
      site: i.site,
      startMs: i.reportedAt.getTime(),
      personId: person?.id ?? null,
      personName: person?.name ?? '',
      doc: i,
      message: (s) => ({
        title: `${s.alarm ? '🚨' : '⚠️'} ${s.label || MATRICES[key].title}`,
        body: `${what} · reported by ${i.reportedBy.name} ${formatDuration(nowMs - i.reportedAt.getTime())} ago`,
      }),
    };
  });
}

/**
 * Patrol slots that started in the last day and are not complete. Steps after the start fire only while the round
 * has not started; "when time runs out" steps once the slot has ended.
 * @param {number} nowMs @returns {Promise<Item[]>}
 */
async function patrolItems(nowMs) {
  const rounds = await PatrolRound.find({ active: true }).lean();
  if (!rounds.length) return [];
  const slots = slotsBetween(rounds, nowMs - 25 * 3_600_000, nowMs).filter((s) => s.at <= nowMs);
  if (!slots.length) return [];
  const scans = (
    await PatrolScan.find({ roundId: { $ne: null }, slotAt: { $gte: new Date(slots[0].at) } }, { checkpointId: 1, roundId: 1, slotAt: 1, at: 1 }).lean()
  ).map((s) => ({ ...s, slotAt: s.slotAt?.getTime() ?? null, at: s.at.getTime() }));
  const byId = new Map(rounds.map((r) => [r._id.toString(), r]));
  /** @type {Item[]} */
  const out = [];
  for (const sl of slots) {
    const r = /** @type {any} */ (byId.get(sl.roundId));
    const pr = slotProgress(sl, r, scans, nowMs);
    if (!pr.total || pr.done === pr.total) continue;
    const what = `${r.name} ${hhmm(sl.at)}`;
    out.push({
      ref: sl.key,
      refType: 'patrol',
      item: what,
      site: sl.site,
      startMs: sl.at,
      endMs: sl.end,
      personId: null,
      personName: '',
      doc: sl,
      skip: (s) => !s.end && s.after > 0 && pr.firstAt !== null,
      message: (s) => ({
        title: `${s.alarm ? '🚨' : '🛡️'} ${s.label || MATRICES.patrol.title}: ${what}`,
        body: `${pr.done} of ${pr.total} checkpoints scanned${nowMs > sl.end ? '' : ` · ends ${hhmm(sl.end)}`}`,
      }),
    });
  }
  return out;
}

/**
 * Generators with an overdue level check (`gencheck`, clock from when it was due) or low diesel (`genlow`, clock
 * from when the estimate first fell below the alert level — kept on the generator as `lowSince`).
 * @param {'gencheck' | 'genlow'} key @param {any} settings @param {number} nowMs @returns {Promise<Item[]>}
 */
async function genItems(key, settings, nowMs) {
  const gens = await Generator.find({ active: true }).lean();
  /** @type {Item[]} */
  const out = [];
  for (const g of gens) {
    const id = g._id.toString();
    const fuel = await FuelEntry.find({ genId: id }).sort({ at: -1 }).limit(200).lean();
    let startMs;
    let text;
    if (key === 'gencheck') {
      startMs = checkDueAt(g, lastCheck(fuel), settings);
      if (startMs > nowMs) continue;
      text = 'Photograph the gauge or dipstick and record the level.';
    } else {
      const runs = await GenRun.find({ genId: id, $or: [{ stopAt: null }, { stopAt: { $gte: new Date(nowMs - 120 * 86_400_000) } }] }).lean();
      const est = fuelEstimate(g, fuel, runs, nowMs);
      const low = !!(est && est.pct !== null && est.pct < g.lowPct);
      if (!low) {
        if (g.lowSince) await Generator.updateOne({ _id: g._id }, { $set: { lowSince: null } });
        continue;
      }
      let since = g.lowSince;
      if (!since) {
        since = new Date(nowMs);
        await Generator.updateOne({ _id: g._id, lowSince: null }, { $set: { lowSince: since } });
      }
      startMs = since.getTime();
      text = `About ${Math.round(est.litres)} L left (${Math.round(est.pct ?? 0)}%). Arrange a refill.`;
    }
    out.push({
      ref: `${id}@${startMs}`,
      refType: 'gen',
      item: g.name,
      site: g.site,
      startMs,
      personId: null,
      personName: '',
      doc: g,
      message: (s) => ({ title: `${s.alarm ? '🚨' : '⛽'} ${s.label || MATRICES[key].title}: ${g.name}`, body: text }),
    });
  }
  return out;
}

/**
 * Sends the due steps of one matrix.
 * @param {MatrixKey} key
 * @param {{ nowMs?: number, settings?: any, dir?: Directory }} [opts]
 * @returns {Promise<{ sent: number, noReply: number }>} steps sent; visits newly flagged "no reply"
 */
export async function runMatrix(key, opts = {}) {
  const nowMs = opts.nowMs ?? Date.now();
  const settings = opts.settings ?? (await getSettings());
  const steps = settings.esc[key] ?? [];
  if (!steps.length) return { sent: 0, noReply: 0 };
  const items = await openItems(key, settings, nowMs);
  if (!items.length) return { sent: 0, noReply: 0 };
  const dir = opts.dir ?? (await loadDirectory());
  const meta = MATRICES[key];
  const noReplyIdx = key === 'visitor' ? noReplyStepIndex(steps) : -1;
  let sent = 0;
  let noReply = 0;

  for (const it of items) {
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const occurrence = step.end
        ? dueOccurrence({ ...step, after: 0 }, it.endMs ?? it.startMs, nowMs)
        : dueOccurrence(step, it.startMs, nowMs);
      if (!occurrence) continue;
      if (it.skip?.(step)) continue;
      // The no-reply step also flags the visit, once, with a conditional update.
      if (i === noReplyIdx && occurrence === 1) {
        if (!it.doc.escalatedAt) {
          const visit = await Visit.findOneAndUpdate(
            { _id: it.doc._id, outAt: null, hostStatus: 'waiting', escalatedAt: null, allowedAt: null },
            { $set: { escalatedAt: new Date(nowMs) } },
            { returnDocument: 'after' },
          );
          if (visit) {
            noReply++;
            emitVisitUpdated(visit);
          }
        }
      }
      const { users, targetName, note } = dir.resolve(step.to, {
        personId: it.personId,
        personName: it.personName,
        module: meta.module,
        personGuards: 'personGuards' in meta && meta.personGuards,
        site: it.site,
      });
      const msg = i === noReplyIdx ? noReplyMessage(it.doc, nowMs) : it.message(step);
      try {
        await Escalation.create({
          matrix: key,
          refType: it.refType,
          ref: it.ref,
          item: it.item,
          site: it.site,
          step: i,
          occurrence,
          at: new Date(nowMs),
          title: msg.title,
          label: step.label,
          target: step.to,
          targetName,
          recipients: users.map((u) => ({ id: u._id.toString(), name: u.name })),
          note,
          alarm: step.alarm,
        });
      } catch (e) {
        if (/** @type {any} */ (e)?.code === 11000) continue; // already sent (another sweep, or earlier)
        throw e;
      }
      sent++;
      void notify(
        users.map((u) => u._id.toString()),
        {
          event: i === noReplyIdx ? 'visit_no_reply' : 'escalation',
          title: msg.title,
          body: note ? `${msg.body} · ${note}` : msg.body,
          data: { type: it.refType, id: it.ref },
          alarm: step.alarm,
        },
      );
    }
  }
  return { sent, noReply };
}

/** The host-approval no-reply text (unchanged from before the matrix). @param {any} v @param {number} nowMs */
function noReplyMessage(v, nowMs) {
  return {
    title: `⏰ No reply from ${v.host}`,
    body: `${v.name} has waited ${formatDuration(nowMs - v.inAt.getTime())}${v.hostPhone ? ` · call ${v.hostPhone}` : ' · call the host'}`,
  };
}

/** One sweep over every matrix. @param {number} [nowMs] */
export async function sweepEscalations(nowMs = Date.now()) {
  const settings = await getSettings();
  const dir = await loadDirectory();
  let sent = 0;
  for (const key of /** @type {MatrixKey[]} */ (Object.keys(MATRICES))) {
    sent += (await runMatrix(key, { nowMs, settings, dir })).sent;
  }
  return sent;
}

/** Runs the sweep every 30 s. @returns {() => void} stop */
export function startEscalationSweep() {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    sweepEscalations()
      .catch((e) => console.error('[escalation] sweep failed:', e instanceof Error ? e.message : e))
      .finally(() => {
        running = false;
      });
  }, SWEEP_EVERY_MS);
  timer.unref();
  return () => clearInterval(timer);
}
