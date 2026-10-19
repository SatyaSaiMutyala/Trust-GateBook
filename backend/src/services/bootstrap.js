import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { User } from '../models/User.js';
import { Visit } from '../models/Visit.js';
import { ensureUploadDir } from './images.js';
import { assertStorageConfig } from './storage.js';
import { Device } from '../models/Device.js';
import { Escalation } from '../models/Escalation.js';
import { Expected } from '../models/Expected.js';
import { MailItem } from '../models/MailItem.js';
import { Notification } from '../models/Notification.js';
import { TermsVersion } from '../models/TermsVersion.js';
import { MaterialPass } from '../models/MaterialPass.js';
import { ensureTermsVersion } from './terms.js';
import { getSettings, migrateSettings } from './settings.js';

/** Idempotent start-up work: indexes, settings doc, upload dir, first admin. */
export async function bootstrap() {
  assertStorageConfig();
  // createIndexes (not syncIndexes): only adds missing indexes, never drops existing ones — syncIndexes failed on
  // the production database (same fix as applied on the AWS server).
  // The open-badge index became partial on non-empty badges (optional pass): drop the old one once.
  await Visit.collection.dropIndex('open_badge_per_site').catch(() => {});
  await Promise.all([User.createIndexes(), Visit.createIndexes(), MailItem.createIndexes(), Device.createIndexes(), Notification.createIndexes(), Expected.createIndexes(), Escalation.createIndexes(), TermsVersion.createIndexes(), MaterialPass.createIndexes()]);
  await getSettings();
  await migrateSettings();
  await ensureTermsVersion();
  // Users created before sign-up existed have no status: they are active accounts.
  await User.updateMany({ status: { $exists: false } }, { $set: { status: 'active' } });
  await ensureUploadDir();
  if ((await User.estimatedDocumentCount()) === 0) {
    await User.create({
      name: config.admin.name,
      email: config.admin.email,
      passwordHash: await bcrypt.hash(config.admin.password, 10),
      role: 'admin',
      active: true,
    });
    console.log(`[bootstrap] created first admin ${config.admin.email}`);
  }
}
