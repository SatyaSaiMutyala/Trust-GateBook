import { Router } from 'express';
import { requireAuth, requireGate, requireModule } from '../middleware/auth.js';
import { badRequest } from '../middleware/error.js';
import { Expected } from '../models/Expected.js';
import { Incident } from '../models/Incident.js';
import { KeyMove } from '../models/Key.js';
import { FuelEntry, GenRun, Generator } from '../models/Generator.js';
import { PatrolRound, PatrolScan } from '../models/Patrol.js';
import { checkDueAt, fuelEstimate, lastCheck } from '../services/gen.js';
import { slotProgress, slotsBetween } from '../services/patrol.js';
import { Visit } from '../models/Visit.js';
import { queryString } from '../services/pagination.js';
import { getSettings } from '../services/settings.js';

export const statsRouter = Router();

/**
 * Patrol rounds today (ended: done / total / missed; due now) and generator alerts for the Overview.
 * @param {number} nowMs @param {number} dayStartMs @param {number} dayEndMs
 */
async function opsSummary(nowMs, dayStartMs, dayEndMs) {
  const rounds = await PatrolRound.find({ active: true }).lean();
  const slots = slotsBetween(rounds, dayStartMs, Math.min(dayEndMs, nowMs)).filter((s) => s.at >= dayStartMs && s.at <= nowMs);
  const scans = slots.length
    ? (await PatrolScan.find({ roundId: { $ne: null }, slotAt: { $gte: new Date(slots[0].at) } }, { checkpointId: 1, roundId: 1, slotAt: 1, at: 1 }).lean()).map((s) => ({
        ...s,
        slotAt: s.slotAt?.getTime() ?? null,
        at: s.at.getTime(),
      }))
    : [];
  const byId = new Map(rounds.map((r) => [r._id.toString(), r]));
  let ended = 0;
  let complete = 0;
  let dueNow = 0;
  for (const sl of slots) {
    const p = slotProgress(sl, /** @type {any} */ (byId.get(sl.roundId)), scans, nowMs);
    if (p.status === 'open') dueNow++;
    else if (sl.end < nowMs) {
      ended++;
      if (p.done === p.total) complete++;
    }
  }
  const settings = await getSettings();
  const gens = await Generator.find({ active: true }).lean();
  let genRunning = 0;
  let genAlerts = 0;
  for (const g of gens) {
    const id = g._id.toString();
    const [fuel, runs] = await Promise.all([
      FuelEntry.find({ genId: id }).sort({ at: -1 }).limit(200).lean(),
      GenRun.find({ genId: id, $or: [{ stopAt: null }, { stopAt: { $gte: new Date(nowMs - 120 * DAY_MS) } }] }).lean(),
    ]);
    if (runs.some((r) => !r.stopAt)) genRunning++;
    const est = fuelEstimate(g, fuel, runs, nowMs);
    const low = !!(est && est.pct !== null && est.pct < g.lowPct);
    if (low || nowMs >= checkDueAt(g, lastCheck(fuel), settings)) genAlerts++;
  }
  return { patrolsToday: { ended, complete, missed: ended - complete, dueNow }, genRunning, genAlerts };
}
statsRouter.use(requireAuth, requireGate, requireModule('track'));

const DAY_MS = 86_400_000;

/**
 * Start of the client's local day (as a UTC instant) for a JS getTimezoneOffset() value.
 * @param {number} nowMs
 * @param {number} tzOffsetMin
 */
export function localDayStart(nowMs, tzOffsetMin) {
  const localNow = nowMs - tzOffsetMin * 60_000;
  return Math.floor(localNow / DAY_MS) * DAY_MS + tzOffsetMin * 60_000;
}

