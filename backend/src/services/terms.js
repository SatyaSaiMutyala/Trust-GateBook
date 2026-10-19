/**
 * Terms versions (docs/API.md "Terms & agreement"): every wording that has been in force is kept, so an agreement
 * prints exactly what the visitor accepted.
 */
import { TermsVersion } from '../models/TermsVersion.js';
import { getSettings } from './settings.js';

/**
 * Stores a wording as its version (idempotent).
 * @param {{ version: number, company: string, title: string, body: string }} t
 */
export async function publishTermsVersion(t) {
  await TermsVersion.updateOne(
    { version: t.version },
    { $setOnInsert: { version: t.version, company: t.company, title: t.title, body: t.body, at: new Date() } },
    { upsert: true },
  );
}

/** At start-up: the wording in settings is always stored as its version. */
export async function ensureTermsVersion() {
  const { terms } = await getSettings();
  await publishTermsVersion(terms);
}

/**
 * The wording of a version (falls back to the current one if it was never stored).
 * @param {number | null | undefined} version
 */
export async function termsVersion(version) {
  const doc = version ? await TermsVersion.findOne({ version }).lean() : null;
  if (doc) return { version: doc.version, company: doc.company ?? '', title: doc.title, body: doc.body, at: doc.at };
  const { terms } = await getSettings();
  return { version: terms.version, company: terms.company, title: terms.title, body: terms.body, at: null };
}

/** All versions, newest first: `[{ version, at }]`. */
export async function termsVersions() {
  const docs = await TermsVersion.find({}, { version: 1, at: 1 }).sort({ version: -1 }).lean();
  return docs.map((d) => ({ version: d.version, at: d.at.toISOString() }));
}
