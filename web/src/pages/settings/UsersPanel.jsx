import SearchIcon from '@mui/icons-material/Search';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TablePagination from '@mui/material/TablePagination';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMemo, useState } from 'react';
import { errorMessage } from '../../api/client';
import { usersApi } from '../../api/endpoints';
import { useUser } from '../../auth/context';
import { ROLE_LABEL, ROLES } from '../../auth/roles';
import { Panel } from '../../components/bits';
import { usePaginatedQuery } from '../../hooks/usePaginatedQuery';
import { PAGE_SIZES, useUrlListParams } from '../../hooks/useUrlListParams';
import { useSettings, useToast } from '../../state/context';
import { fonts } from '../../theme/tokens';
import { defaultsFor } from '../../utils/modules';
import { HierarchyFields, ModuleMatrix, ModulesChip } from './AccessFields';

/** Reports to / designation / supervisor, then the module matrix. */
function AccessSection({ form, setForm, org, defs, selfId, designations }) {
  const setValue = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <>
      <HierarchyFields form={form} setValue={setValue} org={org} selfId={selfId} designations={designations} />
      <Grid size={12}>
        <Typography sx={{ fontWeight: 600, mb: 0.75 }}>Modules this person can use</Typography>
        <ModuleMatrix
          role={form.role}
          value={form.modules ?? []}
          onChange={(m) => setValue('modules', m)}
          defs={defs}
        />
      </Grid>
    </>
  );
}

const DEFAULTS = { q: '', role: '', active: '', sort: 'name', page: 1, limit: 10 };

/**
 * Admin-only user management, paginated through `u.*` URL params. `org` (everyone, for reports-to) and `defs` (the
 * module registry) come from Settings → Accounts & hierarchy; `onChanged` refreshes the org chart there.
 */
