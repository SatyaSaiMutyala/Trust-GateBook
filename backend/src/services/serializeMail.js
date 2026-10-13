import { signFileUrl } from './signing.js';

/** @param {Date | null | undefined} d */
const iso = (d) => (d ? d.toISOString() : null);
/** @param {{ id: string, name: string } | null | undefined} g */
const guard = (g) => (g ? { id: g.id, name: g.name } : null);

/**
 * MailItem document → API `MailItem` with fresh signed photo URLs.
 * @param {any} m
 * @param {number} [nowMs]
 */
export function serializeMail(m, nowMs = Date.now()) {
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
    coverPhotoUrl: signFileUrl(m.cover, nowMs),
    personPhotoUrl: signFileUrl(m.person, nowMs),
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
