/** Overstay is server-computed at fetch time; re-derive it as the clock moves. */
export function isOverstay(v, overstayHours, now) {
  if (v.outAt) return false;
  if (v.overstay) return true;
  if (!overstayHours) return false;
  return now - new Date(v.inAt).getTime() > overstayHours * 3_600_000;
}
export function visitStatus(v, overstayHours, now) {
  if (v.outAt) return 'exited';
  return isOverstay(v, overstayHours, now) ? 'overstay' : 'inside';
}
export function passNotReturned(v) {
  return !!v.outAt && !!v.badge && v.passReturned === false;
}
/** Same fields the server's `q` searches. */
export function matchesQuery(v, q) {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [v.badge, v.name, v.phone, v.pass, v.company, v.host, v.vehicle, v.dept].some((f) =>
    (f ?? '').toLowerCase().includes(needle),
  );
}
