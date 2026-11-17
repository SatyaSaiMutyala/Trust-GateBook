import { Schema, model } from 'mongoose';
import { effectiveModules } from '../services/modules.js';

/** @typedef {'admin' | 'security' | 'viewer' | 'host'} Role */
export const ROLES = /** @type {const} */ (['admin', 'security', 'viewer', 'host']);

/** @typedef {'active' | 'pending' | 'deleted'} UserStatus */
export const USER_STATUSES = /** @type {const} */ (['active', 'pending', 'deleted']);

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    /** Missing for Pace-linked users until an admin sets a password; they can't sign in before that. */
    passwordHash: { type: String, required: false },
    role: { type: String, enum: ROLES, required: true },
    active: { type: Boolean, required: true, default: true },
    // Added with the post room; older documents simply lack them (defaults below / in serializeUser).
    phone: { type: String, default: '' },
    dept: { type: String, default: '' },
    /** Where visitors / post should go, e.g. "2nd floor, cabin 3". */
    location: { type: String, default: '' },
    /** Can receive post although the role is not `host`. */
    isHost: { type: Boolean, default: false },
    /** May register expected visitors and deliveries (admins always may). Missing = true. */
    canPreRegister: { type: Boolean, default: true },
    /** Modules this person can use (services/modules.js). Missing = the role's defaults. Ignored for admins. */
    modules: { type: [String], default: undefined },
    /** Who they report to: escalation Level 1 (Level 2 = that person's manager, …). null = top of the chain. */
    reportsTo: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    /** Job title, e.g. "Security supervisor" (suggestions: settings.designations). */
    designation: { type: String, default: '' },
    /** Gate supervisor: target of "Gate supervisors" escalation steps (not for Employee accounts). */
    isSupervisor: { type: Boolean, default: false },
    /** The gate they work at ('' = all gates). Security: escalations for a gate go to its guards. */
    site: { type: String, default: '' },
    /** Pace HR employee code (e.g. TLE0145) for users created/linked from the Pace directory. Never null: sparse. */
    paceEmpCode: { type: String, required: false },
    /** PACE cross-app person key (identity-hub provisioning). Never null: sparse. */
    matchUuid: { type: String, required: false },
    /** pending = self sign-up awaiting admin approval; deleted = anonymised by the user. Missing = active. */
    status: { type: String, enum: USER_STATUSES, default: 'active' },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
userSchema.index({ name: 1 });
userSchema.index({ createdAt: 1 });
// Recipient directory (GET /api/hosts).
userSchema.index({ active: 1, role: 1, isHost: 1, name: 1 });
// Org chart: who reports to whom.
userSchema.index({ reportsTo: 1 });
userSchema.index({ paceEmpCode: 1 }, { unique: true, sparse: true });
userSchema.index({ matchUuid: 1 }, { unique: true, sparse: true });

export const User = model('User', userSchema);

/** Mongo filter for active post recipients: role `host` or `isHost`. */
export const RECIPIENT_FILTER = {
  active: true,
  status: { $nin: ['pending', 'deleted'] },
  $or: [{ role: 'host' }, { isHost: true }],
};

/** @param {{ role: string, isHost?: boolean | null }} u */
export const isRecipient = (u) => u.role === 'host' || u.isHost === true;

/** May register expected visitors and deliveries: admins always; others unless an admin switched it off. @param {any} u */
export const canPreRegister = (u) => u.role === 'admin' || u.canPreRegister !== false;

/** Active and has a password (Pace-linked users get one only when an admin sets it). @param {any} u */
export const canSignIn = (u) => Boolean(u && u.active && u.passwordHash && (u.status ?? 'active') === 'active');

/**
 * @typedef {object} UserDto
 * @property {string} id
 * @property {string} name
 * @property {string} email
 * @property {Role} role
 * @property {boolean} active
 * @property {string} createdAt
 * @property {string} phone
 * @property {string} dept
 * @property {string} location
 * @property {boolean} isHost   always true when role = 'host'
 * @property {boolean} canSignIn  active and has a password
 * @property {UserStatus} status
 * @property {boolean} canPreRegister  may register expected visitors / deliveries
 * @property {string[]} modules  modules they can use (admins: all)
 * @property {string | null} reportsTo  manager's user id
 * @property {string} designation
 * @property {boolean} isSupervisor
 * @property {string} site  gate they work at ('' = all gates)
 */

/** @param {any} u a User document @returns {UserDto} */
export function serializeUser(u) {
  return {
    id: u._id.toString(),
    name: u.name,
    email: u.email,
    role: u.role,
    active: u.active,
    createdAt: (u.createdAt ?? new Date()).toISOString(),
    phone: u.phone ?? '',
    dept: u.dept ?? '',
    location: u.location ?? '',
    isHost: isRecipient(u),
    canSignIn: canSignIn(u),
    status: u.status ?? 'active',
    canPreRegister: canPreRegister(u),
    modules: effectiveModules(u),
    reportsTo: u.reportsTo ? u.reportsTo.toString() : null,
    designation: u.designation ?? '',
    isSupervisor: u.role !== 'host' && u.isSupervisor === true,
    site: u.site ?? '',
  };
}

/**
 * Directory entry. `phone` only for gate users (admin/security).
 * @param {any} u
 * @param {boolean} withPhone
 */
export function serializeHost(u, withPhone) {
  return {
    id: u._id.toString(),
    name: u.name,
    dept: u.dept ?? '',
    location: u.location ?? '',
    phone: withPhone ? (u.phone ?? '') : '',
  };
}
