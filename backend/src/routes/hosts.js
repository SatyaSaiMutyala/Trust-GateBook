import { Router } from 'express';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { RECIPIENT_FILTER, User, serializeHost } from '../models/User.js';
import { paginate, parseListQuery, queryString, searchFilter } from '../services/pagination.js';
import { listPaceHosts, paceEnabled } from '../services/pace.js';

export const hostsRouter = Router();
hostsRouter.use(requireAuth);

// GET /api/hosts — paginated employee directory; q, dept, page, limit; sort name.
// Source: the Pace HR API (PACE_EMPLOYEES_URL), or local host / isHost users when Pace is disabled.
hostsRouter.get('/', async (req, res) => {
  const lq = parseListQuery(req.query, { sortFields: ['name'], defaultSort: 'name' });
  const me = currentUser(req);
  // Phone numbers are for security to call people; employees and viewers don't get them.
  const withPhone = me.role === 'admin' || me.role === 'security';
  const dept = queryString(req.query, 'dept');

  if (paceEnabled()) {
    res.json(await listPaceHosts({ page: lq.page, limit: lq.limit, q: lq.q, dept }, withPhone));
    return;
  }

  const and = [RECIPIENT_FILTER];
  const search = searchFilter(lq.q, ['name', 'dept']);
  if (search.$or) and.push(search);
  /** @type {Record<string, unknown>} */
  const filter = { $and: and };
  if (dept) filter.dept = dept;
  res.json(await paginate(User, filter, lq, (u) => serializeHost(u, withPhone)));
});
