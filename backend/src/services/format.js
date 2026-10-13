import { config } from '../config.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** @type {Map<string, Intl.DateTimeFormat>} */
const partsFormatters = new Map();

/**
 * Calendar parts of `date` in a time zone.
 * @param {Date} date
 * @param {string} [timeZone]
 * @returns {{ year: number, month: number, day: number, hour: number, minute: number }}
 */
export function zonedParts(date, timeZone = config.displayTz) {
  let fmt = partsFormatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    });
    partsFormatters.set(timeZone, fmt);
  }
  /** @type {Record<string, number>} */
  const p = {};
  for (const part of fmt.formatToParts(date)) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  return { year: p.year, month: p.month, day: p.day, hour: p.hour % 24, minute: p.minute };
}

/** @param {number} n */
const pad2 = (n) => String(n).padStart(2, '0');

/** `10:42 am` @param {Date} date @param {string} [timeZone] */
export function formatTime(date, timeZone = config.displayTz) {
  const { hour, minute } = zonedParts(date, timeZone);
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${pad2(minute)} ${hour < 12 ? 'am' : 'pm'}`;
}

/** `12 Oct 2026` @param {Date} date @param {string} [timeZone] */
export function formatDate(date, timeZone = config.displayTz) {
  const { year, month, day } = zonedParts(date, timeZone);
  return `${pad2(day)} ${MONTHS[month - 1]} ${year}`;
}

/** `12 Oct 2026, 10:42 am` @param {Date} date @param {string} [timeZone] */
export function formatDateTime(date, timeZone = config.displayTz) {
  return `${formatDate(date, timeZone)}, ${formatTime(date, timeZone)}`;
}

/** `2026-10-12` in the display time zone. @param {Date} date @param {string} [timeZone] */
export function isoDay(date, timeZone = config.displayTz) {
  const { year, month, day } = zonedParts(date, timeZone);
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** `45m`, `1h 05m` @param {number} ms */
export function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 60_000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h ${pad2(m)}m` : `${m}m`;
}
