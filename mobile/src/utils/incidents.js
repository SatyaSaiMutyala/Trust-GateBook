/**
 * Incident helpers (docs/API.md "Incidents"). Same words as the web.
 */

export const SEVERITIES = [
  ['low', 'Low'],
  ['medium', 'Medium'],
  ['high', 'High'],
  ['critical', 'Critical'],
];
export const SEVERITY_LABEL = Object.fromEntries(SEVERITIES);
export const SEVERITY_HINT =
  'High and Critical also alert security on duty, not just admin.';
export const STATUS_LABEL = {
  open: 'Open',
  in_progress: 'In progress',
  closed: 'Closed',
};

/** Colours for a severity from the theme palette. */
export function severityColors(severity, c) {
  return (
    {
      low: { fg: c.muted, bg: c.sunk },
      medium: { fg: c.warn, bg: c.warnSoft },
      high: { fg: c.bad, bg: c.badSoft },
      critical: { fg: '#FFFFFF', bg: c.bad },
    }[severity] ?? { fg: c.muted, bg: c.sunk }
  );
}

/** HostStageChip tone for a status. */
export const STATUS_TONE = {
  open: 'bad',
  in_progress: 'wait',
  closed: 'neutral',
};

/**
 * What the user may do with an incident.
 * @param {any} i incident
 * @param {{ id: string, role: string } | null} user
 */
export function incidentRights(i, user) {
  const role = user?.role;
  const operator = role === 'admin' || role === 'security';
  const assignee = !!user && i.assignedTo?.id === user.id;
  const reporter = !!user && i.reportedBy?.id === user.id;
  const open = i.status !== 'closed';
  return {
    update: open && role !== 'viewer' && (operator || assignee || reporter),
    status: open && (operator || assignee),
    assign: open && operator,
    close: open && (operator || assignee),
    reopen: !open && role === 'admin',
  };
}
