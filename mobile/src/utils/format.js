const LOCALE = 'en-IN';
function toDate(v) {
  return v instanceof Date ? v : new Date(v);
}
/** `10:42 am` */
export function fmtTime(v) {
  const d = toDate(v);
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
}
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const DAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
/** `12 Oct 2026` */
export function fmtDate(v) {
  const d = toDate(v);
  return `${String(d.getDate()).padStart(2, '0')} ${
    MONTHS[d.getMonth()]
  } ${d.getFullYear()}`;
}
/** `12 Oct` */
export function fmtShortDate(v) {
  const d = toDate(v);
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]}`;
}
/** `12 Oct 2026, 10:42 am` */
export function fmtDateTime(v) {
  return `${fmtDate(v)}, ${fmtTime(v)}`;
}
/** `Monday, 12 October` */
export function fmtLongDay(v) {
  const d = toDate(v);
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS_LONG[d.getMonth()]}`;
}
/** Clock with seconds for the check-in header. */
export function fmtClock(d) {
  return d
    .toLocaleTimeString(LOCALE, {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
    .toLowerCase();
}
/** `45m`, `1h 05m` */
export function fmtMinutes(totalMinutes) {
  const mins = Math.max(0, Math.floor(totalMinutes));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}
export function minutesBetween(from, to) {
  return (toDate(to).getTime() - toDate(from).getTime()) / 60000;
}
export function fmtDuration(from, to, now = new Date()) {
  return fmtMinutes(minutesBetween(from, to ?? now));
}
/** First letters of the first two words. */
export function initials(name) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (
    words
      .slice(0, 2)
      .map(w => w[0].toUpperCase())
      .join('') || '?'
  );
}
export function firstName(name) {
  return name.trim().split(/\s+/)[0] ?? name;
}
export function digitsOnly(s) {
  return s.replace(/\D+/g, '');
}
export function last10(phone) {
  return digitsOnly(phone).slice(-10);
}
export function fmtNumber(n) {
  return n.toLocaleString(LOCALE);
}
export function plural(n, one, many = `${one}s`) {
  return `${fmtNumber(n)} ${n === 1 ? one : many}`;
}
export function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
export function addDays(d, days) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}
/** Hour label for bar charts: `6 am`, `12 pm`. */
export function fmtHour(h) {
  const ampm = h >= 12 ? 'pm' : 'am';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh} ${ampm}`;
}

export function isSameDay(a, b) {
  const x = toDate(a);
  const y = toDate(b);
  return (
    x.getFullYear() === y.getFullYear() &&
    x.getMonth() === y.getMonth() &&
    x.getDate() === y.getDate()
  );
}

/** `10:42 am` today, `12 Oct, 10:42 am` otherwise. */
export function fmtTimeOrDate(v, now = new Date()) {
  return isSameDay(v, now) ? fmtTime(v) : `${fmtShortDate(v)}, ${fmtTime(v)}`;
}

/** `25m ago`, `1h 05m ago`. */
export function fmtAgo(v, now = new Date()) {
  return `${fmtMinutes(minutesBetween(v, now))} ago`;
}

/** Inbox times: `Just now`, `5m ago`, `3h ago` (today), `Yesterday 3:10 pm`, else `12 Oct, 3:10 pm`. */
export function fmtRelative(v, now = new Date()) {
  const d = toDate(v);
  const mins = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (isSameDay(d, now)) return `${Math.floor(mins / 60)}h ago`;
  if (isSameDay(d, addDays(startOfDay(now), -1)))
    return `Yesterday ${fmtTime(d)}`;
  return `${fmtShortDate(d)}, ${fmtTime(d)}`;
}

/**
 * Remove emoji / pictographic symbols (and their joiners / variation selectors) from text. The bundled Barlow
 * fonts have no emoji glyphs, so text like "📬 Courier for you" from the server would render with a "?" box.
 * Push notifications shown by the OS keep their emoji; this is for in-app text only.
 */
export function stripEmoji(text) {
  if (!text) return '';
  let out = '';
  for (const ch of String(text)) {
    const cp = ch.codePointAt(0);
    const pictographic =
      (cp >= 0x1f000 && cp <= 0x1faff) || // emoji & pictographs
      (cp >= 0x2600 && cp <= 0x27bf) || // misc symbols, dingbats (☀ ⚠ ✅ ✓ …)
      (cp >= 0x2300 && cp <= 0x23ff) || // technical (⏰ ⌛ …)
      (cp >= 0x2b00 && cp <= 0x2bff) || // arrows / stars (⭐ …)
      cp === 0xfe0f || // variation selector-16
      cp === 0x200d; // zero-width joiner
    if (!pictographic) out += ch;
  }
  return out.replace(/\s{2,}/g, ' ').trim();
}
