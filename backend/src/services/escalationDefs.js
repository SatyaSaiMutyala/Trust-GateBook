/**
 * Escalation matrices (docs/API.md "Escalations"): per module, a list of steps. Each step goes out `after` minutes
 * from the clock start while the item is still open, to one target, once or every `repeat` minutes.
 */
import { z } from 'zod';

/**
 * @typedef {'guards' | 'person' | 'l1' | 'l2' | 'l3' | 'supervisors' | 'admins' | `user:${string}`} EscTarget
 * @typedef {{ after: number, to: EscTarget, repeat: number, alarm: boolean, label: string, end?: boolean }} EscStep
 *   `end: true` = "when time runs out" (patrol: the round's end), `after` is then ignored.
 * @typedef {'visitor' | 'overstay' | 'mail' | 'mpreceipt' | 'mpapproval' | 'material' | 'keys' | 'incident_critical'
 *   | 'incident_high' | 'incident_medium' | 'incident_low' | 'patrol' | 'gencheck' | 'genlow'} MatrixKey
 */

/**
 * What each matrix is about. `module` = who it concerns (guards without the module are skipped);
 * `person` = the person concerned.
 */
export const MATRICES = /** @type {const} */ ({
  visitor: {
    title: 'Host has not replied',
    module: 'visitors',
    person: 'Host',
    start: 'the visitor is checked in',
    hint: 'Runs while the host has not accepted or declined. The first step sent to guards also shows “No reply: call host” at the gate.',
  },
  overstay: {
    title: 'Visitor overstaying',
    module: 'visitors',
    person: 'Host',
    start: 'the overstay limit is reached',
    hint: 'Runs while the visitor is still inside.',
  },
  mail: {
    title: 'Post not collected',
    module: 'post',
    person: 'Receiver',
    start: 'the item is logged',
    hint: 'Runs until the item is handed over.',
  },
  mpreceipt: {
    title: 'Material IN not accepted',
    module: 'material',
    person: 'Employee receiving it',
    start: 'the material is logged at the gate',
    hint: 'Runs until the employee taps Received (or security records it). The employee is asked at once; these are the reminders and escalations.',
  },
  mpapproval: {
    title: 'Gate pass waiting for approval',
    module: 'material',
    person: 'Approver',
    start: 'the gate pass is raised',
    hint: 'Runs while material OUT is waiting for the authorising employee to approve. The approver is asked at once when the pass is raised; these are the reminders and escalations.',
  },
  material: {
    title: 'Returnable material overdue',
    module: 'material',
    person: 'Authorising employee',
    start: 'the return date is reached',
    hint: 'Runs while returnable material has not come back (or not gone back out).',
  },
  keys: {
    title: 'Key not returned',
    module: 'keys',
    person: 'Key holder',
    start: 'the key is due back',
    hint: 'Runs until the key is back. Key holders who are not on TruSentinel (e.g. an electrician) are covered by the guards.',
  },
  incident_critical: {
    title: 'Critical incident',
    module: 'incidents',
    person: 'Assigned person (or reporter)',
    start: 'the incident is reported',
    hint: 'Runs until the incident is closed.',
  },
  incident_high: {
    title: 'High incident',
    module: 'incidents',
    person: 'Assigned person (or reporter)',
    start: 'the incident is reported',
    hint: 'Runs until the incident is closed.',
  },
  incident_medium: {
    title: 'Medium incident',
    module: 'incidents',
    person: 'Assigned person (or reporter)',
    start: 'the incident is reported',
    hint: 'Runs until the incident is closed.',
  },
  incident_low: {
    title: 'Low incident',
    module: 'incidents',
    person: 'Assigned person (or reporter)',
    start: 'the incident is reported',
    hint: 'Runs until the incident is closed.',
  },
  patrol: {
    title: 'Round late or missed',
    module: 'patrol',
    person: 'Guards on duty',
    personGuards: true,
    end: true,
    start: 'the round is due to start',
    hint: 'Every step after the start only fires if the round is still not started or finished. All alarms go into the late & missed log.',
  },
  gencheck: {
    title: 'Diesel level check overdue',
    module: 'gen',
    person: 'Guards on duty',
    personGuards: true,
    start: 'the check is due',
    hint: 'Runs until a level reading with a gauge photo is recorded.',
  },
  genlow: {
    title: 'Low diesel',
    module: 'gen',
    person: 'Guards on duty',
    personGuards: true,
    start: 'the level falls below the alert level',
    hint: 'Runs until diesel is filled.',
  },
});
export const MATRIX_KEYS = /** @type {MatrixKey[]} */ (Object.keys(MATRICES));

/** @param {number} after @param {EscTarget} to @param {string} label @param {Partial<EscStep>} [more] @returns {EscStep} */
const step = (after, to, label, more = {}) => ({ after, to, repeat: 0, alarm: false, label, ...more });