export function UsersPanel({ org = [], defs = [], onChanged = () => {} }) {
  const me = useUser();
  const toast = useToast();
  const { params, setParams, search, setSearch, setPage, setLimit } = useUrlListParams(DEFAULTS, { prefix: 'u.' });
  const query = useMemo(
    () => ({
      q: params.q || undefined,
      role: params.role || undefined,
      active: params.active || undefined,
      sort: params.sort,
      page: params.page,
      limit: params.limit,
    }),
    [params.q, params.role, params.active, params.sort, params.page, params.limit],
  );
  const list = usePaginatedQuery(usersApi.list, query);
  const [editing, setEditing] = useState(null);

  const change = async (u, patch, message) => {
    try {
      const updated = await usersApi.update(u.id, patch);
      list.patch(updated);
      onChanged();
      toast(message ?? `${updated.name} updated`);
    } catch (err) {
      toast(errorMessage(err));
    }
  };

  return (
    <Panel title="Users">
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or email"
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              },
              htmlInput: { type: 'search', 'aria-label': 'Search users' },
            }}
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <TextField
            select
            value={params.role}
            onChange={(e) => setParams({ role: e.target.value })}
            slotProps={{ htmlInput: { 'aria-label': 'Role' } }}
          >
            <MenuItem value="">All roles</MenuItem>
            {ROLES.map((r) => (
              <MenuItem key={r} value={r}>
                {ROLE_LABEL[r]}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <TextField
            select
            value={params.active}
            onChange={(e) => setParams({ active: e.target.value })}
            slotProps={{ htmlInput: { 'aria-label': 'Status' } }}
          >
            <MenuItem value="">Any status</MenuItem>
            <MenuItem value="true">Active</MenuItem>
            <MenuItem value="false">Deactivated</MenuItem>
          </TextField>
        </Grid>
      </Grid>

      {list.error ? (
        <Alert severity="error" sx={{ mb: 1.5 }}>
          {list.error}
        </Alert>
      ) : null}

      <Stack
        divider={<Divider flexItem />}
        sx={{ border: 1, borderColor: 'divider', borderRadius: 1, opacity: list.loading ? 0.6 : 1 }}
      >
        {list.data.length === 0 && !list.loading ? (
          <Typography sx={{ p: 2, color: 'text.secondary' }}>No users match.</Typography>
        ) : null}
        {list.data.map((u) => (
          <Grid key={u.id} container spacing={1.5} sx={{ p: 1.5, alignItems: 'center' }}>
            <Grid size={{ xs: 12, sm: 5 }} sx={{ minWidth: 0 }}>
              <Stack direction="row" sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 0.75 }}>
                <Typography sx={{ fontWeight: 600 }}>{u.name}</Typography>
                {u.id === me.id ? <Chip size="small" label="You" variant="exited" /> : null}
                {u.role === 'host' ? <Chip size="small" label="Employee" variant="pending" /> : null}
                {u.role !== 'host' && u.isHost ? <Chip size="small" label="Receives post" variant="pending" /> : null}
                {u.role !== 'admin' && u.role !== 'viewer' && u.canPreRegister === false ? (
                  <Chip size="small" label="No pre-register" variant="exited" />
                ) : null}
                {u.isSupervisor ? <Chip size="small" label="Gate supervisor" variant="inside" /> : null}
                {!u.active ? <Chip size="small" label="Deactivated" variant="overstay" /> : null}
                <ModulesChip user={u} defs={defs} />
              </Stack>
              <Typography sx={{ fontFamily: fonts.mono, fontSize: 12.5, color: 'text.secondary' }} noWrap>
                {u.email}
                {u.phone ? ` · ${u.phone}` : ''}
              </Typography>
              {u.designation || u.dept || u.location ? (
                <Typography variant="body2" sx={{ color: 'text.secondary' }} noWrap>
                  {[u.designation, u.dept, u.location].filter(Boolean).join(' · ')}
                </Typography>
              ) : null}
              {u.reportsTo ? (
                <Typography variant="body2" sx={{ color: 'text.secondary' }} noWrap>
                  Reports to {org.find((x) => x.id === u.reportsTo)?.name ?? '—'}
                </Typography>
              ) : null}
            </Grid>
            <Grid size={{ xs: 12, sm: 3 }}>
              <TextField
                select
                size="small"
                value={u.role}
                disabled={u.id === me.id}
                onChange={(e) => change(u, { role: e.target.value }, `${u.name} is now ${ROLE_LABEL[e.target.value]}`)}
                slotProps={{ htmlInput: { 'aria-label': `Role for ${u.name}` } }}
              >
                {ROLES.map((r) => (
                  <MenuItem key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 6, sm: 2 }}>
              <Button
                variant="outlined"
                size="small"
                onClick={() => setEditing(u)}
                sx={{ minHeight: 40, width: '100%' }}
              >
                Edit
              </Button>
            </Grid>
            <Grid size={{ xs: 6, sm: 2 }}>
              <Button
                variant="outlined"
                size="small"
                disabled={u.id === me.id}
                onClick={() =>
                  change(u, { active: !u.active }, `${u.name} ${u.active ? 'deactivated' : 'reactivated'}`)
                }
                sx={{ minHeight: 40, width: '100%' }}
              >
                {u.active ? 'Deactivate' : 'Reactivate'}
              </Button>
            </Grid>
          </Grid>
        ))}
      </Stack>
      <TablePagination
        component="div"
        count={list.pagination.total}
        page={Math.max(0, Math.min(params.page - 1, Math.max(0, list.pagination.totalPages - 1)))}
        onPageChange={(_, p) => setPage(p + 1)}
        rowsPerPage={params.limit}
        rowsPerPageOptions={PAGE_SIZES}
        onRowsPerPageChange={(e) => setLimit(Number(e.target.value))}
      />

      <EditUserDialog
        user={editing}
        org={org}
        defs={defs}
        onClose={() => setEditing(null)}
        onSaved={(u) => {
          list.patch(u);
          setEditing(null);
          onChanged();
          toast(`${u.name} updated`);
        }}
      />

      <Divider sx={{ my: 2 }} />
      <AddUserForm
        org={org}
        defs={defs}
        onCreated={(u) => {
          toast(`${u.name} added as ${ROLE_LABEL[u.role]}`);
          list.refresh();
          onChanged();
        }}
      />
    </Panel>
  );
}

