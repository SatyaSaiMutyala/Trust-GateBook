import { Schema, model } from 'mongoose';
import { DEFAULT_ESC } from '../services/escalationDefs.js';
import { DEFAULT_TERMS } from '../services/termsDefaults.js';

/**
 * @typedef {object} Company
 * @property {string} name       short name, shown in the apps
 * @property {string} legalName  registered name, on documents
 * @property {string} address
 * @property {string} phone
 * @property {string} email
 * @property {string} website
 * @property {string} gstin
 * @property {string} cin
 * @property {string | null} logoUrl  public `/api/brand/logo?v=…`, or null (set with POST /api/settings/logo)
 */

/**
 * @typedef {object} SettingsDto
 * @property {string[]} sites
 * @property {string[]} departments
 * @property {string[]} purposes
 * @property {string[]} mailKinds
 * @property {string[]} designations  job-title suggestions for users
 * @property {number} overstayHours
 * @property {number} hostReplyMinutes  minutes before security is told a host has not replied (= the first visitor
 *   escalation step to guards)
 * @property {boolean} expectedPreapproved  new expected visitors start pre-approved (the form can change it)
 * @property {boolean} visitorPhotoRequired
 * @property {boolean} visitorPassRequired
 * @property {boolean} mailCoverRequired  front + back cover photos
 * @property {boolean} mailPersonPhotoRequired  delivery person photo
 * @property {string[]} mpUnits  material: units for item lines
 * @property {string[]} mpPurposesIn
 * @property {string[]} mpPurposesOut
 * @property {string[]} mpChallanIn  challan types for material IN
 * @property {string[]} mpChallanOut
 * @property {boolean} mpAuthRequiredOut  material OUT needs an authorising employee
 * @property {boolean} mpApprovalInApp  security-made OUT passes naming an employee need their approval in the app
 * @property {boolean} mpChallanPhotoRequired
 * @property {boolean} mpCarrierPhotoRequired  photo of a carrier who is not a visitor
 * @property {number} mpReturnDays  default return period for returnable material
 * @property {number} keyReturnHours  default time a key is out for (0 = no return time)
 * @property {number} genCheckDays  diesel level check every N days
 * @property {number} genCheckHour  … due at this hour (display time zone)
 * @property {string[]} incidentTypes
 * @property {Company} company
 * @property {import('../services/termsDefaults.js').Terms} terms  visitor terms & confidentiality agreement
 * @property {Record<import('../services/escalationDefs.js').MatrixKey, import('../services/escalationDefs.js').EscStep[]>} esc
 */

/** @type {SettingsDto} */
export const DEFAULT_SETTINGS = {
  sites: ['Main Gate'],
  departments: [
    'Administration',
    'Accounts',
    'HR',
    'Laboratory',
    'Sales',
    'Marketing',
    'Procurement',
    'Logistics',
    'IT',
    'Other',
  ],
  purposes: [
    'Meeting',
    'Delivery',
    'Vendor / Service',
    'Interview',
    'Sample pickup',
    'Customer',
    'Government / Audit',
    'Other',
  ],
  mailKinds: ['Registered post', 'Speed post', 'Courier', 'Letter', 'Parcel', 'Documents', 'Cheque / DD', 'Other'],
  designations: [
    'Security guard',
    'Security supervisor',
    'Security manager',
    'Facility manager',
    'Department head',
    'Manager',
    'Executive',
    'Director',
  ],
  overstayHours: 4,
  hostReplyMinutes: 5,
  expectedPreapproved: true,
  visitorPhotoRequired: true,
  visitorPassRequired: true,
  mailCoverRequired: true,
  mailPersonPhotoRequired: true,
  mpUnits: ['Nos', 'Box', 'Carton', 'Set', 'Kg', 'Litre', 'Metre', 'Packet', 'Roll', 'Bag'],
  mpPurposesIn: ['Delivery / supply', 'Returned after repair', 'Vendor tools / equipment', 'Demo equipment', 'Branch transfer', 'Personal belongings', 'Other'],
  mpPurposesOut: ['Repair / calibration', 'Return to vendor', 'Branch transfer', 'Sample dispatch', 'Scrap / disposal', 'Vendor tools taken back', 'Other'],
  mpChallanIn: ['Delivery challan', 'Tax invoice', 'Goods return challan', 'Other'],
  mpChallanOut: ['Transfer challan', 'Goods return challan', 'Delivery challan', 'Other'],
  mpAuthRequiredOut: true,
  mpApprovalInApp: true,
  mpChallanPhotoRequired: true,
  mpCarrierPhotoRequired: true,
  mpReturnDays: 7,
  keyReturnHours: 4,
  genCheckDays: 7,
  genCheckHour: 9,
  incidentTypes: [
    'Theft / missing item',
    'Trespass / unauthorised entry',
    'Suspicious person or object',
    'Fire / smoke',
    'Medical emergency',
    'Fight / misconduct',
    'Property damage',
    'Power failure',
    'Water leak',
    'Lift / equipment fault',
    'Vehicle / parking',
    'Other',
  ],
  company: {
    name: '',
    legalName: '',
    address: '',
    phone: '',
    email: '',
    website: '',
    gstin: '',
    cin: '',
    logoUrl: null,
  },
  esc: DEFAULT_ESC,
  terms: DEFAULT_TERMS,
};

