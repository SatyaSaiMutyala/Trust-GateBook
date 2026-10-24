/**
 * Material gate pass document (docs/API.md "Material gate passes"): made on request from the stored pass, with the
 * carrier's photo, the employee's confirmation, security's counts and the challan photos.
 */
import PDFDocument from 'pdfkit';
import { formatDateTime } from './format.js';
import { getSettings, readLogo } from './settings.js';
import * as storage from './storage.js';

const INK = '#15201C';
const MUTED = '#5B6964';
const LINE = '#D3DAD6';
const GREEN = '#1D8752';
const AMBER = '#B9620F';

/** pdfkit's built-in fonts only cover Latin-1: replace what they can't draw. @param {unknown} s */
const safe = (s) =>
  String(s ?? '')
    .replace(/[→⇒]/g, '->')
    .replace(/[^\n -ÿ‘’“”–—•…€]/g, '?');
/** @param {number} n */
const boxes = (n) => `${n} box${n === 1 ? '' : 'es'}`;
/** @param {Date | null | undefined} d */
const dt = (d) => (d ? formatDateTime(d) : '');

/**
 * @param {any} m MaterialPass document
 * @returns {Promise<Buffer>}
 */
export async function gatePassPdf(m) {
  const [settings, logo, carrierPhoto, ...challans] = await Promise.all([
    getSettings(),
    readLogo(),
    storage.read(m.carrier?.photo),
    ...(m.challanPhotos ?? []).map((/** @type {string} */ r) => storage.read(r)),
  ]);
  const company = settings.company;
  const doc = new PDFDocument({
    size: 'A4',
    bufferPages: true,
    margins: { top: 0, bottom: 48, left: 42, right: 42 },
    info: { Title: `Gate pass ${m.code}`, Creator: 'TruSentinel' },
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
  const isIn = m.direction === 'in';
  const band = isIn ? GREEN : AMBER;

  // Header band.
  const bandH = 104;
  doc.rect(0, 0, doc.page.width, bandH).fill(band);
  let x = left;
  if (logo?.data) {
    try {
      doc.roundedRect(left, 22, 120, 60, 6).fill('#FFFFFF');
      doc.image(logo.data, left + 8, 28, { fit: [104, 48], align: 'center', valign: 'center' });
      x = left + 134;
    } catch {
      /* unreadable logo */
    }
  }
  doc
    .fillColor('#FFFFFF')
    .font('Helvetica-Bold')
    .fontSize(9)
    .text(safe((company.legalName || company.name || 'Material gate pass').toUpperCase()), x, 24, {
      width: width - (x - left),
      characterSpacing: 0.8,
    });
  doc.fontSize(24).text(`MATERIAL ${isIn ? 'IN' : 'OUT'}`, x, 38, { width: width - (x - left) });
  doc
    .font('Helvetica')
    .fontSize(9.5)
    .text(
      safe(`${m.returnable ? 'Returnable' : 'Non-returnable'} · ${m.code} · ${m.site} · ${dt(m.createdAt)}`),
      x,
      70,
      { width: width - (x - left) },
    );

  // Boxes + details.
  let y = bandH + 20;
  doc.lineWidth(1.2).strokeColor(band).roundedRect(left, y, 120, 84, 8).stroke();
  doc
    .fillColor(MUTED)
    .font('Helvetica-Bold')
    .fontSize(7.5)
    .text('NUMBER OF BOXES', left, y + 10, { width: 120, align: 'center', characterSpacing: 0.6 });
  doc
    .fillColor(INK)
    .font('Helvetica-Bold')
    .fontSize(36)
    .text(String(m.boxes), left, y + 24, { width: 120, align: 'center' });
  const rows = [
    ['Challan', m.challanType],
    ['Challan no.', m.refNo],
    ['Purpose', m.purpose],
    ['E-way bill', m.ewaybill],
    ...(m.returnable
      ? [
          [
            isIn ? 'To go back out by' : 'Expected back by',
            m.returnDue ? formatDateTime(m.returnDue).replace(/, .*$/, '') : '',
          ],
        ]
      : []),
    ['Remarks', m.remarks],
  ].filter(([, v]) => v);
  const gx = left + 140;
  const gw = (width - 140 - 12) / 2;
  rows.forEach(([label, val], i) => {
    const cx = gx + (i % 2) * (gw + 12);
    const cy = y + Math.floor(i / 2) * 30;
    doc
      .fillColor(MUTED)
      .font('Helvetica-Bold')
      .fontSize(7)
      .text(safe(String(label).toUpperCase()), cx, cy, { width: gw, characterSpacing: 0.5 });
    doc
      .fillColor(INK)
      .font('Helvetica-Bold')
      .fontSize(10)
      .text(safe(val), cx, cy + 10, { width: gw, height: 14, ellipsis: true });
  });
  y += Math.max(96, Math.ceil(rows.length / 2) * 30 + 8);

  // Extra item lines.
  const extra = (m.items ?? []).slice(1);
  if (extra.length) {
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(10).text('Item details', left, y);
    y += 16;
    for (const it of extra) {
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor(INK)
        .text(safe(`${it.desc} — ${it.qty} ${it.unit}${it.serial ? ` · serial ${it.serial}` : ''}`), left, y, {
          width,
        });
      y = doc.y + 3;
    }
    y += 6;
  }

  // People.
  doc
    .moveTo(left, y)
    .lineTo(left + width, y)
    .lineWidth(0.6)
    .strokeColor(LINE)
    .stroke();
  y += 12;
  const half = (width - 20) / 2;
  const c = m.carrier ?? {};
  const pickupWaiting = m.mode === 'pickup' && !m.releasedAt;
  doc
    .fillColor(MUTED)
    .font('Helvetica-Bold')
    .fontSize(8)
    .text(isIn ? 'BROUGHT IN BY' : pickupWaiting ? 'TO BE COLLECTED BY' : 'TAKEN OUT BY', left, y, {
      width: half,
      characterSpacing: 0.6,
    });
  const py = y + 14;
  if (carrierPhoto) {
    try {
      doc.image(carrierPhoto, left, py, { cover: [84, 104] });
    } catch {
      /* ignore */
    }
  }
  doc.lineWidth(0.6).strokeColor(LINE).rect(left, py, 84, 104).stroke();
  if (!carrierPhoto)
    doc
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(8)
      .text('No photo', left, py + 46, { width: 84, align: 'center' });
  const px = left + 96;
  const pw = half - 96;
  let ty = py;
  for (const [label, val] of [
    ['Name', c.name || m.pickerName],
    ['Company', c.company || m.pickerCompany],
    ['Mobile', c.phone || m.pickerPhone],
    ['Visitor pass', c.visitBadge],
    ['Vehicle', c.vehicle],
  ]) {
    if (!val) continue;
    doc.fillColor(MUTED).font('Helvetica').fontSize(7.5).text(label, px, ty, { width: pw });
    doc
      .fillColor(INK)
      .font('Helvetica-Bold')
      .fontSize(10)
      .text(safe(val), px, ty + 9, { width: pw, height: 13, ellipsis: true });
    ty += 24;
  }

  const ex = left + half + 20;
  const name = m.authorisedBy?.name || 'Security';
  doc
    .fillColor(MUTED)
    .font('Helvetica-Bold')
    .fontSize(8)
    .text(isIn ? 'RECEIVED BY (EMPLOYEE)' : 'SENT BY (EMPLOYEE)', ex, y, { width: half, characterSpacing: 0.6 });
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(12).text(safe(name), ex, py, { width: half });
  let when = '';
  let statement = '';
  if (isIn) {
    when = m.receivedAt
      ? `Accepted ${dt(m.receivedAt)}${m.receiptVia === 'security' ? ' (on paper)' : ' in TruSentinel'}`
      : 'Not yet accepted';
    statement = m.receivedAt && m.authorisedBy ? `${name} confirmed receiving ${boxes(m.boxes)}.` : '';
  } else if (m.requestedBy) {
    when = `Prepared ${dt(m.createdAt)}`;
    statement = `${name} prepared this pass in TruSentinel.`;
  } else if (m.approvedAt) {
    when = `Approved ${dt(m.approvedAt)}`;
    statement = `${name} authorised these boxes to go out.`;
  } else if (m.authorisedBy) {
    when = 'Authorised';
    statement = `${name} authorised these boxes to go out.`;
  }
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(MUTED)
    .text(safe(when), ex, doc.y + 2, { width: half });
  if (statement)
    doc.moveDown(0.4).font('Helvetica-Oblique').fontSize(9.5).fillColor(INK).text(safe(statement), { width: half });
  y = Math.max(py + 114, ty + 6, doc.y + 10);

  // Security record.
  doc
    .moveTo(left, y)
    .lineTo(left + width, y)
    .lineWidth(0.6)
    .strokeColor(LINE)
    .stroke();
  y += 10;
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(10).text('Security record', left, y);
  y += 16;
  const rec = [
    m.droppedAt
      ? ['Handed in at gate', `${boxes(m.droppedBoxes ?? m.boxes)} · ${dt(m.droppedAt)} · ${m.droppedBy?.name ?? ''}`]
      : null,
    m.checkedAt
      ? [
          isIn ? 'Counted at entry' : 'Counted at exit',
          `${m.checkedBoxes} of ${boxes(m.boxes)} · ${dt(m.checkedAt)} · ${m.checkedBy?.name ?? ''}`,
        ]
      : null,
    !isIn && m.releasedAt ? ['Released', `${dt(m.releasedAt)} · ${m.releasedBy?.name ?? ''}`] : null,
    ...(m.returns ?? []).map((/** @type {any} */ r) => [
      isIn ? 'Taken back out' : 'Back in',
      `${r.lines.map((/** @type {any} */ l) => `${l.qty} ${m.items[l.i]?.unit === 'Box' ? (l.qty === 1 ? 'box' : 'boxes') : (m.items[l.i]?.desc ?? '')}`).join(', ')} · ${dt(r.at)} · ${r.by?.name ?? ''}${r.note ? ` · ${r.note}` : ''}`,
    ]),
    m.cancelledAt ? ['Cancelled', `${dt(m.cancelledAt)} · ${m.cancelledBy?.name ?? ''}`] : null,
  ].filter(Boolean);
  if (!rec.length) rec.push(['Status', 'Not counted yet']);
  for (const [label, val] of /** @type {string[][]} */ (rec)) {
    doc.fillColor(MUTED).font('Helvetica').fontSize(8.5).text(label, left, y, { width: 130 });
    doc
      .fillColor(INK)
      .font('Helvetica')
      .fontSize(9)
      .text(safe(val), left + 134, y, { width: width - 134 });
    y = Math.max(doc.y, y + 12) + 3;
  }

  // Company footer line.
  const foot = [company.address, company.gstin ? `GSTIN ${company.gstin}` : '', company.cin ? `CIN ${company.cin}` : '']
    .filter(Boolean)
    .join(' · ');
  if (foot) {
    y += 6;
    doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(safe(foot), left, y, { width });
    y = doc.y + 8;
  }

  // Challan photos, full width.
  const imgs = challans.filter(Boolean);
  for (const [k, img] of imgs.entries()) {
    const h = 300;
    if (y + h + 24 > doc.page.height - doc.page.margins.bottom) {
      doc.addPage({ margins: { top: 42, bottom: 48, left, right: left } });
      y = 42;
    }
    doc
      .fillColor(INK)
      .font('Helvetica-Bold')
      .fontSize(9.5)
      .text(safe(`${m.challanType || 'Challan'} (photo${imgs.length > 1 ? ` ${k + 1}` : ''})`), left, y);
    try {
      doc.image(/** @type {Buffer} */ (img), left, y + 14, { fit: [width, h], align: 'center' });
    } catch {
      /* unreadable */
    }
    y += h + 24;
  }

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(7.5)
      .text(`${m.code} · TruSentinel material gate pass · page ${i + 1} of ${range.count}`, left, doc.page.height - 30, {
        width,
        align: 'center',
        lineBreak: false,
      });
    doc.page.margins.bottom = bottom;
  }
  doc.end();
  return done;
}
