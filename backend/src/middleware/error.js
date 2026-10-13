import multer from 'multer';
import { ZodError } from 'zod';

/**
 * @typedef {'unauthorized'|'forbidden'|'not_found'|'validation'|'badge_in_use'|'already_inside'|'conflict'|'internal'} ErrorCode
 */

/** An error that maps to the contract's `{ error: { code, message, field? } }` body. */
export class ApiError extends Error {
  /**
   * @param {number} status
   * @param {ErrorCode} code
   * @param {string} message shown to the guard as-is
   * @param {string} [field]
   * @param {Record<string, unknown>} [extra] additional keys merged into `error` (e.g. `item`)
   */
  constructor(status, code, message, field, extra) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.field = field;
    this.extra = extra;
  }
}

/** @param {string} message @param {string} [field] */
export const badRequest = (message, field) => new ApiError(400, 'validation', message, field);
export const notFound = (message = 'Not found.') => new ApiError(404, 'not_found', message);
export const forbidden = (message = 'You do not have permission to do this.') => new ApiError(403, 'forbidden', message);
export const unauthorized = (message = 'Please sign in again.') => new ApiError(401, 'unauthorized', message);
/** @param {string} message @param {string} [field] @param {Record<string, unknown>} [extra] */
export const conflict = (message, field, extra) => new ApiError(409, 'conflict', message, field, extra);

/** Converts a ZodError into our validation error (first issue wins). @param {ZodError} err */
export function fromZod(err) {
  const issue = err.issues[0];
  const field = issue && issue.path.length > 0 ? String(issue.path[0]) : undefined;
  return badRequest(issue?.message ?? 'Invalid input.', field);
}

/** @type {import('express').RequestHandler} */
export const notFoundHandler = (_req, _res, next) => {
  next(notFound('No such endpoint.'));
};

/** @type {import('express').ErrorRequestHandler} */
export const errorHandler = (err, _req, res, _next) => {
  /** @type {ApiError} */
  let apiErr;
  if (err instanceof ApiError) {
    apiErr = err;
  } else if (err instanceof ZodError) {
    apiErr = fromZod(err);
  } else if (err instanceof multer.MulterError) {
    const field = err.field;
    apiErr =
      err.code === 'LIMIT_FILE_SIZE'
        ? badRequest('Image is too large (max 8 MB).', field)
        : err.code === 'LIMIT_UNEXPECTED_FILE'
          ? badRequest(`Unexpected file field "${field ?? ''}".`, field)
          : badRequest(`Upload rejected: ${err.message}.`, field);
  } else if (err && typeof err.type === 'string' && err.status >= 400 && err.status < 500) {
    // body-parser errors (malformed JSON, too large, ...)
    apiErr = err.type === 'entity.too.large' ? badRequest('Request body is too large.') : badRequest('Malformed request body.');
  } else {
    console.error('[error]', err);
    apiErr = new ApiError(500, 'internal', 'Something went wrong on the server. Try again.');
  }
  if (res.headersSent) return;
  /** @type {Record<string, unknown>} */
  const error = { ...(apiErr.extra ?? {}), code: apiErr.code, message: apiErr.message };
  if (apiErr.field) error.field = apiErr.field;
  res.status(apiErr.status).json({ error });
};
