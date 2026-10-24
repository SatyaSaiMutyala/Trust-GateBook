/**
 * Visitor confidentiality agreement PDF (docs/API.md "Terms & agreement"). When security checks a visitor in with
 * the terms accepted, the visitor's photo is placed on the agreement (the wording of the version they accepted)
 * and the PDF is stored with the visit.
 */
import PDFDocument from 'pdfkit';
import { Visit } from '../models/Visit.js';
import { emitVisitUpdated } from '../realtime.js';
import { formatDateTime } from './format.js';
import { getSettings, readLogo } from './settings.js';
import * as storage from './storage.js';
import { termsSections } from './termsDefaults.js';
import { termsVersion } from './terms.js';

const INK = '#15201C';
const MUTED = '#5B6964';
const LINE = '#D3DAD6';
const ACCENT = '#E9A316';

/** pdfkit's built-in fonts only cover Latin-1 (+ a few marks): replace what they can't draw. @param {string} s */
const safe = (s) =>
  String(s ?? '')
    .replace(/[→⇒]/g, '->')
    .replace(/[^\n -ÿ‘’“”–—•…€]/g, '?');

/**
 * @typedef {object} AgreementData
 * @property {{ pass: string, name: string, phone?: string, company?: string, purpose?: string, host?: string,
 *   dept?: string, badge?: string, site?: string, termsVersion?: number | null, termsAt?: Date | null,
 *   guardIn?: { name: string } | null }} visit
 * @property {{ version: number, company: string, title: string, body: string }} terms
 * @property {{ name: string, legalName: string, address: string, phone: string, email: string, website: string, cin: string, gstin: string }} company
 * @property {Buffer | null} photo   visitor photo (JPEG)
 * @property {{ data: Buffer } | null} logo
 */

/**
 * Renders the agreement.
 * @param {AgreementData} d
 * @returns {Promise<Buffer>}
 */
