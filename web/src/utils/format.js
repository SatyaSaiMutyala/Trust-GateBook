// Formatting per docs/SPEC.md: locale en-IN, time `10:42 am`, date `12 Oct 2026`,
// date-time `12 Oct 2026, 10:42 am`, duration `45m` / `1h 05m`.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function toDate(d) {
  return d instanceof Date ? d : new Date(d);
}
const pad2 = (n) => String(n).padStart(2, '0');
export function fmtTime(d) {
  const x = toDate(d);
  if (Number.isNaN(x.getTime())) return '';
  const h = x.getHours();
  return `${h % 12 || 12}:${pad2(x.getMinutes())} ${h < 12 ? 'am' : 'pm'}`;
}
export function fmtDate(d) {
  const x = toDate(d);
  if (Number.isNaN(x.getTime())) return '';
  return `${pad2(x.getDate())} ${MONTHS[x.getMonth()]} ${x.getFullYear()}`;
}
export function fmtDateTime(d) {
  return `${fmtDate(d)}, ${fmtTime(d)}`;
}
/** "Monday, 12 October" */
export function fmtLongDay(d = new Date()) {
  return new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }).format(toDate(d));
}
export function fmtMinutes(totalMinutes) {
  const m = Math.max(0, Math.floor(totalMinutes));
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${pad2(m % 60)}m`;
}
export function durationMinutes(from, to, now = Date.now()) {
  const start = toDate(from).getTime();
  const end = to ? toDate(to).getTime() : now;
  return Math.max(0, (end - start) / 60000);
}
export function fmtDuration(from, to, now) {
  return fmtMinutes(durationMinutes(from, to, now));
}
export function initials(name) {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}
export function firstName(name) {
  return name.trim().split(/\s+/)[0] ?? name;
}
export function digitsOnly(s) {
  return s.replace(/\D/g, '');
}
export function plural(n, one, many = `${one}s`) {
  return `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`;
}
/** Hour label for bar charts: 6 → "6 am", 12 → "12 pm". */
export function fmtHour(h) {
  return `${h % 12 || 12} ${h < 12 ? 'am' : 'pm'}`;
}
/** Value for <input type="datetime-local"> in local time. */
export function toLocalInput(d) {
  const x = toDate(d);
  return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}T${pad2(x.getHours())}:${pad2(x.getMinutes())}`;
}
/** Value for <input type="date"> in local time. */
export function toLocalDateInput(d) {
  const x = toDate(d);
  return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`;
}
export function startOfLocalDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
export function addDays(d, days) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}
/** Parse "YYYY-MM-DD" as a local date. */
export function parseLocalDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/**
 * Relative time for notification rows: "Just now", "5m ago", "3h ago" (today), "Yesterday 3:10 pm",
 * otherwise "12 Oct 2026, 3:10 pm".
 */
export function fmtRelative(d, now = Date.now()) {
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  const mins = Math.floor((now - x.getTime()) / 60000);
  const today = startOfLocalDay(new Date(now));
  if (x >= today) {
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ago`;
  }
  if (x >= addDays(today, -1)) return `Yesterday ${fmtTime(x)}`;
  return fmtDateTime(x);
}
