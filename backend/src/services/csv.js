import { formatDateTime, formatDuration } from './format.js';

const HEADERS = [
  'Pass no.', 'Entry ID', 'Name', 'Mobile', 'Coming from', 'Persons', 'Purpose', 'Whom to meet', 'Department',
  'ID type', 'ID last 4', 'Vehicle', 'Items', 'Gate', 'In', 'Out', 'Duration', 'Checked in by', 'Checked out by',
  'Pass returned', 'Remarks', 'Exit remarks',
  'Host reply', 'Host replied at', 'Host message', 'No-reply alert', 'Allowed in at', 'Allowed in by',
  'Terms accepted',
];

/** @param {{ hostStatus: string, hostVia: string | null }} v */
function hostReplyLabel(v) {
  if (v.hostStatus === 'accepted') return v.hostVia === 'phone' ? 'Accepted (confirmed by phone)' : 'Accepted';
  if (v.hostStatus === 'declined') return 'Declined';
  if (v.hostStatus === 'waiting') return 'No reply yet';
  return 'Not on TruSentinel';
}
/** @param {string | null} iso */
const dateTimeOrBlank = (iso) => (iso ? formatDateTime(new Date(iso)) : '');

/**
 * Quote a cell; neutralise spreadsheet formula injection (but keep "+91…" phones intact).
 * @param {string | number | null | undefined} value
 */
function cell(value) {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=@\t\r]/.test(s) || /^[+-][^\d\s]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** One CSV line of quoted, injection-safe cells. @param {Array<string | number | null | undefined>} values */
export const csvRow = (values) => values.map(cell).join(',');

/**
 * Serialized visits → CSV text with a UTF-8 BOM and CRLF line endings.
 * @param {ReturnType<typeof import('./serialize.js').serializeVisit>[]} visits
 */
export function visitsToCsv(visits) {
  const lines = [HEADERS.map(cell).join(',')];
  for (const v of visits) {
    const inAt = new Date(v.inAt);
    const outAt = v.outAt ? new Date(v.outAt) : null;
    const row = [
      v.badge, v.pass, v.name, v.phone, v.company, v.persons, v.purpose, v.host, v.dept, v.idType, v.idLast4,
      v.vehicle, v.items, v.site,
      formatDateTime(inAt),
      outAt ? formatDateTime(outAt) : '',
      outAt ? formatDuration(outAt.getTime() - inAt.getTime()) : '',
      v.guardIn?.name ?? '',
      v.guardOut?.name ?? '',
      v.passReturned === null ? '' : v.passReturned ? 'Yes' : 'No',
      v.notes,
      v.exitNote,
      hostReplyLabel(v),
      dateTimeOrBlank(v.hostAt),
      v.hostNote,
      dateTimeOrBlank(v.escalatedAt),
      dateTimeOrBlank(v.allowedAt),
      v.allowedBy?.name ?? '',
      v.termsAt ? `Yes, version ${v.termsVersion}, ${formatDateTime(new Date(v.termsAt))}` : '',
    ];
    lines.push(row.map(cell).join(','));
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}

const MAIL_HEADERS = [
  'Entry ID', 'Type', 'Tracking / ref no.', 'From (sender)', 'Brought by', 'Delivery person', 'Delivery person mobile',
  'For', 'Department', 'Pieces', 'Gate', 'Received', 'Logged by', 'Status', 'Handed over', 'Collected by', 'Handed by',
  'Receiver confirmed', 'Dispute', 'Resolution', 'Remarks',
];

/** @param {string | null} isoString */
const dt = (isoString) => (isoString ? formatDateTime(new Date(isoString)) : '');

/**
 * Serialized mail items → CSV (BOM, CRLF).
 * @param {ReturnType<typeof import('./serializeMail.js').serializeMail>[]} items
 * @param {Record<string, string>} statusLabels
 */
export function mailToCsv(items, statusLabels) {
  const lines = [MAIL_HEADERS.map(cell).join(',')];
  for (const m of items) {
    const row = [
      m.id, m.kind, m.refNo, m.sender,
      m.carrier, // "Brought by" = post / courier company
      m.broughtBy, // delivery person
      m.broughtPhone, m.recipientName, m.dept, m.pieces, m.site,
      dt(m.receivedAt), m.receivedBy?.name ?? '',
      statusLabels[m.status] ?? m.status,
      dt(m.handedAt), m.collectedBy, m.handedBy?.name ?? '',
      dt(m.confirmedAt), m.disputeNote, m.resolveNote, m.notes,
    ];
    lines.push(row.map(cell).join(','));
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}
