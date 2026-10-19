/**
 * Host approval helpers (docs/API.md "Host approval").
 * hostStatus: waiting (asked in the app) · accepted · declined · manual (host not on Gatebook: confirm by phone).
 */

/**
 * Where an open visit is in host approval, for the chip and the gate's actions; null = nothing to show
 * (exited, or already let in — the normal Inside / Overstay chip covers it).
 * tone: 'wait' (amber) · 'go' (green) · 'bad' (red).
 */
export function hostStage(v) {
  if (!v || v.outAt) return null;
  if (v.hostStatus === 'declined')
    return { key: 'declined', label: 'Host declined', tone: 'bad' };
  if (v.allowedAt) return null;
  if (v.hostStatus === 'accepted')
    return { key: 'accepted', label: 'Accepted · send in', tone: 'go' };
  if (v.hostStatus === 'manual')
    return { key: 'manual', label: 'Confirm by phone', tone: 'wait' };
  if (v.escalatedAt)
    return { key: 'noreply', label: 'No reply · call host', tone: 'bad' };
  return { key: 'waiting', label: 'Waiting for host', tone: 'wait' };
}

/** The host's answer in words. */
export function hostReplyText(v) {
  if (v.hostStatus === 'accepted')
    return v.hostVia === 'phone'
      ? 'Confirmed by phone'
      : v.hostVia === 'preapproved'
      ? 'Pre-approved'
      : 'Accepted';
  if (v.hostStatus === 'declined') return 'Declined';
  if (v.hostStatus === 'waiting')
    return v.escalatedAt ? 'No reply' : 'No reply yet';
  return 'Not on Gatebook';
}

/** Visits from before host approval: let in at check-in, no host steps to show. */
export const isLegacyVisit = v => v.hostStatus === 'manual' && !!v.allowedAt;

/** `tel:` URL for a phone number as typed ("98765 00001" → "tel:9876500001"). */
export const telUrl = phone => `tel:${String(phone).replace(/[^\d+]/g, '')}`;