export function renderAgreementPdf(d) {
  const { visit: v, terms, company } = d;
  const doc = new PDFDocument({
    size: 'A4',
    bufferPages: true, // footers are written once all pages exist
    margins: { top: 48, bottom: 56, left: 48, right: 48 },
    info: {
      Title: safe(`${terms.title} · ${v.pass}`),
      Author: safe(company.legalName || company.name || 'TruSentinel'),
      Creator: 'TruSentinel',
    },
  });
  /** @type {Buffer[]} */
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const photoW = 110;
  const photoH = 138;

  // Accent strip and logo.
  doc.rect(0, 0, doc.page.width, 6).fill(ACCENT);
  let y = 32;
  if (d.logo?.data) {
    try {
      doc.image(d.logo.data, left, y, { fit: [170, 44] });
      y += 54;
    } catch {
      /* unreadable logo: leave it out */
    }
  }

  // Head: company, title, numbers (left) · photo (right).
  const headW = width - photoW - 18;
  const issuer = terms.company || company.legalName || company.name || 'Visitor register';
  doc
    .fillColor(MUTED)
    .font('Helvetica-Bold')
    .fontSize(8.5)
    .text(safe(issuer.toUpperCase()), left, y, { width: headW, characterSpacing: 0.8 });
  const contact = [company.address, company.phone, company.email, company.website].filter(Boolean).join(' · ');
  if (contact) doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(safe(contact), { width: headW });
  if (company.cin) doc.text(safe(`CIN ${company.cin}`), { width: headW });
  doc.moveDown(0.5).font('Helvetica-Bold').fontSize(17).fillColor(INK).text(safe(terms.title), { width: headW });
  doc
    .moveDown(0.15)
    .font('Helvetica')
    .fontSize(9)
    .fillColor(MUTED)
    .text(safe(`Agreement no. ${v.pass} · Terms version ${v.termsVersion ?? terms.version}`), { width: headW });

  // Photo box.
  const headBottom = doc.y; // the details grid starts here, beside the photo
  const photoY = y;
  if (d.photo) {
    try {
      doc.image(d.photo, left + width - photoW, photoY, { cover: [photoW, photoH], align: 'center', valign: 'center' });
    } catch {
      d.photo = null;
    }
  }
  doc
    .lineWidth(0.8)
    .strokeColor(LINE)
    .rect(left + width - photoW, photoY, photoW, photoH)
    .stroke();
  if (!d.photo) {
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(MUTED)
      .text('No photograph', left + width - photoW, photoY + photoH / 2 - 5, { width: photoW, align: 'center' });
  }
  doc
    .font('Helvetica')
    .fontSize(7.5)
    .fillColor(MUTED)
    .text('Photograph taken at check-in', left + width - photoW, photoY + photoH + 4, {
      width: photoW,
      align: 'center',
    });

  // Details grid (two columns, empty rows skipped).
  const rows = [
    ['Visitor', v.name],
    ['Mobile', v.phone],
    ['Company', v.company],
    ['Purpose', v.purpose],
    ['Visiting', [v.host, v.dept].filter(Boolean).join(', ')],
    ['Visitor pass no.', v.badge],
    ['Gate', v.site],
    ['Date & time', v.termsAt ? formatDateTime(v.termsAt) : ''],
    ['Checked in by', v.guardIn?.name],
  ].filter(([, val]) => val);
  let gy = headBottom + 14;
  const colW = (headW - 12) / 2;
  rows.forEach(([label, val], i) => {
    const x = left + (i % 2) * (colW + 12);
    if (i % 2 === 0 && i > 0) gy += 30;
    doc
      .font('Helvetica-Bold')
      .fontSize(7)
      .fillColor(MUTED)
      .text(safe(String(label).toUpperCase()), x, gy, { width: colW, characterSpacing: 0.5 });
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(INK)
      .text(safe(val), x, gy + 10, { width: colW, height: 14, ellipsis: true });
  });
  y = Math.max(gy + 34, photoY + photoH + 22);

  // Terms text.
  doc
    .moveTo(left, y)
    .lineTo(left + width, y)
    .lineWidth(0.6)
    .strokeColor(LINE)
    .stroke();
  doc
    .font('Helvetica-Bold')
    .fontSize(12)
    .fillColor(INK)
    .text('Terms and conditions', left, y + 12, { width });
  doc.moveDown(0.4);
  for (const s of termsSections(terms.body)) {
    if (s.heading)
      doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text(safe(s.heading), { width }).moveDown(0.1);
    doc
      .font('Helvetica')
      .fontSize(9.5)
      .fillColor(INK)
      .text(safe(s.text), { width, lineGap: 2, align: 'left' })
      .moveDown(0.55);
  }

  // Acceptance box (kept together on one page).
  const boxH = 92;
  if (doc.y + boxH + 12 > doc.page.height - doc.page.margins.bottom) doc.addPage();
  const by = doc.y + 6;
  doc.lineWidth(0.9).strokeColor(INK).rect(left, by, width, boxH).stroke();
  let tx = left + 12;
  if (d.photo) {
    try {
      doc.image(d.photo, left + 10, by + 10, { cover: [56, 72] });
      tx = left + 78;
    } catch {
      /* ignore */
    }
  }
  const when = v.termsAt ? formatDateTime(v.termsAt) : '—';
  doc
    .font('Helvetica-Bold')
    .fontSize(10.5)
    .fillColor(INK)
    .text('Accepted', tx, by + 10, { width: left + width - tx - 12 });
  doc
    .font('Helvetica')
    .fontSize(9)
    .text(
      safe(
        `${v.name} accepted these terms by checking in with a photograph at ${v.site ?? 'the gate'} on ${when}. The photograph on this agreement was captured at the time of acceptance and stands as the visitor's acknowledgement.`,
      ),
      { width: left + width - tx - 12, lineGap: 1.5 },
    );
  doc
    .moveDown(0.3)
    .fontSize(8)
    .fillColor(MUTED)
    .text(safe(`Recorded by security: ${v.guardIn?.name || '—'}`), { width: left + width - tx - 12 });

  // Footer on every page.
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    // Writing inside the bottom margin would make pdfkit add a page: lift the margin for the footer.
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const fy = doc.page.height - 34;
    doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor(MUTED)
      .text(safe(`${v.pass} · TruSentinel visitor register · page ${i + 1} of ${range.count}`), left, fy, {
        width,
        align: 'center',
        lineBreak: false,
      });
    doc.page.margins.bottom = bottom;
  }
  doc.end();
  return done;
}

/**
 * Builds the agreement data for a visit document and renders it.
 * @param {any} visit
 */
export async function agreementPdfFor(visit) {
  const [settings, terms, photo, logo] = await Promise.all([
    getSettings(),
    termsVersion(visit.termsVersion),
    storage.read(visit.photo),
    readLogo(),
  ]);
  return renderAgreementPdf({
    visit: visit.toObject ? visit.toObject() : visit,
    terms,
    company: settings.company,
    photo,
    logo,
  });
}

/**
 * Creates (or replaces) the stored agreement PDF of a visit that accepted the terms, and tells the gate.
 * @param {string} pass
 * @returns {Promise<any | null>} the updated visit, or null when it has no accepted terms
 */
export async function createAgreement(pass) {
  const visit = await Visit.findOne({ pass });
  if (!visit?.termsAt) return null;
  const pdf = await agreementPdfFor(visit);
  const ref = await storage.save(pdf, { kind: 'agreements', contentType: 'application/pdf' });
  const old = visit.agreement;
  const updated = await Visit.findOneAndUpdate(
    { _id: visit._id },
    { $set: { agreement: ref } },
    { returnDocument: 'after' },
  );
  if (old && old !== ref) await storage.remove(old);
  if (updated) emitVisitUpdated(updated);
  return updated;
}

/** After check-in: make the agreement in the background (logs, never throws). @param {string} pass */
export function createAgreementSoon(pass) {
  createAgreement(pass).catch((e) =>
    console.error('[agreement] could not create the PDF for', pass, e instanceof Error ? e.message : e),
  );
}
