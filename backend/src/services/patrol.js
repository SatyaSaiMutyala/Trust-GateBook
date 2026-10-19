/**
 * Patrol rounds (docs/API.md "Patrols"): each round has start times ("22:00", in the display time zone); every start
 * time each day is a slot that runs `windowMin` minutes. A scan at a checkpoint counts towards the open slot of a round
 * covering it. Late = the first scan came after `onTimeMin`.
 */
import { config } from '../config.js';
import { zonedParts } from './format.js';

const MIN = 60_000;
const DAY = 86_400_000;

/** `"9:05"` → [9, 5], or null. @param {unknown} s */
export function parseTime(s) {
  const m = /^\s*(\d{1,2})[:.](\d{2})\s*$/.exec(String(s ?? ''));
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  return h <= 23 && mi <= 59 ? [h, mi] : null;
}

/** Valid "HH:MM" times, unique and sorted. Accepts an array or "21:00, 23:00". @param {unknown} list */
export function normTimes(list) {
  const raw = Array.isArray(list) ? list : String(list ?? '').split(/[,\s]+/);
  const out = new Set();
  for (const t of raw) {
    const hm = parseTime(t);
    if (hm) out.add(`${String(hm[0]).padStart(2, '0')}:${String(hm[1]).padStart(2, '0')}`);
  }
  return [...out].sort();
}

/**
 * UTC ms of a wall-clock time in the display time zone.
 * @param {number} y @param {number} mo 1-12 @param {number} d @param {number} h @param {number} mi
 */
export function zonedTime(y, mo, d, h, mi, timeZone = config.displayTz) {
  const want = Date.UTC(y, mo - 1, d, h, mi);
  let t = want;
  for (let i = 0; i < 3; i++) {
    const p = zonedParts(new Date(t), timeZone);
    const seen = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    if (seen === want) break;
    t += want - seen;
  }
  return t;
}

/** Local midnight (display time zone) of the day containing `ms`. @param {number} ms */
export function localDayStartMs(ms, timeZone = config.displayTz) {
  const p = zonedParts(new Date(ms), timeZone);
  return zonedTime(p.year, p.month, p.day, 0, 0, timeZone);
}

/**
 * @typedef {{ roundId: string, site: string, at: number, end: number, key: string }} Slot
 * @typedef {{ _id: any, id?: string, site: string, name: string, times: string[], windowMin: number,
 *   onTimeMin: number, checkpointIds: string[], active: boolean, activeFrom?: Date | null }} Round
 */

/** @param {Round} r */
const rid = (r) => String(r.id ?? r._id);
/** @param {Round} r */
const win = (r) => (r.windowMin || 45) * MIN;

/**
 * Slots of active rounds overlapping [from, to], oldest first. Slots that ended before the round's schedule last
 * changed (`activeFrom`) are left out, so a change never raises missed rounds backwards in time.
 * @param {Round[]} rounds @param {number} from @param {number} to @returns {Slot[]}
 */
export function slotsBetween(rounds, from, to, timeZone = config.displayTz) {
  /** @type {Slot[]} */
  const out = [];
  for (const r of rounds) {
    if (!r.active) continue;
    const w = win(r);
    const since = r.activeFrom ? new Date(r.activeFrom).getTime() : 0;
    const times = (r.times ?? []).map(parseTime).filter((x) => x !== null);
    // Walk local days from (from − window) to `to`.
    let day = localDayStartMs(from - w, timeZone);
    for (let guard = 0; day <= to && guard < 400; guard++) {
      const p = zonedParts(new Date(day + 12 * 3_600_000), timeZone); // noon: safe against DST edges
      for (const [h, mi] of times) {
        const at = zonedTime(p.year, p.month, p.day, h, mi, timeZone);
        const end = at + w;
        if (end >= from && at <= to && end > since)
          out.push({ roundId: rid(r), site: r.site, at, end, key: `${rid(r)}@${at}` });
      }
      day = localDayStartMs(day + DAY + 12 * 3_600_000, timeZone);
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/**
 * The open slot a scan at `cp` at time `t` counts towards, or null. With several open rounds covering the checkpoint,
 * the oldest one that still needs it wins. `scans` = earlier scans of this checkpoint `{ roundId, slotAt (ms) }`.
 * @param {Round[]} rounds @param {{ id: string, site: string }} cp @param {number} t @param {any[]} [scans]
 */
export function matchSlot(rounds, cp, t, scans = []) {
  /** @type {Slot[]} */
  const open = [];
  for (const r of rounds) {
    if (!r.active || r.site !== cp.site || !(r.checkpointIds ?? []).map(String).includes(cp.id)) continue;
    const s = slotsBetween([r], t - win(r), t).find((x) => x.at <= t && t <= x.end);
    if (s) open.push(s);
  }
  open.sort((a, b) => a.at - b.at);
  const needs = open.find((s) => !scans.some((sc) => sc.roundId === s.roundId && sc.slotAt === s.at));
  return needs ?? open[0] ?? null;
}

/**
 * Progress of one slot. `scans` = scans with `{ checkpointId, roundId, slotAt (ms), at (ms) }`.
 * @param {Slot} slot @param {Round} round @param {any[]} scans @param {number} now
 */
export function slotProgress(slot, round, scans, now) {
  /** @type {Map<string, any>} */
  const got = new Map();
  for (const sc of scans) {
    if (sc.roundId === slot.roundId && sc.slotAt === slot.at && sc.at <= now && !got.has(sc.checkpointId))
      got.set(sc.checkpointId, sc);
  }
  const ids = (round.checkpointIds ?? []).map(String);
  const doneIds = ids.filter((id) => got.has(id));
  const times = doneIds.map((id) => got.get(id).at);
  const firstAt = times.length ? Math.min(...times) : null;
  const lastAt = times.length ? Math.max(...times) : null;
  const graceMin = round.onTimeMin ?? 10;
  const grace = graceMin * MIN;
  const late = firstAt ? firstAt > slot.at + grace : now > slot.at + grace;
  const lateMin = firstAt
    ? Math.max(0, Math.round((firstAt - slot.at) / MIN))
    : now > slot.at
      ? Math.round((Math.min(now, slot.end) - slot.at) / MIN)
      : 0;
  const done = doneIds.length;
  const total = ids.length;
  let status;
  if (now < slot.at) status = 'upcoming';
  else if (now <= slot.end) status = done === total ? 'done' : 'open';
  else status = done === total ? 'done' : done === 0 ? 'missed' : 'partial';
  return {
    status,
    done,
    total,
    got,
    missing: ids.filter((id) => !got.has(id)),
    firstAt,
    lastAt,
    late,
    lateMin,
    graceMin,
  };
}

/** Final status of an ended slot for the late & missed log. @param {ReturnType<typeof slotProgress>} p */
export const logStatus = (p) =>
  p.total && p.done === p.total ? (p.late ? 'late' : 'on_time') : p.done === 0 ? 'missed' : 'partial';

export const LOG_STATUS_LABEL = { on_time: 'On time', late: 'Late start', partial: 'Partly missed', missed: 'Missed' };

/** "HH:MM" in the display time zone. @param {number} ms */
export function hhmm(ms, timeZone = config.displayTz) {
  const p = zonedParts(new Date(ms), timeZone);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}