const stepSchema = new Schema(
  {
    after: { type: Number, required: true },
    to: { type: String, required: true },
    repeat: { type: Number, default: 0 },
    alarm: { type: Boolean, default: false },
    label: { type: String, default: '' },
    end: { type: Boolean, default: undefined },
  },
  { _id: false },
);

/** Singleton document, `key: 'global'`. Fields added after the first release are optional: missing = the default. */
const settingsSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: 'global' },
    sites: { type: [String], required: true },
    departments: { type: [String], required: true },
    purposes: { type: [String], required: true },
    mailKinds: { type: [String], default: undefined },
    designations: { type: [String], default: undefined },
    overstayHours: { type: Number, required: true, min: 1, max: 24 },
    // Before the escalation matrix: the no-reply minutes. Still read when `esc.visitor` was never saved.
    hostReplyMinutes: { type: Number, min: 0, max: 43200, default: undefined },
    expectedPreapproved: { type: Boolean, default: undefined },
    visitorPhotoRequired: { type: Boolean, default: undefined },
    visitorPassRequired: { type: Boolean, default: undefined },
    mailCoverRequired: { type: Boolean, default: undefined },
    mailPersonPhotoRequired: { type: Boolean, default: undefined },
    mpUnits: { type: [String], default: undefined },
    mpPurposesIn: { type: [String], default: undefined },
    mpPurposesOut: { type: [String], default: undefined },
    mpChallanIn: { type: [String], default: undefined },
    mpChallanOut: { type: [String], default: undefined },
    mpAuthRequiredOut: { type: Boolean, default: undefined },
    mpApprovalInApp: { type: Boolean, default: undefined },
    mpChallanPhotoRequired: { type: Boolean, default: undefined },
    mpCarrierPhotoRequired: { type: Boolean, default: undefined },
    mpReturnDays: { type: Number, min: 1, max: 365, default: undefined },
    keyReturnHours: { type: Number, min: 0, max: 720, default: undefined },
    genCheckDays: { type: Number, min: 1, max: 60, default: undefined },
    genCheckHour: { type: Number, min: 0, max: 23, default: undefined },
    incidentTypes: { type: [String], default: undefined },
    company: {
      type: new Schema(
        {
          name: String,
          legalName: String,
          address: String,
          phone: String,
          email: String,
          website: String,
          gstin: String,
          cin: String,
        },
        { _id: false },
      ),
      default: undefined,
    },
    terms: {
      type: new Schema(
        { required: Boolean, company: String, title: String, body: String, version: Number },
        { _id: false },
      ),
      default: undefined,
    },
    // Logo bytes (resized PNG / JPEG), served publicly by GET /api/brand/logo.
    logo: { type: Buffer, default: undefined, select: false },
    logoType: { type: String, default: undefined },
    logoAt: { type: Date, default: undefined },
    esc: {
      type: new Schema(
        {
          visitor: { type: [stepSchema], default: undefined },
          overstay: { type: [stepSchema], default: undefined },
          mail: { type: [stepSchema], default: undefined },
          mpreceipt: { type: [stepSchema], default: undefined },
          mpapproval: { type: [stepSchema], default: undefined },
          material: { type: [stepSchema], default: undefined },
          keys: { type: [stepSchema], default: undefined },
          incident_critical: { type: [stepSchema], default: undefined },
          incident_high: { type: [stepSchema], default: undefined },
          incident_medium: { type: [stepSchema], default: undefined },
          incident_low: { type: [stepSchema], default: undefined },
          patrol: { type: [stepSchema], default: undefined },
          gencheck: { type: [stepSchema], default: undefined },
          genlow: { type: [stepSchema], default: undefined },
        },
        { _id: false },
      ),
      default: undefined,
    },
  },
  { timestamps: true },
);

export const Settings = model('Settings', settingsSchema);