/** @param {Map<string, number>} map */
function countsDesc(map) {
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

statsRouter.get('/overview', async (req, res) => {
  const site = queryString(req.query, 'site');
  let tzOffset = -330;
  const tzRaw = queryString(req.query, 'tzOffset');
  if (tzRaw !== undefined) {
    tzOffset = Number(tzRaw);
    if (!Number.isInteger(tzOffset) || Math.abs(tzOffset) > 14 * 60) {
      throw badRequest('tzOffset must be minutes from getTimezoneOffset().', 'tzOffset');
    }
  }

  const now = Date.now();
  const { overstayHours } = await getSettings();
  const siteFilter = site ? { site } : {};
  const dayStart = new Date(localDayStart(now, tzOffset));
  const dayEnd = new Date(dayStart.getTime() + DAY_MS);
  const cutoff = new Date(now - overstayHours * 3_600_000);

  const nowDate = new Date(now);
  const [insideNow, overstayCount, waitingAtGate, expectedToday, today, keysOut, keysOverdue, incidentsOpen] = await Promise.all([
    Visit.countDocuments({ ...siteFilter, outAt: null }),
    Visit.countDocuments({ ...siteFilter, outAt: null, inAt: { $lt: cutoff } }),
    // Still at the gate: not let in yet and not declined (older visits have no hostStatus and were let in).
    Visit.countDocuments({ ...siteFilter, outAt: null, allowedAt: null, hostStatus: { $in: ['waiting', 'manual', 'accepted'] } }),
    // Pre-registered for today and not here yet.
    Expected.countDocuments({ ...siteFilter, status: 'expected', expectedAt: { $gte: dayStart, $lt: dayEnd } }),
    // Only the fields the aggregation below needs.
    Visit.find({ ...siteFilter, inAt: { $gte: dayStart, $lt: dayEnd } }, { inAt: 1, outAt: 1, persons: 1, purpose: 1, dept: 1, hostVia: 1, hostAt: 1, escalatedAt: 1 }).lean(),
    // Key register and incidents (Phase 6).
    KeyMove.countDocuments({ ...siteFilter, returnedAt: null }),
    KeyMove.countDocuments({ ...siteFilter, returnedAt: null, dueAt: { $ne: null, $lt: nowDate } }),
    Incident.countDocuments({ ...siteFilter, status: { $ne: 'closed' } }),
  ]);

  let personsToday = 0;
  let staySum = 0;
  let stayCount = 0;
  let replySum = 0;
  let replyCount = 0;
  let noReplyToday = 0;
  /** @type {Map<number, number>} */
  const hours = new Map();
  for (let h = 6; h <= 22; h++) hours.set(h, 0);
  /** @type {Map<string, number>} */
  const purposes = new Map();
  /** @type {Map<string, number>} */
  const depts = new Map();

  for (const v of today) {
    personsToday += v.persons ?? 1;
    if (v.outAt) {
      staySum += v.outAt.getTime() - v.inAt.getTime();
      stayCount++;
    }
    // Hosts who answered in the app (not phone confirmations recorded by security).
    if (v.hostVia === 'app' && v.hostAt) {
      replySum += v.hostAt.getTime() - v.inAt.getTime();
      replyCount++;
    }
    if (v.escalatedAt) noReplyToday++;
    const msIntoDay = (((v.inAt.getTime() - tzOffset * 60_000) % DAY_MS) + DAY_MS) % DAY_MS;
    const bucket = Math.min(22, Math.max(6, Math.floor(msIntoDay / 3_600_000)));
    hours.set(bucket, (hours.get(bucket) ?? 0) + 1);
    purposes.set(v.purpose, (purposes.get(v.purpose) ?? 0) + 1);
    const dept = v.dept?.trim() ? v.dept.trim() : 'Not set';
    depts.set(dept, (depts.get(dept) ?? 0) + 1);
  }

  res.json({
    overview: {
      insideNow,
      entriesToday: today.length,
      personsToday,
      avgStayMinutes: stayCount ? Math.round(staySum / stayCount / 60_000) : null,
      overstayCount,
      waitingAtGate,
      expectedToday,
      keysOut,
      keysOverdue,
      incidentsOpen,
      ...(await opsSummary(now, dayStart.getTime(), dayEnd.getTime())),
      avgHostReplyMinutes: replyCount ? Math.round((replySum / replyCount / 60_000) * 10) / 10 : null,
      noReplyToday,
      byHour: [...hours.entries()].map(([hour, count]) => ({ hour, count })),
      byPurpose: countsDesc(purposes),
      byDept: countsDesc(depts).slice(0, 6),
      overstayHours,
    },
  });
});
