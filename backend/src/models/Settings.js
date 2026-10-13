import { Schema, model } from 'mongoose';

/**
 * @typedef {object} SettingsDto
 * @property {string[]} sites
 * @property {string[]} departments
 * @property {string[]} purposes
 * @property {string[]} mailKinds
 * @property {number} overstayHours
 */

/** @type {SettingsDto} */
export const DEFAULT_SETTINGS = {
  sites: ['Main Gate'],
  departments: ['Administration', 'Accounts', 'HR', 'Laboratory', 'Sales', 'Marketing', 'Procurement', 'Logistics', 'IT', 'Other'],
  purposes: ['Meeting', 'Delivery', 'Vendor / Service', 'Interview', 'Sample pickup', 'Customer', 'Government / Audit', 'Other'],
  mailKinds: ['Registered post', 'Speed post', 'Courier', 'Letter', 'Parcel', 'Documents', 'Cheque / DD', 'Other'],
  overstayHours: 4,
};

/** Singleton document, `key: 'global'`. */
const settingsSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: 'global' },
    sites: { type: [String], required: true },
    departments: { type: [String], required: true },
    purposes: { type: [String], required: true },
    // Added with the post room; documents created before it lack this (merged with the default on read).
    mailKinds: { type: [String], default: undefined },
    overstayHours: { type: Number, required: true, min: 1, max: 24 },
  },
  { timestamps: true },
);

export const Settings = model('Settings', settingsSchema);
