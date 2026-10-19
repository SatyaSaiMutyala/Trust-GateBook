import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { badRequest } from '../middleware/error.js';
import { renderAgreementPdf } from '../services/agreement.js';
import { queryString } from '../services/pagination.js';
import { getSettings, readLogo } from '../services/settings.js';
import { termsVersion, termsVersions } from '../services/terms.js';

export const termsRouter = Router();

// GET /api/terms/public?v= — the terms page for visitors (no sign-in): { version, current, title, company, body, logoUrl }
termsRouter.get('/public', async (req, res) => {
  const raw = queryString(req.query, 'v');
  const v = raw === undefined ? null : Number(raw);
  if (v !== null && (!Number.isInteger(v) || v < 1)) throw badRequest('v must be a version number.', 'v');
  const settings = await getSettings();
  const t = await termsVersion(v ?? settings.terms.version);
  res.json({
    version: t.version,
    current: settings.terms.version,
    title: t.title,
    company: t.company || settings.company.legalName || settings.company.name,
    body: t.body,
    logoUrl: settings.company.logoUrl,
  });
});

termsRouter.use(requireAuth);

// GET /api/terms — current terms (as in settings) and every version: { terms, versions: [{ version, at }] }
termsRouter.get('/', async (_req, res) => {
  const { terms } = await getSettings();
  res.json({ terms, versions: await termsVersions() });
});

// GET /api/terms/sample.pdf — what an agreement looks like with the current wording (admins)
termsRouter.get('/sample.pdf', requireRole('admin'), async (_req, res) => {
  const settings = await getSettings();
  const pdf = await renderAgreementPdf({
    visit: {
      pass: 'GB-SAMPLE-0000',
      name: 'Sample Visitor',
      phone: '98765 43210',
      company: 'Example Pvt Ltd',
      purpose: settings.purposes[0] ?? 'Meeting',
      host: 'Employee being visited',
      badge: '12',
      site: settings.sites[0],
      termsVersion: settings.terms.version,
      termsAt: new Date(),
      guardIn: { name: 'Security guard' },
    },
    terms: settings.terms,
    company: settings.company,
    photo: null,
    logo: await readLogo(),
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="sample-agreement.pdf"');
  res.setHeader('Cache-Control', 'no-store');
  res.send(pdf);
});
