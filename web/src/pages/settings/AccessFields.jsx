import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { ROLE_LABEL } from '../../auth/roles';
import { useSettings } from '../../state/context';
import { chainText } from '../../utils/escalation';
import { defaultsFor, eligibleFor } from '../../utils/modules';

/** @typedef {import('../../types').ModuleDef} ModuleDef */
/** @typedef {import('../../types').OrgUser} OrgUser */

/**
 * "Modules this person can use": one row per module the role can be given, grouped by area, with a tick each.
 * Admins have everything; employees always keep My visitors.
 */
export function ModuleMatrix({ role, value, onChange, defs }) {
  if (role === 'admin') {
    return (
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        Admins have every module and Settings.
      </Typography>
    );
  }
  const rows = eligibleFor(defs, role);
  const textOf = (/** @type {ModuleDef} */ d) => d.text[role] ?? d.text.security ?? [d.label, ''];
  const groups = [...new Set(rows.map((d) => d.group))];
  const ticked = rows.filter((d) => value.includes(d.key)).length;
  const toggle = (/** @type {string} */ k, /** @type {boolean} */ on) =>
    onChange(on ? rows.map((d) => d.key).filter((x) => x === k || value.includes(x)) : value.filter((x) => x !== k));
  return (
    <Box>
      <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflowX: 'auto' }}>
        <Table size="small" aria-label="Modules this person can use">
          <TableHead>
            <TableRow>
              <TableCell>Area</TableCell>
              <TableCell>Module</TableCell>
              <TableCell>What they can do</TableCell>
              <TableCell align="center">Access</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {role === 'host' ? (
              <TableRow>
                <TableCell>For me</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>My visitors</TableCell>
                <TableCell>Accept or decline their visitors. Always on.</TableCell>
                <TableCell align="center">
                  <Checkbox checked disabled slotProps={{ input: { 'aria-label': 'My visitors (always on)' } }} />
                </TableCell>
              </TableRow>
            ) : null}
            {groups.flatMap((g) =>
              rows
                .filter((d) => d.group === g)
                .map((d, i, inGroup) => {
                  const [name, what] = textOf(d);
                  const on = value.includes(d.key);
                  return (
                    <TableRow key={d.key} selected={on}>
                      {i === 0 ? <TableCell rowSpan={inGroup.length}>{g}</TableCell> : null}
                      <TableCell sx={{ fontWeight: 600 }}>{name}</TableCell>
                      <TableCell>{what}</TableCell>
                      <TableCell align="center">
                        <Checkbox
                          checked={on}
                          onChange={(e) => toggle(d.key, e.target.checked)}
                          slotProps={{ input: { 'aria-label': name } }}
                        />
                      </TableCell>
                    </TableRow>
                  );
                }),
            )}
          </TableBody>
        </Table>
      </Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1, alignItems: { sm: 'center' } }}>
        <Typography variant="body2" sx={{ color: 'text.secondary', flex: 1 }}>
          {ticked} of {rows.length} ticked.{' '}
          {role === 'host'
            ? 'Accepting their own visitors and confirming their own post always works.'
            : 'Unticked modules are hidden and refused by the server; escalations for them go to guards who have them.'}
        </Typography>
        <Stack direction="row" spacing={0.5}>
          <Button size="small" onClick={() => onChange(rows.map((d) => d.key))}>
            Tick all
          </Button>
          <Button size="small" onClick={() => onChange(defaultsFor(defs, role))}>
            Role defaults
          </Button>
          <Button size="small" onClick={() => onChange([])}>
            Untick all
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}

/** Users list "Modules" chip: All / All N / x of N / 0 of N. @param {{ user: import('../../types').User, defs: ModuleDef[] }} p */
export function ModulesChip({ user, defs }) {
  if (user.role === 'admin') return <Chip size="small" label="All modules" variant="inside" />;
  const rows = eligibleFor(defs, user.role);
  if (!rows.length || !Array.isArray(user.modules)) return null;
  const on = rows.filter((d) => user.modules.includes(d.key));
  const off = rows.filter((d) => !user.modules.includes(d.key));
  const label = off.length === 0 ? `All ${rows.length} modules` : `${on.length} of ${rows.length} modules`;
  const variant = off.length === 0 ? 'inside' : on.length === 0 ? 'issue' : 'pending';
  const nameOf = (/** @type {ModuleDef} */ d) => (d.text[user.role] ?? d.text.security ?? [d.label])[0];
  return (
    <Tooltip title={off.length ? `Not: ${off.map(nameOf).join(', ')}` : on.map(nameOf).join(', ')}>
      <Chip size="small" label={label} variant={variant} />
    </Tooltip>
  );
}

/**
 * Reports to (escalation level 1), designation and "Gate supervisor".
 * `form` has reportsTo, designation, isSupervisor, role; `selfId` excludes the person from the managers list.
 */
export function HierarchyFields({ form, setValue, org, selfId, designations }) {
  const { settings } = useSettings();
  const sites = settings?.sites ?? [];
  const managers = org.filter((u) => u.active && u.id !== selfId).sort((a, b) => a.name.localeCompare(b.name));
  // The chain this person's escalations would follow with the manager picked here.
  const preview = selfId
    ? chainText(
        org.map((u) => (u.id === selfId ? { ...u, reportsTo: form.reportsTo || null } : u)),
        selfId,
      )
    : chainText(
        [
          ...org,
          {
            id: '__new',
            name: '',
            role: form.role,
            designation: '',
            dept: '',
            location: '',
            reportsTo: form.reportsTo || null,
            isSupervisor: false,
            active: true,
          },
        ],
        '__new',
      );
  return (
    <>
      <Grid size={{ xs: 12, sm: 6 }}>
        <TextField
          select
          label="Reports to (escalation level 1)"
          value={form.reportsTo ?? ''}
          onChange={(e) => setValue('reportsTo', e.target.value || null)}
          slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
          helperText={
            form.reportsTo ? `Escalations go: ${preview}` : 'Escalations for this person go straight to admin.'
          }
        >
          <MenuItem value="">
            <em>Nobody (top of the chain)</em>
          </MenuItem>
          {managers.map((m) => (
            <MenuItem key={m.id} value={m.id}>
              {m.name}
              {m.designation ? ` · ${m.designation}` : ` · ${ROLE_LABEL[m.role] ?? m.role}`}
            </MenuItem>
          ))}
        </TextField>
      </Grid>
      <Grid size={{ xs: 12, sm: 6 }}>
        <Autocomplete
          freeSolo
          options={designations}
          value={form.designation}
          onInputChange={(_, v) => setValue('designation', v)}
          renderInput={(params) => <TextField {...params} label="Designation" placeholder="e.g. Security guard" />}
        />
      </Grid>
      {form.role !== 'host' && sites.length > 1 ? (
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            select
            label="Gate"
            value={form.site ?? ''}
            onChange={(e) => setValue('site', e.target.value)}
            slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
            helperText="Their device starts on this gate. Escalations for a gate go to its guards (and those at all gates)."
          >
            <MenuItem value="">All gates</MenuItem>
            {sites.map((s) => (
              <MenuItem key={s} value={s}>
                {s}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
      ) : null}
      {form.role !== 'host' ? (
        <Grid size={12}>
          <FormControlLabel
            control={
              <Checkbox checked={!!form.isSupervisor} onChange={(e) => setValue('isSupervisor', e.target.checked)} />
            }
            label="Gate supervisor (gets “Gate supervisors” escalation steps)"
          />
        </Grid>
      ) : null}
    </>
  );
}
