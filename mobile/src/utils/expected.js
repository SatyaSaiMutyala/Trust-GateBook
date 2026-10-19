/**
 * Expected visitors & deliveries (docs/API.md "Expected visitors & deliveries").
 * state: expected · late · missed (an earlier day) · arrived · cancelled — computed by the server.
 */
import { fmtShortDate, fmtTime, isSameDay } from './format';

/** Chip label + tone per state. tone: 'wait' (amber) · 'go' (green) · 'bad' (red) · 'neutral' (grey). */
export const EXPECTED_STATE = {
  expected: { label: 'Expected', tone: 'wait' },
  late: { label: 'Late', tone: 'bad' },
  missed: { label: 'Did not come', tone: 'neutral' },
  arrived: { label: 'Arrived', tone: 'go' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

/** Deliveries say "Received" instead of "Arrived". */
export function expectedStateChip(e) {
  const s = EXPECTED_STATE[e.state] ?? EXPECTED_STATE.expected;
  if (e.kind === 'delivery' && e.state === 'arrived')
    return { ...s, label: 'Received' };
  if (e.kind === 'delivery' && e.state === 'expected')
    return { ...s, label: 'Delivery expected' };
  return s;
}

/** "Today, 3:00 pm–4:00 pm" / "21 Oct, 3:00 pm". */
export function expectedWhen(e, now = new Date()) {
  const at = new Date(e.expectedAt);
  const day = isSameDay(at, now) ? 'Today' : fmtShortDate(at);
  return `${day}, ${fmtTime(at)}${e.untilAt ? `–${fmtTime(e.untilAt)}` : ''}`;
}

/** Headline: the visitor, or "Delivery from …". */
export const expectedTitle = e =>
  e.kind === 'delivery' ? `Delivery from ${e.company}` : e.name;

/** "3 boxes · Tax invoice SYS/INV/1" or ''. */
export function boxesLine(e) {
  if (!e.boxes) return '';
  return [
    `${e.boxes} box${e.boxes === 1 ? '' : 'es'}`,
    [e.challanType, e.challanNo].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(' · ');
}

/** May register expected visitors / deliveries (viewers are read-only). */
export const mayPreRegister = u =>
  !!u &&
  u.role !== 'viewer' &&
  (u.role === 'admin' || u.canPreRegister !== false);

/** May edit or cancel: security, admin, whoever registered it, or the host. */
export function mayManageExpected(e, u) {
  if (!u || e.status !== 'expected') return false;
  return (
    u.role === 'security' ||
    u.role === 'admin' ||
    e.createdBy?.id === u.id ||
    e.host?.id === u.id
  );
}

/**
 * Check-in draft patch from a pre-registration: the person meeting them (contact, else host) is the one
 * asked to accept; purpose only when it is still in settings.
 */
export function checkInPatchFrom(e, purposes = []) {
  const meet = e.contact ?? e.host;
  return {
    form: {
      name: e.name ?? '',
      phone: e.phone ?? '',
      company: e.company ?? '',
      persons: String(e.persons || 1),
      purpose: purposes.includes(e.purpose) ? e.purpose : '',
      host: meet.name,
      vehicle: e.vehicle ?? '',
      items: e.items ?? '',
    },
    hostPick: { id: meet.id, name: meet.name, dept: '', location: '' },
    expected: e,
  };
}
