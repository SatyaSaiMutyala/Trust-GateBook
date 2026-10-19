/**
 * Incident helpers (docs/API.md "Incidents").
 */

export const SEVERITIES = [
  ['low', 'Low'],
  ['medium', 'Medium'],
  ['high', 'High'],
  ['critical', 'Critical'],
];
export const SEVERITY_LABEL = Object.fromEntries(SEVERITIES);
/** Token colours per severity. */
export const SEVERITY_TONE = {
  low: { fg: 'gb.muted', bg: 'gb.sunk' },
  medium: { fg: 'gb.warn', bg: 'gb.warnSoft' },
  high: { fg: 'gb.bad', bg: 'gb.badSoft' },
  critical: { fg: '#fff', bg: 'gb.bad' },
};
export const SEVERITY_HINT = 'High and Critical also alert security on duty, not just admin.';

export const STATUS_LABEL = { open: 'Open', in_progress: 'In progress', closed: 'Closed' };

/**
 * What the user may do with an incident.
 * @param {any} i incident
 * @param {{ id: string, role: string }} user
 */
export function incidentRights(i, user) {
  const operator = user.role === 'admin' || user.role === 'security';
  const assignee = i.assignedTo?.id === user.id;
  const reporter = i.reportedBy?.id === user.id;
  const open = i.status !== 'closed';
  const readOnly = user.role === 'viewer';
  return {
    update: open && !readOnly && (operator || assignee || reporter),
    status: open && (operator || assignee),
    assign: open && operator,
    close: open && (operator || assignee),
    reopen: !open && user.role === 'admin',
  };
}
