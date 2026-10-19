import { Schema, model } from 'mongoose';

const refSchema = new Schema(
  { id: { type: String, required: true }, name: { type: String, required: true } },
  { _id: false },
);

/**
 * One escalation step sent for one item (the escalation log). The unique key makes each step (and each repeat)
 * go out once, even with several server processes sweeping at the same time.
 */
const escalationSchema = new Schema({
  matrix: { type: String, required: true }, // services/escalationDefs.js MATRICES
  refType: { type: String, required: true }, // visit | mail | material | key | incident | patrol | gen
  ref: { type: String, required: true }, // visit pass / mail id / pass code / key move id / incident code
  item: { type: String, required: true }, // "Anil Rao · pass 7" — what it is about, for the log
  site: { type: String, default: '' },
  step: { type: Number, required: true },
  occurrence: { type: Number, required: true }, // 1, then 2, 3 … for repeating steps
  at: { type: Date, required: true },
  title: { type: String, required: true },
  label: { type: String, default: '' },
  target: { type: String, required: true }, // guards | person | l1 … | user:<id>
  targetName: { type: String, required: true },
  recipients: { type: [refSchema], default: [] },
  note: { type: String, default: '' }, // e.g. "Nobody set at Level 2: sent to admins"
  alarm: { type: Boolean, default: false },
});
escalationSchema.index({ matrix: 1, ref: 1, step: 1, occurrence: 1 }, { unique: true, name: 'once_per_step' });
escalationSchema.index({ at: -1 });
escalationSchema.index({ matrix: 1, at: -1 });

export const Escalation = model('Escalation', escalationSchema);

/** API `EscalationEvent`. @param {any} e */
export function serializeEscalation(e) {
  return {
    id: e._id.toString(),
    matrix: e.matrix,
    refType: e.refType,
    ref: e.ref,
    item: e.item,
    site: e.site ?? '',
    step: e.step,
    occurrence: e.occurrence,
    at: e.at.toISOString(),
    title: e.title,
    label: e.label ?? '',
    target: e.target,
    targetName: e.targetName,
    recipients: (e.recipients ?? []).map((/** @type {any} */ r) => ({ id: r.id, name: r.name })),
    note: e.note ?? '',
    alarm: !!e.alarm,
  };
}
