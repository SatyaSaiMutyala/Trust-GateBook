import sharp from 'sharp';
import { ApiError } from '../middleware/error.js';
import * as storage from './storage.js';

/** Local stored file names are always 32 hex chars + .jpg; anything else is rejected. */
export const FILE_NAME_RE = storage.LOCAL_NAME_RE;

export const PHOTO_MAX_EDGE = 520;
export const ID_PHOTO_MAX_EDGE = 900;
export const COVER_MAX_EDGE = 1100;
export const PERSON_MAX_EDGE = 640;

/** Which storage folder a form field's photo belongs to. @type {Record<string, import('./storage.js').PhotoKind>} */
const KIND_BY_FIELD = { photo: 'visits', idPhoto: 'visits', cover: 'mail', coverBack: 'mail', person: 'mail' };

/** The local upload dir is always created: older photos may live there even with STORAGE=s3. */
export const ensureUploadDir = () => storage.ensureLocalDir();

/**
 * Resize (long edge), auto-rotate from EXIF, strip metadata, JPEG q72, then store with the configured driver.
 * @param {Buffer} buffer
 * @param {number} maxEdge
 * @param {string} field form field name (photo | idPhoto | cover | coverBack | person), for the error and the storage folder
 * @returns {Promise<string>} the ref to keep on the record (a local name or `s3:<key>`)
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
  return storage.save(out, { kind: KIND_BY_FIELD[field] ?? 'visits', contentType: 'image/jpeg' });
}

/** Best-effort delete (local file or S3 object). @param {string | null | undefined} ref */
export const deleteImage = (ref) => storage.remove(ref);

/**
 * Absolute path for a local stored file, or null if the name is not a valid stored-file name.
 * @param {string} name
 */
export const resolveStoredFile = (name) => storage.localPath(name);
