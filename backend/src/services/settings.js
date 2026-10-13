import { DEFAULT_SETTINGS, Settings } from '../models/Settings.js';

/** @typedef {import('../models/Settings.js').SettingsDto} SettingsDto */

/** Reads the singleton settings document, creating it with defaults if missing. @returns {Promise<SettingsDto>} */
export async function getSettings() {
  const doc = await Settings.findOneAndUpdate(
    { key: 'global' },
    { $setOnInsert: { key: 'global', ...DEFAULT_SETTINGS } },
    { upsert: true, returnDocument: 'after', lean: true },
  );
  if (!doc) return structuredClone(DEFAULT_SETTINGS);
  return {
    sites: [...doc.sites],
    departments: [...doc.departments],
    purposes: [...doc.purposes],
    mailKinds: doc.mailKinds?.length ? [...doc.mailKinds] : [...DEFAULT_SETTINGS.mailKinds],
    overstayHours: doc.overstayHours,
  };
}

/**
 * Stores settings written before the post room existed with the default `mailKinds`.
 * Idempotent; run at start-up.
 */
export async function migrateSettings() {
  await Settings.updateOne(
    { key: 'global', $or: [{ mailKinds: { $exists: false } }, { mailKinds: { $size: 0 } }] },
    { $set: { mailKinds: DEFAULT_SETTINGS.mailKinds } },
  );
}

/** @param {SettingsDto} s @returns {Promise<SettingsDto>} */
export async function saveSettings(s) {
  await Settings.findOneAndUpdate(
    { key: 'global' },
    {
      $set: {
        sites: s.sites,
        departments: s.departments,
        purposes: s.purposes,
        mailKinds: s.mailKinds,
        overstayHours: s.overstayHours,
      },
    },
    { upsert: true },
  );
  return getSettings();
}
