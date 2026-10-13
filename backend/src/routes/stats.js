import { Router } from 'express';
import { requireAuth, requireGate } from '../middleware/auth.js';
import { badRequest } from '../middleware/error.js';
import { Visit } from '../models/Visit.js';
import { queryString } from '../services/pagination.js';
import { getSettings } from '../services/settings.js';

export const statsRouter = Router();
statsRouter.use(requireAuth, requireGate);

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

  const [insideNow, overstayCount, today] = await Promise.all([
    Visit.countDocuments({ ...siteFilter, outAt: null }),
    Visit.countDocuments({ ...siteFilter, outAt: null, inAt: { $lt: cutoff } }),
    // Only the fields the aggregation below needs.
    Visit.find({ ...siteFilter, inAt: { $gte: dayStart, $lt: dayEnd } }, { inAt: 1, outAt: 1, persons: 1, purpose: 1, dept: 1 }).lean(),
  ]);

  let personsToday = 0;
  let staySum = 0;
  let stayCount = 0;
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
      byHour: [...hours.entries()].map(([hour, count]) => ({ hour, count })),
      byPurpose: countsDesc(purposes),
      byDept: countsDesc(depts).slice(0, 6),
      overstayHours,
    },
  });
});
