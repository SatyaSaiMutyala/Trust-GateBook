import { Schema, model } from 'mongoose';

/**
 * Every published wording of the visitor terms. An agreement PDF always prints the version the visitor accepted,
 * so wording changes never rewrite what someone agreed to.
 */
const termsVersionSchema = new Schema({
  version: { type: Number, required: true, unique: true },
  company: { type: String, default: '' },
  title: { type: String, required: true },
  body: { type: String, required: true },
  at: { type: Date, required: true },
});

export const TermsVersion = model('TermsVersion', termsVersionSchema);