/** Mobile / Department / Location / "Can also receive post" fields shared by add + edit. */
function ProfileFields({ form, set, field, departments }) {
  const deptOptions = form.dept && !departments.includes(form.dept) ? [...departments, form.dept] : departments;
  return (
    <>
      <Grid size={{ xs: 12, sm: 6 }}>
        <TextField
          label="Mobile"
          value={form.phone}
          onChange={set('phone')}
          error={field === 'phone'}
          slotProps={{ htmlInput: { inputMode: 'tel', style: { fontFamily: fonts.mono } } }}
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 6 }}>
        <TextField
          select
          label="Department"
          value={form.dept}
          onChange={set('dept')}
          error={field === 'dept'}
          slotProps={{ select: { displayEmpty: true } }}
        >
          <MenuItem value="">
            <em>Not set</em>
          </MenuItem>
          {deptOptions.map((d) => (
            <MenuItem key={d} value={d}>
              {d}
            </MenuItem>
          ))}
        </TextField>
      </Grid>
      <Grid size={{ xs: 12, sm: form.role === 'host' ? 12 : 6 }}>
        <TextField
          label="Location"
          placeholder="e.g. 2nd floor, cabin 3"
          value={form.location}
          onChange={set('location')}
          error={field === 'location'}
        />
      </Grid>
      {form.role !== 'host' ? (
        <Grid size={{ xs: 12, sm: 6 }} sx={{ display: 'flex', alignItems: 'flex-end' }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={form.isHost}
                onChange={(e) => set('isHost')({ target: { value: e.target.checked } })}
              />
            }
            label="Can also receive post"
          />
        </Grid>
      ) : null}
      {form.role === 'host' || form.role === 'security' ? (
        <Grid size={{ xs: 12, sm: 6 }} sx={{ display: 'flex', alignItems: 'flex-end' }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={form.canPreRegister}
                onChange={(e) => set('canPreRegister')({ target: { value: e.target.checked } })}
              />
            }
            label="Can pre-register visitors"
          />
        </Grid>
      ) : null}
    </>
  );
}

function EditUserDialog({ user, org, defs, onClose, onSaved }) {
  return (
    <Dialog open={!!user} onClose={onClose} fullWidth maxWidth="md">
      {user ? (
        <EditUserForm key={user.id} user={user} org={org} defs={defs} onClose={onClose} onSaved={onSaved} />
      ) : null}
    </Dialog>
  );
}

function EditUserForm({ user, org, defs, onClose, onSaved }) {
  const { settings } = useSettings();
  const [form, setForm] = useState({
    name: user.name,
    role: user.role,
    phone: user.phone ?? '',
    dept: user.dept ?? '',
    location: user.location ?? '',
    isHost: !!user.isHost,
    canPreRegister: user.canPreRegister !== false,
    password: '',
    modules: Array.isArray(user.modules) ? user.modules : defaultsFor(defs, user.role),
    reportsTo: user.reportsTo ?? null,
    designation: user.designation ?? '',
    isSupervisor: !!user.isSupervisor,
    site: user.site ?? '',
  });
  const [error, setError] = useState(null);
  const [field, setField] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setField('name');
      setError('Fill the highlighted fields.');
      return;
    }
    setBusy(true);
    setError(null);
    setField(null);
    try {
      const patch = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        dept: form.dept,
        location: form.location.trim(),
        isHost: user.role === 'host' ? true : form.isHost,
        canPreRegister: form.canPreRegister,
        reportsTo: form.reportsTo,
        designation: form.designation.trim(),
        isSupervisor: user.role !== 'host' && form.isSupervisor,
        site: form.site ?? '',
        ...(user.role !== 'admin' ? { modules: form.modules } : {}),
      };
      if (form.password) patch.password = form.password;
      onSaved(await usersApi.update(user.id, patch));
    } catch (err) {
      setError(errorMessage(err));
      setField(err?.field ?? null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box component="form" onSubmit={submit} noValidate sx={{ p: { xs: 2, md: 3 } }}>
      <Typography variant="eyebrow" sx={{ color: 'text.secondary' }}>
        {ROLE_LABEL[user.role]} · {user.email}
      </Typography>
      <Typography variant="h2" sx={{ mb: 2 }}>
        Edit user
      </Typography>
      <Grid container spacing={1.5}>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField label="Name" value={form.name} onChange={set('name')} error={field === 'name'} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            label="New password"
            type="password"
            autoComplete="new-password"
            placeholder="Leave blank to keep"
            value={form.password}
            onChange={set('password')}
            error={field === 'password'}
          />
        </Grid>
        <ProfileFields form={form} set={set} field={field} departments={settings?.departments ?? []} />
        <AccessSection
          form={form}
          setForm={setForm}
          org={org}
          defs={defs}
          selfId={user.id}
          designations={settings?.designations ?? []}
        />
        {error ? (
          <Grid size={12}>
            <Alert severity="error">{error}</Alert>
          </Grid>
        ) : null}
        <Grid size={12}>
          <Stack direction="row" spacing={1.5} sx={{ justifyContent: 'flex-end' }}>
            <Button variant="outlined" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" color="primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </Stack>
        </Grid>
      </Grid>
    </Box>
  );
}

