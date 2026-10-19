import { fmtDate, fmtTime, startOfLocalDay } from './format';

/** Chip label + tone per `Expected.state`. tone: 'wait' (amber) · 'go' (green) · 'bad' (red) · 'neutral' (grey). */
export const EXPECTED_STATE = {
  expected: { label: 'Expected', tone: 'wait' },
  late: { label: 'Late', tone: 'bad' },
  missed: { label: 'Did not come', tone: 'neutral' },
  arrived: { label: 'Arrived', tone: 'go' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

/** Deliveries say "Received" instead of "Arrived". @param {import('../types').Expected} e */
export function expectedStateChip(e) {
  const s = EXPECTED_STATE[e.state] ?? EXPECTED_STATE.expected;
  if (e.kind === 'delivery' && e.state === 'arrived') return { ...s, label: 'Received' };
  if (e.kind === 'delivery' && e.state === 'expected') return { ...s, label: 'Delivery expected' };
  return s;
}

/** "Today, 3:00 pm–4:00 pm" / "21 Oct 2026, 3:00 pm". @param {import('../types').Expected} e */
export function expectedWhen(e) {
  const at = new Date(e.expectedAt);
  const day = startOfLocalDay(at).getTime() === startOfLocalDay().getTime() ? 'Today' : fmtDate(at);
  return `${day}, ${fmtTime(at)}${e.untilAt ? `–${fmtTime(e.untilAt)}` : ''}`;
}

/** Headline: the visitor, or "Delivery from …". @param {import('../types').Expected} e */
export const expectedTitle = (e) => (e.kind === 'delivery' ? `Delivery from ${e.company}` : e.name);

/** "3 boxes · Tax invoice SYS/INV/1" or ''. @param {import('../types').Expected} e */
export function boxesLine(e) {
  if (!e.boxes) return '';
  return [`${e.boxes} box${e.boxes === 1 ? '' : 'es'}`, [e.challanType, e.challanNo].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(' · ');
}

/** May register expected visitors / deliveries (viewers are read-only). @param {import('../types').User} u */
export const mayPreRegister = (u) => !!u && u.role !== 'viewer' && (u.role === 'admin' || u.canPreRegister !== false);

/** May edit or cancel: security, admin, whoever registered it, or the host. */
export function mayManageExpected(e, u) {
  if (!u || e.status !== 'expected') return false;
  return u.role === 'security' || u.role === 'admin' || e.createdBy?.id === u.id || e.host?.id === u.id;
}
