import { Schema, model } from 'mongoose';

/** @typedef {'admin' | 'security' | 'viewer' | 'host'} Role */
export const ROLES = /** @type {const} */ (['admin', 'security', 'viewer', 'host']);

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
    /** Pace HR employee code (e.g. TLE0145) for users created/linked from the Pace directory. Never null: sparse. */
    paceEmpCode: { type: String, required: false },
  },
  { timestamps: true },
);
userSchema.index({ name: 1 });
userSchema.index({ createdAt: 1 });
// Recipient directory (GET /api/hosts).
userSchema.index({ active: 1, role: 1, isHost: 1, name: 1 });
userSchema.index({ paceEmpCode: 1 }, { unique: true, sparse: true });

export const User = model('User', userSchema);

/** Mongo filter for active post recipients: role `host` or `isHost`. */
export const RECIPIENT_FILTER = { active: true, $or: [{ role: 'host' }, { isHost: true }] };

/** @param {{ role: string, isHost?: boolean | null }} u */
export const isRecipient = (u) => u.role === 'host' || u.isHost === true;

/** Active and has a password (Pace-linked users get one only when an admin sets it). @param {any} u */
export const canSignIn = (u) => Boolean(u && u.active && u.passwordHash);

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
