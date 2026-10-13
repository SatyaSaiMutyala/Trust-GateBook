import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { emitSettingsUpdated } from '../realtime.js';
import { getSettings, saveSettings } from '../services/settings.js';

/** A non-empty list of unique (case-insensitive), trimmed, non-empty strings. @param {string} label */
function list(label) {
  return z
    .array(z.string({ error: `${label} must be text.` }).trim().min(1, `${label} cannot be empty.`).max(80, `${label} is too long.`), {
      error: `${label} must be a list.`,
    })
    .min(1, 'Keep at least one.')
    .max(100, 'Too many entries.')
    .superRefine((items, ctx) => {
      const seen = new Set();
      for (const item of items) {
        const key = item.toLowerCase();
        if (seen.has(key)) {
          ctx.addIssue({ code: 'custom', message: `"${item}" is listed twice.` });
          return;
        }
        seen.add(key);
      }
    });
}

const HOURS_MSG = 'Overstay hours must be a whole number from 1 to 24.';
const settingsSchema = z.object({
  sites: list('Gate name'),
  departments: list('Department'),
  purposes: list('Purpose'),
  // Optional so clients that predate the post room can still save; omitted = keep the current list.
  mailKinds: list('Type of post').optional(),
  overstayHours: z.number({ error: HOURS_MSG }).int(HOURS_MSG).min(1, HOURS_MSG).max(24, HOURS_MSG),
});

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

settingsRouter.get('/', async (_req, res) => {
  res.json({ settings: await getSettings() });
});

settingsRouter.put('/', requireRole('admin'), async (req, res) => {
  const body = settingsSchema.parse(req.body ?? {});
  const current = await getSettings();
  const settings = await saveSettings({ ...body, mailKinds: body.mailKinds ?? current.mailKinds });
  emitSettingsUpdated(settings);
  res.json({ settings });
});
