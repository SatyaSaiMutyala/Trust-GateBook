import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

/** Absolute path of backend/. */
export const BACKEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

dotenv.config({ path: path.join(BACKEND_ROOT, '.env'), quiet: true });

const env = process.env;
const nodeEnv = env.NODE_ENV ?? 'development';
const isProd = nodeEnv === 'production';

/** @param {string} name @param {string} fallback */
function str(name, fallback) {
  const v = env[name];
  return v !== undefined && v.trim() !== '' ? v.trim() : fallback;
}

/** @param {string} name @param {string} devFallback */
function secret(name, devFallback) {
  const v = env[name]?.trim();
  if (v) return v;
  if (isProd) throw new Error(`${name} must be set in production`);
  return devFallback;
}

/** @returns {string[] | '*'} */
function corsOrigins() {
  const raw = env.CORS_ORIGIN?.trim();
  if (!raw) {
    return isProd ? ['http://localhost:5173', 'http://localhost:8081', 'http://localhost:19006'] : '*';
  }
  if (raw === '*') return '*';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Optional Pace HR employee API. OFF by default: post receivers are Gatebook's own users who can receive
 * post (role `host` / Employee, or `isHost` "Can also receive post"). Set PACE_EMPLOYEES_URL to switch it on.
 */
function paceUrl() {
  return (env.PACE_EMPLOYEES_URL ?? '').trim();
}

/** 'true' / '1' / 'yes' (any case) → true; anything else (or unset) → false. @param {string} name */
function flag(name) {
  return ['true', '1', 'yes'].includes((env[name] ?? '').trim().toLowerCase());
}

const signupEnabled = flag('SIGNUP_ENABLED');

export const config = {
  nodeEnv,
  isProd,
  isTest: nodeEnv === 'test',
  port: Number.parseInt(str('PORT', '4000'), 10),
  // Interface to listen on. Production default 127.0.0.1 (behind nginx on the same machine); dev: all interfaces
  // (undefined) so phones on the Wi-Fi can reach a laptop backend. Override with HOST=0.0.0.0 / 127.0.0.1.
  host: env.HOST?.trim() || (isProd ? '127.0.0.1' : undefined),
  mongodbUri: env.MONGODB_URI?.trim() || '',
  embeddedMongoPort: Number.parseInt(str('EMBEDDED_MONGO_PORT', '27018'), 10),
  embeddedMongoDbPath: path.join(BACKEND_ROOT, '.data', 'mongo'),
  jwtSecret: secret('JWT_SECRET', 'gatebook-dev-jwt-secret'),
  jwtExpiresIn: '7d',
  fileUrlSecret: secret('FILE_URL_SECRET', 'gatebook-dev-file-url-secret'),
  fileUrlTtlSeconds: 60 * 60,
  corsOrigin: corsOrigins(),
  admin: {
    email: str('ADMIN_EMAIL', 'admin@gatebook.local').toLowerCase(),
    password: str('ADMIN_PASSWORD', 'admin123'),
    name: str('ADMIN_NAME', 'Administrator'),
  },
  uploadDir: path.resolve(BACKEND_ROOT, str('UPLOAD_DIR', 'uploads')),
  displayTz: str('TZ_DISPLAY', 'Asia/Kolkata'),
  maxUploadBytes: 8 * 1024 * 1024,
  paceEmployeesUrl: paceUrl(),
  /** Firebase Admin service account JSON (push). Missing file = push disabled. */
  firebaseServiceAccount: path.resolve(BACKEND_ROOT, str('FIREBASE_SERVICE_ACCOUNT', 'secrets/firebase-service-account.json')),
  features: {
    signup: signupEnabled,
    // Apple guideline 5.1.1(v): apps that let people create an account must let them delete it.
    accountDeletion: signupEnabled || flag('ACCOUNT_DELETION_ENABLED'),
  },
  signupRateLimit: { max: 5, windowMs: 60 * 60 * 1000 },
  paceTimeoutMs: 8_000,
  paceCacheMs: 60_000,
};
