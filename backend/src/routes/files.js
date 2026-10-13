import fs from 'node:fs/promises';
import { Router } from 'express';
import { forbidden, notFound } from '../middleware/error.js';
import { resolveStoredFile } from '../services/images.js';
import { verifyFileSignature } from '../services/signing.js';

export const filesRouter = Router();

// GET /api/files/:name?exp=&sig= — no auth header; the HMAC signature is the credential.
filesRouter.get('/:name', async (req, res) => {
  const name = String(req.params.name);
  if (!verifyFileSignature(name, req.query.exp, req.query.sig)) {
    throw forbidden('This photo link is invalid or has expired. Reload to get a fresh one.');
  }
  // Only well-formed stored names resolve to a path inside UPLOAD_DIR (no traversal).
  const full = resolveStoredFile(name);
  if (!full) throw notFound('File not found.');
  let data;
  try {
    data = await fs.readFile(full);
  } catch {
    throw notFound('File not found.');
  }
  const maxAge = Math.max(0, Number(req.query.exp) - Math.floor(Date.now() / 1000));
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', `private, max-age=${maxAge}, immutable`);
  res.send(data);
});
