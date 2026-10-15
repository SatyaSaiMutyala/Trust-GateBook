/**
 * Photo storage behind one interface, with two drivers:
 * - local: files in UPLOAD_DIR, served by GET /api/files/<name> with an HMAC-signed URL (dev default)
 * - s3:    a private S3 bucket, served with pre-signed GetObject URLs
 *
 * What a record stores (a "ref"):
 * - `<32 hex>.jpg`            → a local file (every photo stored before S3, and all photos with STORAGE=local)
 * - `s3:<prefix><kind>/<32 hex>.jpg` → an S3 object
 * so old local photos keep working after switching STORAGE to s3, and before/while migrating them.
 *
 * AWS credentials are never read or written here: the SDK's default provider chain resolves them
 * (env vars, or the EC2 instance role).
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config.js';
import { signFileUrl } from './signing.js';

/** @typedef {'visits' | 'mail'} PhotoKind */
export const PHOTO_KINDS = /** @type {const} */ (['visits', 'mail']);

export const S3_REF_PREFIX = 's3:';
/** A local stored file name. */
export const LOCAL_NAME_RE = /^[a-f0-9]{32}\.jpg$/;
/** An S3 key we wrote: optional prefix, then kind / random name. */
const S3_KEY_RE = /^(?:[A-Za-z0-9._-]+\/)*(?:visits|mail)\/[a-f0-9]{32}\.jpg$/;

const randomName = () => `${crypto.randomBytes(16).toString('hex')}.jpg`;

/** @param {string | null | undefined} ref */
export const isS3Ref = (ref) => typeof ref === 'string' && ref.startsWith(S3_REF_PREFIX);

/** @param {string} ref */
const s3KeyOf = (ref) => ref.slice(S3_REF_PREFIX.length);

/** The S3 key a photo of this kind and file name gets. @param {PhotoKind} kind @param {string} name */
export const s3KeyFor = (kind, name) => `${config.s3.prefix}${kind}/${name}`;

/**
 * Fail fast on a bad STORAGE configuration (called at start-up).
 * @param {{ requireS3?: boolean }} [opts] requireS3: validate the S3 settings even when STORAGE=local (migration)
 */
export function assertStorageConfig(opts = {}) {
  if (!['local', 's3'].includes(config.storage)) {
    throw new Error(`STORAGE must be "local" or "s3" (got "${config.storage}").`);
  }
  if (config.storage === 's3' || opts.requireS3) {
    const who = config.storage === 's3' ? 'STORAGE=s3' : 'S3 access';
    if (!config.s3.bucket) throw new Error(`${who} needs AWS_BUCKET (e.g. AWS_BUCKET=trustlab-gatebook).`);
    if (!config.s3.region) {
      throw new Error(`${who} needs AWS_DEFAULT_REGION (or AWS_REGION), e.g. AWS_DEFAULT_REGION=ap-south-1.`);
    }
  }
}

/** @type {S3Client | null} */
let client = null;

/** Lazily created S3 client (credentials from the SDK's default provider chain). */
export function s3Client() {
  if (!client) {
    client = new S3Client({
      region: config.s3.region || undefined,
      ...(config.s3.endpoint ? { endpoint: config.s3.endpoint } : {}),
      forcePathStyle: config.s3.forcePathStyle,
    });
  }
  return client;
}

/** Tests: inject a client (e.g. with dummy credentials), or null to rebuild from config. @param {S3Client | null} c */
export function setS3ClientForTests(c) {
  client = c;
}

/** Local file path of a stored name, or null if it isn't one of ours. @param {string} name */
export function localPath(name) {
  if (!LOCAL_NAME_RE.test(name)) return null;
  const root = path.resolve(config.uploadDir);
  const full = path.resolve(root, name);
  return path.dirname(full) === root ? full : null;
}

export async function ensureLocalDir() {
  await fs.mkdir(config.uploadDir, { recursive: true });
}

/**
 * Upload a JPEG to S3 under `<prefix><kind>/<name>`.
 * @param {Buffer} buffer
 * @param {PhotoKind} kind
 * @param {string} name
 * @returns {Promise<string>} the ref (`s3:<key>`)
 */
export async function putS3(buffer, kind, name) {
  const key = s3KeyFor(kind, name);
  await s3Client().send(
    new PutObjectCommand({
      Bucket: config.s3.bucket,
      Key: key,
      Body: buffer,
      ContentType: 'image/jpeg',
      CacheControl: 'private, max-age=3600',
    }),
  );
  return S3_REF_PREFIX + key;
}

/**
 * Store a (already processed) JPEG with the configured driver.
 * @param {Buffer} buffer
 * @param {{ kind: PhotoKind, contentType?: string }} opts
 * @returns {Promise<string>} ref to keep on the record
 */
export async function save(buffer, { kind }) {
  if (!PHOTO_KINDS.includes(kind)) throw new Error(`unknown photo kind ${kind}`);
  const name = randomName();
  if (config.storage === 's3') return putS3(buffer, kind, name);
  await fs.writeFile(path.join(config.uploadDir, name), buffer, { flag: 'wx' });
  return name;
}

/**
 * A short-lived URL for a ref, whichever storage it is in.
 * Local: `/api/files/<name>?exp=&sig=`. S3: pre-signed https GetObject URL valid ≥ 1 h. The signing time is
 * rounded down to 5 minutes so the URL stays the same for a while and clients can cache the image.
 * @param {string} ref
 * @param {number} [nowMs]
 * @returns {Promise<string>}
 */
export async function url(ref, nowMs = Date.now()) {
  if (!isS3Ref(ref)) return signFileUrl(ref, nowMs);
  if (!config.s3.bucket) {
    console.error('[storage] a record points at S3 but AWS_BUCKET is not set; cannot sign', ref);
    return '';
  }
  const step = 300_000;
  const signingDate = new Date(Math.floor(nowMs / step) * step);
  return getSignedUrl(s3Client(), new GetObjectCommand({ Bucket: config.s3.bucket, Key: s3KeyOf(ref) }), {
    expiresIn: config.s3.urlTtlSeconds + step / 1000,
    signingDate,
  });
}

/**
 * Delete a stored photo (best-effort: logs, never throws). Only refs we created are touched.
 * @param {string | null | undefined} ref
 */
export async function remove(ref) {
  if (!ref) return;
  try {
    if (isS3Ref(ref)) {
      const key = s3KeyOf(ref);
      if (!S3_KEY_RE.test(key) || !config.s3.bucket) return;
      await s3Client().send(new DeleteObjectCommand({ Bucket: config.s3.bucket, Key: key }));
      return;
    }
    const full = localPath(ref);
    if (full) await fs.unlink(full);
  } catch (e) {
    if (/** @type {any} */ (e)?.code !== 'ENOENT') {
      console.error('[storage] could not delete', ref, e instanceof Error ? e.message : e);
    }
  }
}
