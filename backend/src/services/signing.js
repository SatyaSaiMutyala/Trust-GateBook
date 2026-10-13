import crypto from 'node:crypto';
import { config } from '../config.js';

/** @param {string} name @param {number} exp */
function hmac(name, exp) {
  return crypto.createHmac('sha256', config.fileUrlSecret).update(`${name}:${exp}`).digest('hex');
}

/**
 * `/api/files/<name>?exp=<unix seconds>&sig=<hex HMAC-SHA256 of "name:exp">`.
 * Expiry is rounded up to a 5-minute boundary (valid 60–65 min) so the same image
 * keeps the same URL for a while and browsers can cache it.
 * @param {string} name
 * @param {number} [nowMs]
 */
export function signFileUrl(name, nowMs = Date.now()) {
  const step = 300;
  const exp = Math.ceil((Math.floor(nowMs / 1000) + config.fileUrlTtlSeconds) / step) * step;
  return `/api/files/${encodeURIComponent(name)}?exp=${exp}&sig=${hmac(name, exp)}`;
}

/**
 * @param {string} name
 * @param {unknown} expRaw
 * @param {unknown} sigRaw
 * @param {number} [nowMs]
 */
export function verifyFileSignature(name, expRaw, sigRaw, nowMs = Date.now()) {
  if (typeof expRaw !== 'string' || typeof sigRaw !== 'string') return false;
  if (!/^\d{1,12}$/.test(expRaw) || !/^[0-9a-f]{64}$/i.test(sigRaw)) return false;
  const exp = Number(expRaw);
  if (exp * 1000 < nowMs) return false;
  const expected = Buffer.from(hmac(name, exp), 'hex');
  const given = Buffer.from(sigRaw.toLowerCase(), 'hex');
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}
