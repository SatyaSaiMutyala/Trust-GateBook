/**
 * Patrols and generator helpers (docs/API.md "Patrols", "Generator & diesel"). Same words as the web.
 */

/** HostStageChip tones: wait (amber) · go (green) · bad (red) · neutral. */
export const LOG_STATUS = {
  on_time: { label: 'On time', tone: 'go' },
  late: { label: 'Late start', tone: 'wait' },
  partial: { label: 'Partly missed', tone: 'bad' },
  missed: { label: 'Missed', tone: 'bad' },
};

/** "1h 05m" / "12m". @param {number} ms */
export function dur(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(m / 60);
  return h ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
}

/** Decimal hours as "2h 30m". @param {number | null | undefined} h */
export const hrs = h => dur((Number(h) || 0) * 3600000);

/** "21:00" in local time. @param {string | number | Date} d */
export const hhmm = d => {
  const x = new Date(d);
  return `${String(x.getHours()).padStart(2, '0')}:${String(
    x.getMinutes(),
  ).padStart(2, '0')}`;
};

/**
 * The slot's chip: { label, tone } (HostStageChip tones).
 * @param {any} s slot from GET /api/patrol @param {number} now ms
 */
export function slotChip(s, now) {
  const at = new Date(s.at).getTime();
  const end = new Date(s.end).getTime();
  const dt = `${s.done}/${s.total}`;
  if (s.status === 'upcoming')
    return { label: `Starts in ${dur(at - now)}`, tone: 'neutral' };
  if (s.status === 'open')
    return {
      label: `${s.late ? 'Late · ' : ''}${dt} · ${dur(end - now)} left`,
      tone: s.late ? 'bad' : 'wait',
    };
  if (s.status === 'done')
    return s.late
      ? { label: `Complete · started ${s.lateMin} min late`, tone: 'wait' }
      : { label: 'Complete on time', tone: 'go' };
  if (s.status === 'partial')
    return { label: `Missed ${s.total - s.done} of ${s.total}`, tone: 'bad' };
  return { label: 'Missed', tone: 'bad' };
}

/** The 6-character code from typed text or a `…?cp=CODE` link, or null. @param {string} raw */
export function codeFrom(raw) {
  const t = String(raw ?? '').trim();
  const m = /[?&]cp=([A-Za-z0-9]{6})(?:&|$)/.exec(t);
  if (m) return m[1].toUpperCase();
  return /^[A-Z0-9]{6}$/i.test(t) ? t.toUpperCase() : null;
}

export const RUN_REASONS = [
  'Power cut',
  'Weekly test run',
  'Maintenance',
  'Other',
];
