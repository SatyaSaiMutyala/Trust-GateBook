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
/**
 * Where an open visit is in host approval, for the status chip and the gate's actions.
 * tone: 'wait' (amber), 'go' (green), 'bad' (red), 'neutral'.
 * @param {import('../types').Visit} v
 * @returns {{ key: string, label: string, tone: 'wait' | 'go' | 'bad' | 'neutral' } | null}  null = nothing to show
 */
export function hostStage(v) {
  if (v.outAt) return null;
  if (v.hostStatus === 'declined') return { key: 'declined', label: 'Host declined', tone: 'bad' };
  if (v.allowedAt) return null; // let in: the normal Inside / Overstay chip covers it
  if (v.hostStatus === 'accepted') return { key: 'accepted', label: 'Accepted · send in', tone: 'go' };
  if (v.hostStatus === 'manual') return { key: 'manual', label: 'Confirm by phone', tone: 'wait' };
  if (v.escalatedAt) return { key: 'noreply', label: 'No reply · call host', tone: 'bad' };
  return { key: 'waiting', label: 'Waiting for host', tone: 'wait' };
}

/** The host's answer in words (details drawer, log). @param {import('../types').Visit} v */
export function hostReplyText(v) {
  if (v.hostStatus === 'accepted') {
    if (v.hostVia === 'phone') return 'Confirmed by phone';
    return v.hostVia === 'preapproved' ? 'Pre-approved' : 'Accepted';
  }
  if (v.hostStatus === 'declined') return 'Declined';
  if (v.hostStatus === 'waiting') return v.escalatedAt ? 'No reply' : 'No reply yet';
  return 'Not on TruSentinel';
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
