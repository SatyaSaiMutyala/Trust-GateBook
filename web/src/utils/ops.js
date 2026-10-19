/**
 * Patrols and generator helpers (docs/API.md "Patrols", "Generator & diesel").
 */

export const LOG_STATUS = {
  on_time: { label: 'On time', variant: 'inside' },
  late: { label: 'Late start', variant: 'pending' },
  partial: { label: 'Partly missed', variant: 'issue' },
  missed: { label: 'Missed', variant: 'issue' },
};

/** "1h 05m" / "12m". @param {number} ms */
export function dur(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(m / 60);
  return h ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
}

/** "21:00" in local time. @param {string | number | Date} d */
export const hhmm = (d) => {
  const x = new Date(d);
  return `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`;
};

/**
 * The slot's chip: [text, tone] with tone ok | warn | bad | muted.
 * @param {any} s slot from GET /api/patrol @param {number} now
 */
export function slotChip(s, now) {
  const at = new Date(s.at).getTime();
  const end = new Date(s.end).getTime();
  const dt = `${s.done}/${s.total}`;
  if (s.status === 'upcoming') return [`Starts in ${dur(at - now)}`, 'muted'];
  if (s.status === 'open') return [`${s.late ? 'Late · ' : ''}${dt} · ${dur(end - now)} left`, s.late ? 'bad' : 'warn'];
  if (s.status === 'done')
    return [s.late ? `Complete · started ${s.lateMin} min late` : 'Complete on time', s.late ? 'warn' : 'ok'];
  if (s.status === 'partial') return [`Missed ${s.total - s.done} of ${s.total}`, 'bad'];
  return ['Missed', 'bad'];
}
export const TONE_VARIANT = { ok: 'inside', warn: 'pending', bad: 'issue', muted: 'exited' };

/** The 6-character code from a scanned QR (`…?cp=CODE`) or typed text, or null. @param {string} raw */
export function codeFrom(raw) {
  const t = String(raw ?? '').trim();
  try {
    const cp = new URL(t).searchParams.get('cp');
    if (cp) return /^[A-Z0-9]{6}$/i.test(cp) ? cp.toUpperCase() : null;
  } catch {
    /* not a URL */
  }
  return /^[A-Z0-9]{6}$/i.test(t) ? t.toUpperCase() : null;
}

/** QR content for a checkpoint: opens Patrols → scan in the web app. @param {string} code */
export const checkpointQr = (code) => `${window.location.origin}/?cp=${code}`;

/** Every `stepMin` minutes from one time to another (wraps past midnight, max 48). */
export function fillTimes(stepMin, from, to) {
  const toMin = (s) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(s).trim());
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const a = toMin(from);
  const b = toMin(to);
  if (a === null || b === null || !stepMin) return [];
  const span = (b - a + 1440) % 1440;
  const out = [];
  for (let t = 0; t <= span && out.length < 48; t += stepMin) {
    const m = (a + t) % 1440;
    out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  }
  return out;
}

export const RUN_REASONS = ['Power cut', 'Weekly test run', 'Maintenance', 'Other'];

/** Downloads a `{ blob, filename }` result. */
export function download({ blob, filename }, fallback) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? fallback;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
