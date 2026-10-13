import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { config } from '../config.js';
import { ApiError } from '../middleware/error.js';

/** Stored file names are always 32 hex chars + .jpg; anything else is rejected. */
export const FILE_NAME_RE = /^[a-f0-9]{32}\.jpg$/;

export const PHOTO_MAX_EDGE = 520;
export const ID_PHOTO_MAX_EDGE = 900;
export const COVER_MAX_EDGE = 1100;
export const PERSON_MAX_EDGE = 640;

export async function ensureUploadDir() {
  await fs.mkdir(config.uploadDir, { recursive: true });
}

/**
 * Resize (long edge), auto-rotate from EXIF, strip metadata, JPEG q72, write to UPLOAD_DIR.
 * @param {Buffer} buffer
 * @param {number} maxEdge
 * @param {string} field form field name, for the validation error
 * @returns {Promise<string>} the stored file name
 */
export async function storeImage(buffer, maxEdge, field) {
  let out;
  try {
    out = await sharp(buffer, { failOn: 'error' })
      .rotate()
      .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 72 })
      .toBuffer();
  } catch {
    throw new ApiError(400, 'validation', 'That image could not be read. Take the photo again.', field);
  }
  const name = `${crypto.randomBytes(16).toString('hex')}.jpg`;
  await fs.writeFile(path.join(config.uploadDir, name), out, { flag: 'wx' });
  return name;
}

/** @param {string | null | undefined} name */
export async function deleteImage(name) {
  if (!name || !FILE_NAME_RE.test(name)) return;
  await fs.unlink(path.join(config.uploadDir, name)).catch(() => undefined);
}

/**
 * Absolute path for a stored file, or null if the name is not a valid stored-file name.
 * @param {string} name
 */
export function resolveStoredFile(name) {
  if (!FILE_NAME_RE.test(name)) return null;
  const root = path.resolve(config.uploadDir);
  const full = path.resolve(root, name);
  if (path.dirname(full) !== root) return null;
  return full;
}
