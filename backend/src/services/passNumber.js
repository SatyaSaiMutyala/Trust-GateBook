import crypto from 'node:crypto';
import { zonedParts } from './format.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * `<prefix>-YYMMDD-XXXX`, date in the display time zone (GB for visits, ML for post).
 * @param {Date} [now]
 * @param {'GB' | 'ML'} [prefix]
 */
export function generatePassNumber(now = new Date(), prefix = 'GB') {
  const { year, month, day } = zonedParts(now);
  const ymd = [year % 100, month, day].map((n) => String(n).padStart(2, '0')).join('');
  let suffix = '';
  for (let i = 0; i < 4; i++) suffix += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return `${prefix}-${ymd}-${suffix}`;
}
