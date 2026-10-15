import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { User } from '../models/User.js';
import { Visit } from '../models/Visit.js';
import { ensureUploadDir } from './images.js';
import { Device } from '../models/Device.js';
import { MailItem } from '../models/MailItem.js';
import { Notification } from '../models/Notification.js';
import { getSettings, migrateSettings } from './settings.js';

/** Idempotent start-up work: indexes, settings doc, upload dir, first admin. */
export async function bootstrap() {
  await Promise.all([User.syncIndexes(), Visit.syncIndexes(), MailItem.syncIndexes(), Device.syncIndexes(), Notification.syncIndexes()]);
  await getSettings();
  await migrateSettings();
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
