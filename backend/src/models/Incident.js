import { Schema, model } from 'mongoose';

/**
 * Incidents (docs/API.md "Incidents"): anything unsafe or wrong, reported by security, patrols or staff, followed
 * up with updates until closed.
 */
export const INCIDENT_SEVERITIES = /** @type {const} */ (['low', 'medium', 'high', 'critical']);
export const INCIDENT_STATUSES = /** @type {const} */ (['open', 'in_progress', 'closed']);

const refSchema = new Schema(
  { id: { type: String, required: true }, name: { type: String, required: true } },
  { _id: false },
);

const updateSchema = new Schema(
  {
    at: { type: Date, required: true },
    by: { type: refSchema, required: true },
    text: { type: String, default: '' },
    status: { type: String, enum: [...INCIDENT_STATUSES, null], default: null }, // set when it changed
    assignTo: { type: refSchema, default: null }, // set when it changed
  },
  { _id: false },
);

const incidentSchema = new Schema(
  {
    code: { type: String, required: true, unique: true }, // IN-YYMMDD-XXXX, exposed as `id`
    site: { type: String, required: true },
    location: { type: String, default: '' },
    type: { type: String, required: true },
    severity: { type: String, enum: INCIDENT_SEVERITIES, required: true },
    occurredAt: { type: Date, required: true },
    reportedAt: { type: Date, required: true },
    reportedBy: { type: refSchema, required: true },
    description: { type: String, required: true },
    people: { type: String, default: '' },
    actionTaken: { type: String, default: '' },
    photos: { type: [String], default: [] },
    status: { type: String, enum: INCIDENT_STATUSES, default: 'open' },
    assignedTo: { type: refSchema, default: null },
    closedAt: { type: Date, default: null },
    closedBy: { type: refSchema, default: null },
    resolution: { type: String, default: '' },
    source: { type: String, default: '' }, // '' | patrol | camera
    updates: { type: [updateSchema], default: [] },
  },
  { timestamps: true },
);
incidentSchema.index({ site: 1, reportedAt: -1 });
incidentSchema.index({ status: 1, severity: 1 });
incidentSchema.index({ 'reportedBy.id': 1, reportedAt: -1 });
incidentSchema.index({ 'assignedTo.id': 1, reportedAt: -1 });

export const Incident = model('Incident', incidentSchema);
