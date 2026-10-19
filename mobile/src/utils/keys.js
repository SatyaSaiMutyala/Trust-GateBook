/**
 * Key register helpers (docs/API.md "Key register").
 */

export const KEY_STATE = {
  out: { label: 'Out', tone: 'warn' },
  overdue: { label: 'Overdue', tone: 'bad' },
  returned: { label: 'Returned', tone: 'ok' },
  returned_late: { label: 'Returned late', tone: 'muted' },
};

export const DIARY_PERIODS = [
  ['today', 'Today'],
  ['7d', 'Last 7 days'],
  ['30d', 'Last 30 days'],
  ['90d', 'Last 90 days'],
];

/** Next local hh:00 at or after `d` on the same day. @param {Date} d @param {number} h */
const at = (d, h, dayOffset = 0) => {
  const x = new Date(d);
  x.setDate(x.getDate() + dayOffset);
  x.setHours(h, 0, 0, 0);
  return x;
};

/**
 * Return-by quick picks: 1 hour, 2 hours, 6 pm today (when still ahead), tomorrow 10 am.
 * @param {number} [nowMs]
 * @returns {[string, Date][]}
 */
export function dueChips(nowMs = Date.now()) {
  const now = new Date(nowMs);
  const chips = /** @type {[string, Date][]} */ ([
    ['1 hour', new Date(nowMs + 3_600_000)],
    ['2 hours', new Date(nowMs + 2 * 3_600_000)],
  ]);
  const six = at(now, 18);
  if (six.getTime() > nowMs + 30 * 60_000) chips.push(['6 pm today', six]);
  chips.push(['Tomorrow 10 am', at(now, 10, 1)]);
  return chips;
}

/** Free copies of a key. @param {{ copies: number, out: unknown[] }} k */
export const freeCopies = k => Math.max(0, k.copies - k.out.length);