/** @type {Record<MatrixKey, EscStep[]>} */
export const DEFAULT_ESC = {
  visitor: [
    step(5, 'guards', 'No reply from host: call the host', { alarm: true }),
    step(15, 'l1', "Visitor still waiting: host's manager"),
  ],
  overstay: [
    step(0, 'guards', 'Visitor overstaying'),
    step(0, 'person', 'Your visitor is still inside'),
    step(60, 'l1', "Overstay: host's manager"),
  ],
  mail: [
    step(240, 'person', 'Reminder: post waiting for you'),
    step(1440, 'person', 'Post waiting 1 day'),
    step(1440, 'l1', "Post not collected: receiver's manager"),
    step(4320, 'admins', 'Post not collected for 3 days'),
  ],
  mpreceipt: [
    step(15, 'person', 'Reminder: accept material brought in for you', { repeat: 15 }),
    step(60, 'guards', 'Material not accepted: call the employee'),
    step(120, 'l1', "Material not accepted: employee's manager"),
  ],
  mpapproval: [
    step(10, 'person', 'Reminder: gate pass waiting for approval', { repeat: 10 }),
    step(20, 'guards', 'Approver has not replied: call them'),
    step(30, 'l1', "Gate pass not approved: approver's manager"),
  ],
  material: [
    step(0, 'guards', 'Returnable material overdue'),
    step(0, 'person', 'Material you authorised is overdue'),
    step(1440, 'l1', "Material overdue: authoriser's manager"),
    step(4320, 'admins', 'Material overdue 3 days'),
  ],
  keys: [
    step(0, 'guards', 'Key not returned'),
    step(0, 'person', 'Please return the key'),
    step(30, 'supervisors', 'Key overdue 30 min'),
    step(120, 'l1', "Key overdue: holder's manager"),
    step(240, 'admins', 'Key overdue 4 hours'),
  ],
  incident_critical: [
    step(0, 'supervisors', 'Critical incident reported', { alarm: true }),
    step(0, 'admins', 'Critical incident reported', { alarm: true }),
    step(15, 'l1', 'Critical incident open 15 min', { alarm: true }),
    step(60, 'l2', 'Critical incident open 1 hour', { alarm: true }),
  ],
  incident_high: [
    step(0, 'supervisors', 'High incident reported'),
    step(0, 'admins', 'High incident reported'),
    step(120, 'l1', 'High incident open 2 hours'),
    step(480, 'l2', 'High incident open 8 hours'),
  ],
  incident_medium: [step(0, 'admins', 'Incident reported'), step(1440, 'l1', 'Incident open 1 day')],
  incident_low: [step(0, 'admins', 'Incident reported'), step(4320, 'l1', 'Incident open 3 days')],
  patrol: [
    step(0, 'guards', 'Round due'),
    step(10, 'guards', 'Round late: alarm on guard phone', { alarm: true, repeat: 5 }),
    step(30, 'l1', 'Escalate to supervisor', { alarm: true }),
    step(0, 'l1', 'Round missed: supervisor', { end: true }),
    step(0, 'admins', 'Round missed: admin report', { end: true }),
  ],
  gencheck: [
    step(0, 'guards', 'Diesel level check due'),
    step(1440, 'supervisors', 'Diesel check 1 day overdue'),
    step(2880, 'admins', 'Diesel check 2 days overdue'),
  ],
  genlow: [
    step(0, 'guards', 'Low diesel'),
    step(0, 'admins', 'Low diesel: arrange a refill'),
    step(240, 'l1', 'Low diesel not refilled in 4 hours'),
  ],
};

/** Who a target is, in words. */
export const TARGET_LABEL = {
  guards: 'Guards on duty',
  person: 'The person concerned',
  l1: 'Level 1: their manager',
  l2: "Level 2: manager's manager",
  l3: 'Level 3',
  supervisors: 'Gate supervisors',
  admins: 'Admins',
};

const MAX_MIN = 60 * 24 * 30; // 30 days
const stepSchema = z.object({
  after: z.number({ error: 'Step time must be minutes.' }).int().min(0).max(MAX_MIN, 'At most 30 days.'),
  to: z
    .string({ error: 'Choose who to notify.' })
    .refine(
      (t) => Object.hasOwn(TARGET_LABEL, t) || /^user:[a-f0-9]{24}$/.test(t),
      'Choose who to notify from the list.',
    ),
  repeat: z.number({ error: 'Repeat must be minutes.' }).int().min(0).max(MAX_MIN).default(0),
  alarm: z.boolean().default(false),
  label: z.string().trim().max(120, 'Message is too long (max 120).').default(''),
  end: z.boolean().optional(),
}).transform(({ end, ...s }) => (end ? { ...s, end: true } : s));
export const matrixSchema = z.array(stepSchema).max(10, 'At most 10 steps.');
/** Partial: only the matrices being changed. */
export const escSchema = z.object(Object.fromEntries(MATRIX_KEYS.map((k) => [k, matrixSchema.optional()]))).strict();

/** Steps in time order (stable). @param {EscStep[]} steps */
/** "When time runs out" steps go last. */
export const sortSteps = (steps) =>
  [...steps].sort((a, b) => (a.end ? Infinity : a.after) - (b.end ? Infinity : b.after));

/** The "no reply: call host" step: first visitor step to guards. @param {EscStep[]} visitorSteps */
export const noReplyStepIndex = (visitorSteps) => visitorSteps.findIndex((s) => s.to === 'guards');

/** Minutes until security is told a host has not replied, or null when no step goes to guards. @param {EscStep[]} visitorSteps */
export function hostReplyMinutesOf(visitorSteps) {
  const i = noReplyStepIndex(visitorSteps);
  return i === -1 ? null : visitorSteps[i].after;
}
