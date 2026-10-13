import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { config } from '../config.js';
import { User } from '../models/User.js';
import { forbidden, unauthorized } from './error.js';

/** @param {string} userId */
export function signToken(userId) {
  return jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

/**
 * Verifies a JWT and returns the active user it belongs to, or null.
 * @param {string | undefined | null} token
 */
export async function userFromToken(token) {
  if (!token) return null;
  let sub;
  try {
    sub = /** @type {jwt.JwtPayload} */ (jwt.verify(token, config.jwtSecret)).sub;
  } catch {
    return null;
  }
  if (typeof sub !== 'string' || !mongoose.isValidObjectId(sub)) return null;
  const user = await User.findById(sub);
  return user && user.active ? user : null;
}

/** Sets `req.user` from the Bearer token, or 401. @type {import('express').RequestHandler} */
export const requireAuth = async (req, _res, next) => {
  const match = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? '');
  const user = await userFromToken(match?.[1]);
  if (!user) throw unauthorized(match ? 'Your session has expired. Please sign in again.' : 'Please sign in.');
  /** @type {any} */ (req).user = user;
  next();
};

/** Roles that work the gate (see visit registers, receive visit:* events). */
export const GATE_ROLES = /** @type {const} */ (['admin', 'security', 'viewer']);

/** @param {{ role: string }} user */
export const isGateUser = (user) => GATE_ROLES.includes(/** @type {any} */ (user.role));

/**
 * @param {import('../models/User.js').Role} role
 * @param {readonly string[]} roles
 */
function deniedMessage(role, roles) {
  if (role === 'host') return 'Employee accounts can only see their own post.';
  if (roles.length === 1 && roles[0] === 'admin') return 'Only admins can do this.';
  return 'Your account is read-only. Ask an admin for security access.';
}

/**
 * @param {...import('../models/User.js').Role} roles
 * @returns {import('express').RequestHandler}
 */
export function requireRole(...roles) {
  return (req, _res, next) => {
    const user = currentUser(req);
    if (!roles.includes(user.role)) throw forbidden(deniedMessage(user.role, roles));
    next();
  };
}

/** admin, security, viewer: everyone except Employee (`host`) accounts. */
export const requireGate = requireRole(...GATE_ROLES);

/** The signed-in user (for handlers mounted behind requireAuth). @param {import('express').Request} req */
export function currentUser(req) {
  const user = /** @type {any} */ (req).user;
  if (!user) throw unauthorized();
  return user;
}
