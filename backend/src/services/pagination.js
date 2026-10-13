import { badRequest } from '../middleware/error.js';

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

/**
 * @typedef {object} ListOptions
 * @property {string[]} sortFields  whitelisted sort fields
 * @property {string} defaultSort   e.g. '-inAt'
 * @property {number} [defaultLimit]
 *
 * @typedef {object} ListQuery
 * @property {number} page
 * @property {number} limit
 * @property {number} skip
 * @property {string | undefined} q   trimmed search text (unescaped)
 * @property {Record<string, 1 | -1>} sort  mongoose sort, with `_id` as a stable tie-breaker
 *
 * @typedef {object} Pagination
 * @property {number} page
 * @property {number} limit
 * @property {number} total
 * @property {number} totalPages
 * @property {boolean} hasNextPage
 * @property {boolean} hasPrevPage
 */

/**
 * First string value of a query param, trimmed; `undefined` when absent or blank.
 * @param {Record<string, unknown>} query
 * @param {string} key
 */
export function queryString(query, key) {
  let v = query[key];
  if (Array.isArray(v)) v = v[0];
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t === '' ? undefined : t;
}

/**
 * Parses a positive integer query param.
 * @param {Record<string, unknown>} query
 * @param {string} key
 * @param {number} def
 * @param {number} min
 * @param {number} max
 * @param {string} message
 */
function intParam(query, key, def, min, max, message) {
  const raw = queryString(query, key);
  if (raw === undefined) return def;
  if (!/^\d+$/.test(raw)) throw badRequest(message, key);
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < min || n > max) throw badRequest(message, key);
  return n;
}

/**
 * Parses `page`, `limit`, `q` and `sort` (see docs/API.md "Pagination & query params").
 * @param {Record<string, unknown>} query
 * @param {ListOptions} opts
 * @returns {ListQuery}
 */
export function parseListQuery(query, opts) {
  const page = intParam(query, 'page', 1, 1, Number.MAX_SAFE_INTEGER, 'page must be a whole number of 1 or more.');
  const limit = intParam(
    query,
    'limit',
    opts.defaultLimit ?? DEFAULT_LIMIT,
    1,
    MAX_LIMIT,
    `limit must be a whole number from 1 to ${MAX_LIMIT}.`,
  );
  const q = queryString(query, 'q');
  const sortRaw = queryString(query, 'sort') ?? opts.defaultSort;
  const desc = sortRaw.startsWith('-');
  const field = desc ? sortRaw.slice(1) : sortRaw;
  if (!opts.sortFields.includes(field)) {
    throw badRequest(`sort must be one of: ${opts.sortFields.join(', ')} (prefix "-" for descending).`, 'sort');
  }
  const dir = desc ? -1 : 1;
  return { page, limit, skip: (page - 1) * limit, q, sort: { [field]: dir, _id: dir } };
}

/** @param {string} s */
export function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Case-insensitive substring match over `fields`, or `{}` when there is no search text.
 * @param {string | undefined} q
 * @param {readonly string[]} fields
 */
export function searchFilter(q, fields) {
  if (!q) return {};
  const re = new RegExp(escapeRegex(q), 'i');
  return { $or: fields.map((f) => ({ [f]: re })) };
}

/**
 * @param {number} page @param {number} limit @param {number} total
 * @returns {Pagination}
 */
export function buildPagination(page, limit, total) {
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  return { page, limit, total, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 };
}

/**
 * Runs the page query and the count in parallel.
 * @template T
 * @param {import('mongoose').Model<any>} model
 * @param {Record<string, unknown>} filter
 * @param {ListQuery} lq
 * @param {(doc: any) => T} map
 * @returns {Promise<{ data: T[], pagination: Pagination }>}
 */
export async function paginate(model, filter, lq, map) {
  const [docs, total] = await Promise.all([
    model.find(filter).sort(lq.sort).skip(lq.skip).limit(lq.limit),
    model.countDocuments(filter),
  ]);
  return { data: docs.map(map), pagination: buildPagination(lq.page, lq.limit, total) };
}
