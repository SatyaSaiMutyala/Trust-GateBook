/**
 * Host approval (docs/API.md "Host approval"): notifications to the host and to security. The "no reply" alert is
 * the first step of the visitor escalation matrix (services/escalation.js).
 */
import { User } from '../models/User.js';
import { runMatrix, startEscalationSweep } from './escalation.js';
import { notify } from './notify.js';

/** @param {any} visit */
const visitData = (visit) => ({ type: 'visit', id: visit.pass });

/** Active security and admin users: who works the gate desk (viewers are read-only). */
export const gateStaffIds = () =>
  User.find({ active: true, status: { $nin: ['pending', 'deleted'] }, role: { $in: ['security', 'admin'] } }, { _id: 1 })
    .lean()
    .then((staff) => staff.map((u) => u._id.toString()));

/** @param {any} visit */
const fromLine = (visit) => [visit.company, visit.purpose].filter(Boolean).join(' · ');

export const notifyHostApproval = {
  /** A visitor is waiting for the host. @param {any} visit */
  arrived: (visit) =>
    notify([visit.hostId], {
      event: 'visit_arrived',
      title: `🚪 ${visit.name} is at the gate`,
      body: `${fromLine(visit)} · tap to accept or decline`,
      data: visitData(visit),
    }),
  /** The host accepted or declined. @param {any} visit */
  replied: (visit) =>
    notify(gateStaffIds(), {
      event: 'visit_reply',
      title:
        visit.hostStatus === 'accepted'
          ? `✅ ${visit.host} accepted · send ${visit.name} in`
          : `❌ ${visit.host} declined ${visit.name}`,
      body: visit.hostNote
        ? `“${visit.hostNote}”`
        : visit.hostStatus === 'accepted'
          ? `Pass ${visit.badge}${visit.hostLocation ? ` · ${visit.hostLocation}` : ''}`
          : `Collect pass ${visit.badge} and record the exit.`,
      data: visitData(visit),
    }),
};

/**
 * Flags open visits whose host has not replied in time (the visitor escalation matrix's first step to guards):
 * sets `escalatedAt`, emits `visit:updated` and notifies the guards. Runs the whole visitor matrix.
 * @param {number} [nowMs]
 * @returns {Promise<number>} how many visits were newly flagged
 */
export async function sweepNoReply(nowMs = Date.now()) {
  return (await runMatrix('visitor', { nowMs })).noReply;
}

/** Runs every escalation matrix every 30 s (services/escalation.js). @returns {() => void} stop */
export const startHostReplySweep = () => startEscalationSweep();
