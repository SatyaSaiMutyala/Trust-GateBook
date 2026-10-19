/**
 * Generator & diesel (docs/API.md "Generator & diesel"): run hours, the diesel estimate between level readings,
 * consumption between readings, and when the next level check is due.
 */
import { config } from '../config.js';
import { zonedParts } from './format.js';
import { zonedTime } from './patrol.js';

const HOUR = 3_600_000;
const DAY = 86_400_000;

/** @param {Date | number | null | undefined} d */
const ms = (d) => (d == null ? null : typeof d === 'number' ? d : new Date(d).getTime());

/** Hours run within [from, to]. Open runs count up to `to`. @param {any[]} runs @param {number} from @param {number} to */
export function runHours(runs, from, to) {
  return runs.reduce((s, r) => {
    const a = Math.max(ms(r.startAt) ?? 0, from);
    const b = Math.min(ms(r.stopAt) ?? to, to);
    return s + Math.max(0, b - a) / HOUR;
  }, 0);
}

/** Entries with a level (checks, and fills with "level after filling"), oldest first. @param {any[]} fuel */
const readings = (fuel) => fuel.filter((f) => f.levelL != null).sort((a, b) => ms(a.at) - ms(b.at));
/** @param {any} f */
const levelBefore = (f) => (f.kind === 'fill' ? f.levelL - (f.litres || 0) : f.levelL);

/**
 * Diesel now: last reading + fills since − run hours × rated L/h, within 0…tank.
 * @param {any} gen @param {any[]} fuel this generator's entries @param {any[]} runs this generator's runs @param {number} now
 */
export function fuelEstimate(gen, fuel, runs, now) {
  const rd = readings(fuel);
  const last = rd[rd.length - 1];
  if (!last) return null;
  const lastAt = ms(last.at);
  const fills = fuel.filter((f) => f.kind === 'fill' && ms(f.at) > lastAt).reduce((s, f) => s + (f.litres || 0), 0);
  const hours = runHours(runs, lastAt, now);
  let litres = last.levelL + fills - hours * (gen.rateLph || 0);
  litres = Math.max(0, gen.tankL ? Math.min(gen.tankL, litres) : litres);
  return {
    litres: Math.round(litres * 10) / 10,
    pct: gen.tankL ? Math.round((litres / gen.tankL) * 1000) / 10 : null,
    baseAt: new Date(lastAt).toISOString(),
    baseL: last.levelL,
    fills,
    hours: Math.round(hours * 100) / 100,
  };
}

/** Actual use between consecutive readings, newest first. @param {any} gen @param {any[]} fuel @param {any[]} runs */
export function consumption(gen, fuel, runs) {
  const rd = readings(fuel);
  const out = [];
  for (let i = 1; i < rd.length; i++) {
    const a = rd[i - 1];
    const b = rd[i];
    const aAt = ms(a.at);
    const bAt = ms(b.at);
    const fills = fuel
      .filter((f) => f.kind === 'fill' && ms(f.at) > aAt && ms(f.at) < bAt)
      .reduce((s, f) => s + (f.litres || 0), 0);
    const used = a.levelL + fills - levelBefore(b);
    const hours = runHours(runs, aAt, bAt);
    const lph = hours >= 0.25 ? used / hours : null;
    out.push({
      from: new Date(aAt).toISOString(),
      to: new Date(bAt).toISOString(),
      fills,
      used: Math.round(used * 10) / 10,
      hours: Math.round(hours * 100) / 100,
      lph: lph == null ? null : Math.round(lph * 10) / 10,
      high: !!(lph && gen.rateLph && lph > gen.rateLph * 1.25),
      unexplained: hours < 0.25 && used > Math.max(5, (gen.tankL || 0) * 0.03),
    });
  }
  return out.reverse();
}

/** Newest level check, or null. @param {any[]} fuel */
export const lastCheck = (fuel) =>
  fuel.filter((f) => f.kind === 'check').sort((a, b) => ms(b.at) - ms(a.at))[0] ?? null;

/**
 * When the next level check is due: `genCheckDays` after the last check (or after the generator was added), at
 * `genCheckHour` o'clock local time.
 * @param {any} gen @param {any | null} check @param {{ genCheckDays: number, genCheckHour: number }} settings
 */
export function checkDueAt(gen, check, settings, timeZone = config.displayTz) {
  const from = check ? ms(check.at) : (ms(gen.createdAt) ?? Date.now());
  const p = zonedParts(new Date(from + (check ? settings.genCheckDays : 0) * DAY), timeZone);
  return zonedTime(p.year, p.month, p.day, settings.genCheckHour, 0, timeZone);
}
