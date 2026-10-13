import { Router } from 'express';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { RECIPIENT_FILTER, User, serializeHost } from '../models/User.js';
import { paginate, parseListQuery, queryString, searchFilter } from '../services/pagination.js';

export const hostsRouter = Router();
hostsRouter.use(requireAuth);

// GET /api/hosts — paginated directory of active post recipients; q over name/dept; filter dept; sort name
hostsRouter.get('/', async (req, res) => {
  const lq = parseListQuery(req.query, { sortFields: ['name'], defaultSort: 'name' });
  const me = currentUser(req);
  // Phone numbers are for security to call people; employees and viewers don't get them.
  const withPhone = me.role === 'admin' || me.role === 'security';
  const and = [RECIPIENT_FILTER];
  const search = searchFilter(lq.q, ['name', 'dept']);
  if (search.$or) and.push(search);
  const dept = queryString(req.query, 'dept');
  /** @type {Record<string, unknown>} */
  const filter = { $and: and };
  if (dept) filter.dept = dept;
  res.json(await paginate(User, filter, lq, (u) => serializeHost(u, withPhone)));
});
