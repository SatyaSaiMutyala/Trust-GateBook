import { fmtDate, fmtTime, startOfLocalDay } from './format';

/** Status chip label + Chip variant (SPEC "Post room screen"). */
export const MAIL_STATUS = {
  lodged: { label: 'To collect', variant: 'pending' },
  handed: { label: 'Handed · awaiting confirmation', variant: 'pending' },
  confirmed: { label: 'Collected · confirmed', variant: 'inside' },
  closed: { label: 'Handed over', variant: 'exited' },
  disputed: { label: 'Receiver disputes', variant: 'issue' },
  resolved: { label: 'Resolved', variant: 'exited' },
};

/** Post room tabs → `status` filter + default sort. */
export const MAIL_TABS = [
  { value: 'collect', label: 'To collect', status: 'lodged', sort: 'receivedAt', count: 'lodged' },
  { value: 'awaiting', label: 'Awaiting confirmation', status: 'handed', sort: '-handedAt', count: 'handed' },
  { value: 'issues', label: 'Issues', status: 'disputed', sort: '-receivedAt', count: 'disputed' },
  { value: 'all', label: 'All items', status: undefined, sort: '-receivedAt', count: null },
];

/** "All items" period select → days back from the start of today. */
export const MAIL_PERIODS = [
  { value: 'today', label: 'Today', days: 0 },
  { value: '7d', label: 'Last 7 days', days: 6 },
  { value: '30d', label: 'Last 30 days', days: 29 },
  { value: '60d', label: 'Last 60 days', days: 59 },
];

/** Quick suggestions for "Brought by" (post / courier company). */
export const CARRIERS = [
  'India Post',
  'Blue Dart',
  'DTDC',
  'Delhivery',
  'Professional Couriers',
  'DHL',
  'FedEx',
  'Ecom Express',
  'Hand delivery',
];

/** "From Income Tax Department · via India Post · 2 pieces" */
export function fromLine(m) {
  return [
    m.sender ? `From ${m.sender}` : '',
    m.carrier ? `via ${m.carrier}` : '',
    m.pieces > 1 ? `${m.pieces} pieces` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Time, plus the date when it isn't today: "10:42 am" / "02 Oct 2026, 10:42 am". */
export function whenShort(iso, now = Date.now()) {
  if (!iso) return '';
  const d = new Date(iso);
  return d >= startOfLocalDay(new Date(now)) ? fmtTime(d) : `${fmtDate(d)}, ${fmtTime(d)}`;
}

export const firstWord = (s) => (s ?? '').trim().split(/\s+/)[0] ?? '';

/** Does this item go to a Gatebook user (who gets notified and must confirm)? */
export const hasRecipientUser = (m) => !!m.recipient;
