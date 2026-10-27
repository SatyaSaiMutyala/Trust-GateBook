import { currentToken, tokenMatches } from '../services/provisioningToken.js';

/*
 * Guards /api/provisioning/* with the X-Provisioning-Token shared secret
 * (server-to-server from PACE; no JWT, no session).
 *   503 when no token is configured on this server (feature off).
 *   401 when the presented token is missing or wrong.
 * Responds directly in the app's { error: { code, message } } envelope.
 */

/** @type {import('express').RequestHandler} */
export const provisioningGuard = (req, res, next) => {
  if (!currentToken()) {
    res.status(503).json({ error: { code: 'upstream', message: 'Provisioning is not configured on this server.' } });
    return;
  }
  const presented = req.headers['x-provisioning-token'];
  if (!tokenMatches(Array.isArray(presented) ? presented[0] : presented)) {
    res.status(401).json({ error: { code: 'unauthorized', message: 'Invalid provisioning token.' } });
    return;
  }
  next();
};
