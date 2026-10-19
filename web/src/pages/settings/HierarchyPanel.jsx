import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { ROLE_LABEL } from '../../auth/roles';
import { Panel } from '../../components/bits';
import { chainText } from '../../utils/escalation';

/** @typedef {import('../../types').OrgUser} OrgUser */

const LEVEL_STRIP = [
  'Guard / employee',
  'Level 1 · Supervisor / manager',
  'Level 2 · Security manager / dept head',
  'Level 3',
  'Admin',
];

/** @param {OrgUser} u */
const subLine = (u) =>
  [u.designation || ROLE_LABEL[u.role], u.role === 'host' ? u.dept : '', u.isSupervisor ? 'gate supervisor' : '']
    .filter(Boolean)
    .join(' · ');

/** One person and the people who report to them. */
function Node({ user, childrenOf, depth, onOpen }) {
  const kids = depth < 8 ? childrenOf(user.id) : [];
  return (
    <Box component="li" sx={{ listStyle: 'none' }}>
      <ButtonBase
        onClick={() => onOpen(user.id)}
        sx={{
          display: 'block',
          textAlign: 'left',
          borderRadius: 1,
          px: 1,
          py: 0.5,
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        <Typography sx={{ fontWeight: 600 }}>{user.name}</Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {subLine(user)}
        </Typography>
      </ButtonBase>
      {kids.length ? (
        <Box component="ul" sx={{ pl: 2, ml: 1.5, my: 0.5, borderLeft: 2, borderColor: 'divider' }}>
          {kids.map((k) => (
            <Node key={k.id} user={k} childrenOf={childrenOf} depth={depth + 1} onOpen={onOpen} />
          ))}
        </Box>
      ) : null}
    </Box>
  );
}

/**
 * Settings → Accounts & hierarchy: how escalation follows the reporting lines, the org chart and each person's
 * escalation chain. `onOpen(id)` opens the person in the users list.
 */
export function HierarchyPanel({ org, onOpen }) {
  const active = org.filter((u) => u.active);
  const ids = new Set(active.map((u) => u.id));
  const byName = (/** @type {OrgUser} */ a, /** @type {OrgUser} */ b) => a.name.localeCompare(b.name);
  const roots = active
    .filter((u) => !u.reportsTo || !ids.has(u.reportsTo))
    .sort((a, b) => ((a.role === 'admin') === (b.role === 'admin') ? byName(a, b) : a.role === 'admin' ? -1 : 1));
  const childrenOf = (/** @type {string} */ id) => active.filter((u) => u.reportsTo === id).sort(byName);
  const managers = new Set(active.map((u) => u.reportsTo).filter(Boolean));
  const loose = active.filter((u) => u.role === 'security' && !u.reportsTo && !u.isSupervisor && !managers.has(u.id));

  return (
    <Stack spacing={2}>
      <Panel title="How escalation follows the hierarchy">
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: -0.5, mb: 1.5 }}>
          Set who each person reports to. Every escalation matrix can then send a step to the person concerned, to{' '}
          <b>Level 1</b> (their manager), <b>Level 2</b> (the manager’s manager) or <b>Level 3</b>, as well as to guards
          on duty, gate supervisors, admins or one named person. If nobody is set at a level, the step goes to admin.
        </Typography>
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75, alignItems: 'center' }}>
          {LEVEL_STRIP.map((l, i) => (
            <Stack key={l} direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
              {i ? <Typography sx={{ color: 'text.secondary' }}>→</Typography> : null}
              <Chip size="small" label={l} variant={i === LEVEL_STRIP.length - 1 ? 'pending' : 'exited'} />
            </Stack>
          ))}
        </Stack>
        {loose.length ? (
          <Alert severity="warning" sx={{ mt: 1.5 }}>
            {loose.length} {loose.length === 1 ? 'guard has' : 'guards have'} no supervisor set:{' '}
            {loose.map((u) => u.name).join(', ')}. Their Level 1 escalations go to admin.
          </Alert>
        ) : null}
      </Panel>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Panel title="Reporting hierarchy">
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: -0.5, mb: 1 }}>
              Tap a person to change who they report to.
            </Typography>
            {roots.length === 0 ? (
              <Typography variant="body2">No one yet.</Typography>
            ) : (
              <Box component="ul" sx={{ p: 0, m: 0 }}>
                {roots.map((r) => (
                  <Node key={r.id} user={r} childrenOf={childrenOf} depth={0} onOpen={onOpen} />
                ))}
              </Box>
            )}
          </Panel>
        </Grid>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Panel title="Escalation chain per person">
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: -0.5, mb: 1 }}>
              Where an escalation about this person goes, level by level.
            </Typography>
            <Stack spacing={0.75}>
              {active
                .filter((u) => u.role !== 'admin')
                .sort(byName)
                .map((u) => (
                  <Box key={u.id}>
                    <Typography component="span" sx={{ fontWeight: 600 }}>
                      {u.name}
                    </Typography>
                    <Typography component="span" variant="body2" sx={{ color: 'text.secondary' }}>
                      {' '}
                      → {chainText(org, u.id)}
                    </Typography>
                  </Box>
                ))}
            </Stack>
          </Panel>
        </Grid>
      </Grid>
    </Stack>
  );
}
