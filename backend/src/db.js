import fs from 'node:fs/promises';
import mongoose from 'mongoose';
import { config } from './config.js';

const DB_NAME = 'gatebook';

/**
 * @typedef {object} DbHandle
 * @property {string} uri
 * @property {boolean} embedded
 * @property {() => Promise<void>} close
 */

/**
 * Connects Mongoose.
 * - MONGODB_URI set: connect to it.
 * - Otherwise: start an embedded mongod (mongodb-memory-server) with a persistent
 *   wiredTiger dbPath at backend/.data/mongo so dev data survives restarts.
 *   If one is already running on the embedded port (e.g. `npm run seed` while
 *   `npm run dev` is up), reuse it instead of starting a second one.
 * @returns {Promise<DbHandle>}
 */
export async function connectDb() {
  mongoose.set('strictQuery', true);

  if (config.mongodbUri) {
    await mongoose.connect(config.mongodbUri);
    console.log(`[db] connected to MongoDB (${redact(config.mongodbUri)})`);
    return { uri: config.mongodbUri, embedded: false, close: () => mongoose.disconnect() };
  }

  const port = config.embeddedMongoPort;
  const existingUri = `mongodb://127.0.0.1:${port}/${DB_NAME}`;
  if (await isReachable(existingUri)) {
    await mongoose.connect(existingUri);
    console.log(`[db] reusing embedded dev database already running on port ${port}`);
    return { uri: existingUri, embedded: true, close: () => mongoose.disconnect() };
  }

  // Imported lazily: only the embedded-dev branch needs it.
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  const dbPath = config.embeddedMongoDbPath;
  await fs.mkdir(dbPath, { recursive: true });
  console.log('[db] MONGODB_URI is not set: starting the EMBEDDED DEV DATABASE (mongodb-memory-server)');
  console.log(`[db]   data dir: ${dbPath} (wiredTiger, persists across restarts)`);
  const mongod = await MongoMemoryServer.create({
    instance: { dbPath, storageEngine: 'wiredTiger', port, dbName: DB_NAME, launchTimeout: 60_000 }, // first start after the binary download can be slow on macOS
  });
  const uri = mongod.getUri(DB_NAME);
  await mongoose.connect(uri);
  console.log(`[db]   listening at ${uri} (dev only; set MONGODB_URI for a real database)`);
  return {
    uri,
    embedded: true,
    close: async () => {
      await mongoose.disconnect();
      // Never delete the persistent dbPath.
      await mongod.stop({ doCleanup: false });
    },
  };
}

/** @param {string} uri */
async function isReachable(uri) {
  const conn = mongoose.createConnection(uri, { serverSelectionTimeoutMS: 700 });
  try {
    await conn.asPromise();
    return true;
  } catch {
    return false;
  } finally {
    await conn.close().catch(() => undefined);
  }
}

/** @param {string} uri */
function redact(uri) {
  return uri.replace(/\/\/([^@/]+)@/, '//***@');
}
