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

export const config = {
  nodeEnv,
  isProd,
  isTest: nodeEnv === 'test',
  port: Number.parseInt(str('PORT', '4000'), 10),
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
};
