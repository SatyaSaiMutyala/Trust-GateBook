import { url as photoUrl } from './storage.js';

/** @param {Date | null | undefined} d */
const iso = (d) => (d ? d.toISOString() : null);
/** @param {{ id: string, name: string } | null | undefined} g */
const guard = (g) => (g ? { id: g.id, name: g.name } : null);

/**
 * MailItem → API `MailItem` fields without the photo URLs (sync; used as-is by the CSV export).
 * @param {any} m
 * @param {number} [nowMs]
 * @param {{ coverPhotoUrl: string, coverBackPhotoUrl: string | null, personPhotoUrl: string }} [urls]
 * @param {any} m
 * @param {number} [nowMs]
 */
export function mailFields(m, _nowMs = Date.now(), urls = { coverPhotoUrl: '', coverBackPhotoUrl: null, personPhotoUrl: '' }) {
  return {
    id: m.code,
    kind: m.kind,
    refNo: m.refNo ?? '',
    sender: m.sender,
    carrier: m.carrier ?? '',
    broughtBy: m.broughtBy,
    broughtPhone: m.broughtPhone ?? '',
    recipient: m.recipient?.id
      ? { id: m.recipient.id, name: m.recipient.name, phone: m.recipient.phone ?? '', location: m.recipient.location ?? '' }
      : null,
    recipientName: m.recipientName,
    dept: m.dept ?? '',
    pieces: m.pieces,
    notes: m.notes ?? '',
    site: m.site,
    receivedAt: m.receivedAt.toISOString(),
    receivedBy: guard(m.receivedBy),
    coverPhotoUrl: urls.coverPhotoUrl,
    coverBackPhotoUrl: urls.coverBackPhotoUrl,
    personPhotoUrl: urls.personPhotoUrl,
    status: m.status,
    notifiedAt: iso(m.notifiedAt),
    remindedAt: iso(m.remindedAt),
    handedAt: iso(m.handedAt),
    handedBy: guard(m.handedBy),
    collectedBy: m.collectedBy ?? '',
    handedNote: m.handedNote ?? '',
    confirmedAt: iso(m.confirmedAt),
    disputeNote: m.disputeNote ?? '',
    resolvedAt: iso(m.resolvedAt),
    resolvedBy: guard(m.resolvedBy),
    resolveNote: m.resolveNote ?? '',
  };
}

/**
 * MailItem document → API `MailItem` with fresh signed photo URLs (local /api/files or S3 pre-signed).
 * @param {any} m
 * @param {number} [nowMs]
 */
export async function serializeMail(m, nowMs = Date.now()) {
  const [coverPhotoUrl, coverBackPhotoUrl, personPhotoUrl] = await Promise.all([
    photoUrl(m.cover, nowMs),
    m.coverBack ? photoUrl(m.coverBack, nowMs) : null, // null on items logged before the back photo existed
    photoUrl(m.person, nowMs),
  ]);
  return mailFields(m, nowMs, { coverPhotoUrl, coverBackPhotoUrl, personPhotoUrl });
}
