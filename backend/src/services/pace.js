/**
 * Pace HR employee directory (the company's source of truth for employees).
 * Gatebook proxies it: GET /api/hosts, and `pace:<emp_code>` post recipients.
 */
import { config } from '../config.js';
import { ApiError, badRequest, conflict } from '../middleware/error.js';
import { User } from '../models/User.js';

export const PACE_ID_PREFIX = 'pace:';
const UPSTREAM_MESSAGE = "The employee directory (Pace) can't be reached right now. Type the receiver's name instead.";
const NOT_ACTIVE = "That employee isn't active in Pace.";
const CACHE_MAX_ENTRIES = 500;

/**
 * @typedef {object} PaceEmployee
 * @property {number} [id]
 * @property {string} emp_code
 * @property {string} name
 * @property {string | null} [designation]
 * @property {string | null} [department]
 * @property {string | null} [branch]
 * @property {string | null} [email]
 * @property {string | null} [phone]
 * @property {string} [status]
 *
 * @typedef {object} Host
 * @property {string} id  'pace:<emp_code>'
 * @property {string} name
 * @property {string} dept
 * @property {string} location  "<designation> · <branch>"
 * @property {string} phone
 * @property {string} empCode
 * @property {string} designation
 * @property {string} branch
 *
 * @typedef {object} PaceQuery
 * @property {number} page
 * @property {number} limit
 * @property {string} [q]
 * @property {string} [dept]
 */

export const paceEnabled = () => config.paceEmployeesUrl !== '';

const upstreamError = () => new ApiError(502, 'upstream', UPSTREAM_MESSAGE);

/** @type {Map<string, { expires: number, value: any }>} */
const cache = new Map();

/** For tests. */
export function clearPaceCache() {
  cache.clear();
}

/**
 * Raw call to Pace. Throws ApiError 502 `upstream` on network errors, timeouts, non-2xx or `success: false`.
 * @param {Record<string, string | number | undefined>} params
 * @returns {Promise<{ items: PaceEmployee[], pagination: Record<string, any> }>}
 */
async function callPace(params) {
  const url = new URL(config.paceEmployeesUrl);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.paceTimeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Pace HTTP ${res.status}`);
    const body = await res.json();
    if (!body?.success || !Array.isArray(body?.data?.items)) throw new Error('Pace returned an unexpected body');
    return { items: body.data.items, pagination: body.data.pagination ?? {} };
  } catch (e) {
    console.error('[pace]', e instanceof Error ? e.message : e);
    throw upstreamError();
  } finally {
    clearTimeout(timer);
  }
}

/** @param {string | null | undefined} s */
const clean = (s) => (typeof s === 'string' ? s.trim() : '');

/** "<designation> · <branch>" @param {PaceEmployee} e */
export const paceLocation = (e) => [clean(e.designation), clean(e.branch)].filter(Boolean).join(' · ');

/**
 * @param {PaceEmployee} e
 * @param {boolean} withPhone phone only for gate users (admin/security)
 * @returns {Host}
 */
export function mapPaceEmployee(e, withPhone) {
  return {
    id: PACE_ID_PREFIX + e.emp_code,
    name: clean(e.name),
    dept: clean(e.department),
    location: paceLocation(e),
    phone: withPhone ? clean(e.phone) : '',
    empCode: e.emp_code,
    designation: clean(e.designation),
    branch: clean(e.branch),
  };
}

/**
 * Pace pagination → Gatebook pagination.
 * @param {Record<string, any>} p
 * @param {PaceQuery} q
 */
export function mapPacePagination(p, q) {
  const page = Number(p.current_page) || q.page;
  const total = Number(p.total) || 0;
  return {
    page,
    limit: Number(p.per_page) || q.limit,
    total,
    totalPages: total === 0 ? 0 : Number(p.last_page) || 1,
    hasNextPage: Boolean(p.has_more),
    hasPrevPage: page > 1,
  };
}

/**
 * Active employees, sorted by name; cached for 60 s per query. Phone filtering happens after the cache.
 * @param {PaceQuery} q
 * @param {boolean} withPhone
 */
export async function listPaceHosts(q, withPhone) {
  const params = {
    status: 'active',
    sort: 'name',
    dir: 'asc',
    page: q.page,
    per_page: q.limit,
    q: q.q,
    department: q.dept,
  };
  const key = JSON.stringify(params);
  const now = Date.now();
  let hit = cache.get(key);
  if (!hit || hit.expires <= now) {
    const value = await callPace(params);
    if (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value ?? '');
    hit = { expires: now + config.paceCacheMs, value };
    cache.set(key, hit);
  }
  return {
    data: hit.value.items.map((/** @type {PaceEmployee} */ e) => mapPaceEmployee(e, withPhone)),
    pagination: mapPacePagination(hit.value.pagination, q),
  };
}

/**
 * Looks an active employee up by exact emp_code (not cached: the result is written to the user record).
 * @param {string} empCode
 * @returns {Promise<PaceEmployee | null>}
 */
export async function findActivePaceEmployee(empCode) {
  const { items } = await callPace({ q: empCode, status: 'active', per_page: 100, page: 1 });
  const want = empCode.toLowerCase();
  return (
    items.find((e) => typeof e.emp_code === 'string' && e.emp_code.toLowerCase() === want && (e.status ?? 'active') === 'active') ??
    null
  );
}

/**
 * Resolves `pace:<emp_code>` to a local user, creating or linking one:
 * by paceEmpCode, else by email (linked: paceEmpCode + isHost), else a new password-less `host`.
 * The local copy of name / phone / dept / location is refreshed from Pace every time.
 * @param {string} recipientId
 * @param {string} [field] the input validation errors point at (`hostId` at check-in)
 */
export async function upsertPaceRecipient(recipientId, field = 'recipientId') {
  const empCode = recipientId.slice(PACE_ID_PREFIX.length).trim();
  if (!paceEnabled() || !empCode || empCode.length > 40) throw badRequest(NOT_ACTIVE, field);
  const emp = await findActivePaceEmployee(empCode);
  if (!emp) throw badRequest(NOT_ACTIVE, field);

  const code = emp.emp_code;
  const email = clean(emp.email).toLowerCase();
  const fresh = {
    name: clean(emp.name) || code,
    phone: clean(emp.phone).slice(0, 20),
    dept: clean(emp.department),
    location: paceLocation(emp),
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    let user = await User.findOne({ paceEmpCode: code });
    if (!user && email) {
      user = await User.findOne({ email, paceEmpCode: { $exists: false } });
      if (user) {
        user.paceEmpCode = code;
        user.isHost = true;
      }
    }
    try {
      if (user) {
        Object.assign(user, fresh);
        await user.save();
        return user;
      }
      return await User.create({
        ...fresh,
        email: email || `${code.toLowerCase()}@pace.local`,
        role: 'host',
        isHost: true,
        active: true,
        paceEmpCode: code,
      });
    } catch (e) {
      // A concurrent request created/linked the same employee: look again once.
      if (/** @type {any} */ (e)?.code === 11000) {
        if (attempt === 0) continue;
        throw conflict(`Another Gatebook account already uses ${email}. Ask an admin to fix it.`, field);
      }
      throw e;
    }
  }
  throw badRequest(NOT_ACTIVE, field);
}