const EMPTY_USER = {
  name: '',
  email: '',
  password: '',
  role: 'security',
  phone: '',
  dept: '',
  location: '',
  isHost: false,
  canPreRegister: true,
  reportsTo: null,
  designation: '',
  isSupervisor: false,
  site: '',
};

function AddUserForm({ org, defs, onCreated }) {
  const { settings } = useSettings();
  const empty = () => ({ ...EMPTY_USER, modules: defaultsFor(defs, EMPTY_USER.role) });
  const [form, setForm] = useState(empty);
  // The registry may arrive after the first render: start from the role defaults once it does.
  const [defsSeen, setDefsSeen] = useState(defs.length);
  if (defs.length !== defsSeen) {
    setDefsSeen(defs.length);
    setForm((f) => ({ ...f, modules: defaultsFor(defs, f.role) }));
  }
  const setRole = (e) => setForm((f) => ({ ...f, role: e.target.value, modules: defaultsFor(defs, e.target.value) }));
  const [error, setError] = useState(null);
  const [field, setField] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setField(null);
    const missing = ['name', 'email', 'password'].find((k) => !form[k].trim());
    if (missing) {
      setField(missing);
      setError('Fill the highlighted fields.');
      return;
    }
    setBusy(true);
    try {
      const u = await usersApi.create({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        role: form.role,
        phone: form.phone.trim() || undefined,
        dept: form.dept || undefined,
        location: form.location.trim() || undefined,
        isHost: form.role === 'host' ? true : form.isHost,
        canPreRegister: form.canPreRegister,
        reportsTo: form.reportsTo,
        designation: form.designation.trim() || undefined,
        isSupervisor: form.role !== 'host' && form.isSupervisor,
        site: form.site || undefined,
        ...(form.role !== 'admin' ? { modules: form.modules } : {}),
      });
      setForm(empty());
      onCreated(u);
    } catch (err) {
      setError(errorMessage(err));
      setField(err?.field ?? null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box component="form" onSubmit={submit} noValidate>
      <Typography variant="h5" sx={{ mb: 1.5 }}>
        Add user
      </Typography>
      <Grid container spacing={1.5}>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField label="Name" value={form.name} onChange={set('name')} error={field === 'name'} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField label="Email" type="email" value={form.email} onChange={set('email')} error={field === 'email'} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            label="Password"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={set('password')}
            error={field === 'password'}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField select label="Role" value={form.role} onChange={setRole} error={field === 'role'}>
            {ROLES.map((r) => (
              <MenuItem key={r} value={r}>
                {ROLE_LABEL[r]}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <ProfileFields form={form} set={set} field={field} departments={settings?.departments ?? []} />
        <AccessSection
          form={form}
          setForm={setForm}
          org={org}
          defs={defs}
          selfId={null}
          designations={settings?.designations ?? []}
        />
        {error ? (
          <Grid size={12}>
            <Alert severity="error">{error}</Alert>
          </Grid>
        ) : null}
        <Grid size={12} sx={{ textAlign: 'right' }}>
          <Button type="submit" variant="contained" color="primary" disabled={busy}>
            {busy ? 'Adding…' : 'Add user'}
          </Button>
        </Grid>
      </Grid>
    </Box>
  );
}
