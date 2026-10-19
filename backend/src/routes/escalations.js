import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { badRequest } from '../middleware/error.js';
import { Escalation, serializeEscalation } from '../models/Escalation.js';
import { csvRow } from '../services/csv.js';
import { MATRICES, MATRIX_KEYS } from '../services/escalationDefs.js';
import { formatDateTime } from '../services/format.js';
import { paginate, parseListQuery, queryString } from '../services/pagination.js';

export const escalationsRouter = Router();
escalationsRouter.use(requireAuth, requireRole('admin'));

const DAY_MS = 86_400_000;
const EXPORT_CAP = 10_000;
const BOM = String.fromCharCode(0xfeff); // so Excel reads the CSV as UTF-8

/** ?days=1|7|30 (default 7) & matrix= @param {Record<string, unknown>} query */
function filterOf(query) {
  const days = Number(queryString(query, 'days') ?? 7);
  if (![1, 7, 30, 90].includes(days)) throw badRequest('days must be 1, 7, 30 or 90.', 'days');
  /** @type {Record<string, unknown>} */
  const filter = { at: { $gte: new Date(Date.now() - days * DAY_MS) } };
  const matrix = queryString(query, 'matrix');
  if (matrix !== undefined) {
    if (!MATRIX_KEYS.includes(/** @type {any} */ (matrix)))
      throw badRequest(`matrix must be one of: ${MATRIX_KEYS.join(', ')}.`, 'matrix');
    filter.matrix = matrix;
  }
  return filter;
}

// GET /api/escalations?days=&matrix=&page=&limit= — the escalation log, newest first
escalationsRouter.get('/', async (req, res) => {
  const lq = parseListQuery(req.query, { sortFields: ['at'], defaultSort: '-at' });
  res.json(await paginate(Escalation, filterOf(req.query), lq, serializeEscalation));
});

// GET /api/escalations/export.csv?days=&matrix=
escalationsRouter.get('/export.csv', async (req, res) => {
  const rows = await Escalation.find(filterOf(req.query)).sort({ at: -1 }).limit(EXPORT_CAP).lean();
  const lines = [
    csvRow(['Date & time', 'Module', 'Gate', 'Item', 'Escalation', 'Sent to', 'People', 'Note']),
    ...rows.map((e) =>
      csvRow([
        formatDateTime(e.at),
        MATRICES[/** @type {keyof typeof MATRICES} */ (e.matrix)]?.title ?? e.matrix,
        e.site ?? '',
        e.item,
        [e.title, e.label].filter(Boolean).join(' · '),
        e.targetName,
        (e.recipients ?? []).map((r) => r.name).join(', '),
        e.note ?? '',
      ]),
    ),
  ];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="gatebook-escalations.csv"');
  res.setHeader('Cache-Control', 'no-store');
  res.send(`${BOM}${lines.join('\r\n')}\r\n`);
});
