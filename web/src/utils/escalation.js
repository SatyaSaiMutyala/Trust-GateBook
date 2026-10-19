/**
 * Escalation matrices and the reporting hierarchy (docs/API.md "Escalations", "Hierarchy").
 * Texts mirror the server's services/escalationDefs.js.
 */

/** @typedef {import('../types').EscStep} EscStep */
/** @typedef {import('../types').OrgUser} OrgUser */

export const MATRICES = {
  visitor: {
    title: 'Host has not replied',
    person: 'Host',
    start: 'the visitor is checked in',
    hint: 'Runs while the host has not accepted or declined. The first step sent to guards also shows “No reply: call host” at the gate.',
  },
  overstay: {
    title: 'Visitor overstaying',
    person: 'Host',
    start: 'the overstay limit is reached',
    hint: 'Runs while the visitor is still inside.',
  },
  mail: {
    title: 'Post not collected',
    person: 'Receiver',
    start: 'the item is logged',
    hint: 'Runs until the item is handed over.',
  },
  mpreceipt: {
    title: 'Material IN not accepted',
    person: 'Employee receiving it',
    start: 'the material is logged at the gate',
    hint: 'Runs until the employee taps Received (or security records it). The employee is asked at once; these are the reminders and escalations.',
  },
  mpapproval: {
    title: 'Gate pass waiting for approval',
    person: 'Approver',
    start: 'the gate pass is raised',
    hint: 'Runs while material OUT is waiting for the authorising employee to approve. The approver is asked at once when the pass is raised; these are the reminders and escalations.',
  },
  material: {
    title: 'Returnable material overdue',
    person: 'Authorising employee',
    start: 'the return date is reached',
    hint: 'Runs while returnable material has not come back (or not gone back out).',
  },
  patrol: {
    title: 'Round late or missed',
    person: 'Guards on duty',
    personGuards: true,
    end: true,
    start: 'the round is due to start',
    hint: 'Every step after the start only fires if the round is still not started or finished. All alarms go into the late & missed log.',
  },
  gencheck: {
    title: 'Diesel level check overdue',
    person: 'Guards on duty',
    personGuards: true,
    start: 'the check is due',
    hint: 'Runs until a level reading with a gauge photo is recorded.',
  },
  genlow: {
    title: 'Low diesel',
    person: 'Guards on duty',
    personGuards: true,
    start: 'the level falls below the alert level',
    hint: 'Runs until diesel is filled.',
  },
  keys: {
    title: 'Key not returned',
    person: 'Key holder',
    start: 'the key is due back',
    hint: 'Runs until the key is back. Key holders who are not on Gatebook (e.g. an electrician) are covered by the guards.',
  },
  ...Object.fromEntries(
    ['critical', 'high', 'medium', 'low'].map((s) => [
      `incident_${s}`,
      {
        title: `${s[0].toUpperCase()}${s.slice(1)} incident`,
        person: 'Assigned person (or reporter)',
        start: 'the incident is reported',
        hint: 'Runs until the incident is closed.',
      },
    ]),
  ),
};

/** Escalation log module filter labels. */
export const MATRIX_LABEL = {
  visitor: 'Visitor: no host reply',
  overstay: 'Visitor overstay',
  mail: 'Post room',
  mpreceipt: 'Material IN acceptance',
  mpapproval: 'Gate pass approval',
  material: 'Material pass',
  keys: 'Key not returned',
  patrol: 'Patrol',
  gencheck: 'Diesel check',
  genlow: 'Low diesel',
  incident_critical: 'Incident: critical',
  incident_high: 'Incident: high',
  incident_medium: 'Incident: medium',
  incident_low: 'Incident: low',
};

/** Fixed targets, in menu order. `person` gets the matrix's own word (Host / Receiver). */
export const LEVELS = [
  ['guards', 'Guards on duty'],
  ['person', 'The person concerned'],
  ['l1', 'Level 1: their manager'],
  ['l2', "Level 2: manager's manager"],
  ['l3', 'Level 3'],
  ['supervisors', 'Gate supervisors'],
  ['admins', 'Admins'],
];

/** Name of a step's target. @param {string} to @param {string} personWord @param {OrgUser[]} [org] */
export function targetLabel(to, personWord, org = []) {
  if (to === 'person') return personWord;
  const fixed = LEVELS.find(([k]) => k === to);
  if (fixed) return fixed[1];
  const id = to.startsWith('user:') ? to.slice(5) : '';
  return org.find((u) => u.id === id)?.name ?? 'A named person';
}

/** "AT ONCE", "+15 min", "+4 h", "+3 d" (also for repeats). @param {number} min */
export function fmtAfter(min) {
  if (!min) return 'AT ONCE';
  if (min % 1440 === 0) return `+${min / 1440} d`;
  if (min % 60 === 0) return `+${min / 60} h`;
  return `+${min} min`;
}

/** "every 15 min" / "every 2 h". @param {number} min */
export const fmtEvery = (min) => `every ${fmtAfter(min).slice(1).trim()}`;

/** Split minutes into a number + unit for the editor. @param {number} min @returns {[number, 'min' | 'h' | 'd']} */
export function splitMinutes(min) {
  if (min && min % 1440 === 0) return [min / 1440, 'd'];
  if (min && min % 60 === 0) return [min / 60, 'h'];
  return [min, 'min'];
}
export const UNIT_MIN = { min: 1, h: 60, d: 1440 };

/**
 * The people above `id`, nearest first (cycle-safe, max 8).
 * @param {OrgUser[]} org
 * @param {string} id
 * @returns {OrgUser[]}
 */
export function chainOf(org, id) {
  const byId = new Map(org.map((u) => [u.id, u]));
  const out = [];
  const seen = new Set([id]);
  let cur = byId.get(id);
  while (cur?.reportsTo && out.length < 8) {
    const next = byId.get(cur.reportsTo);
    if (!next || seen.has(next.id) || !next.active) break;
    seen.add(next.id);
    out.push(next);
    cur = next;
  }
  return out;
}

/** "Ravi → Anil → Mohan → admin". @param {OrgUser[]} org @param {string} id */
export function chainText(org, id) {
  return [...chainOf(org, id).map((u) => u.name), 'admin'].join(' → ');
}
