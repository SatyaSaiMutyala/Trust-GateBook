import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import FormHelperText from '@mui/material/FormHelperText';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { errorMessage } from '../../api/client';
import { useAuth, useUser } from '../../auth/context';
import { isAdmin, isEmployee, ROLE_LABEL } from '../../auth/roles';
import { PageHeader, Panel } from '../../components/bits';
import { useSettings, useToast } from '../../state/context';
import { ListPanel } from './ListPanel';
import { MyDetailsPanel } from './MyDetailsPanel';
import { UsersPanel } from './UsersPanel';

function OverstayPanel({ hours, editable, onSave }) {
  const [value, setValue] = useState(String(hours));
  const [synced, setSynced] = useState(hours);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  if (hours !== synced) {
    setSynced(hours);
    setValue(String(hours));
  }
  const save = async (e) => {
    e.preventDefault();
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1 || n > 24) {
      setError('Enter whole hours from 1 to 24.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(n);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel title="Overstay alert">
      <Typography variant="body2" sx={{ color: 'text.secondary', mt: -0.5, mb: 1.5 }}>
        Visitors inside longer than this are flagged amber in Inside now and listed under Needs attention.
      </Typography>
      <Stack component="form" onSubmit={save} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <TextField
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={!editable}
          error={!!error}
          sx={{ maxWidth: 120 }}
          slotProps={{ htmlInput: { min: 1, max: 24, 'aria-label': 'Overstay hours' } }}
        />
        <Typography sx={{ fontWeight: 600 }}>hours</Typography>
        {editable ? (
          <Button type="submit" variant="contained" color="primary" disabled={busy || value === String(hours)}>
            Save
          </Button>
        ) : null}
      </Stack>
      {error ? <FormHelperText error>{error}</FormHelperText> : null}
    </Panel>
  );
}

export function SettingsPage() {
  const user = useUser();
  const { logout } = useAuth();
  const { settings, error, reload, save } = useSettings();
  const toast = useToast();
  const admin = isAdmin(user);

  const saveField = (key, label) => async (value) => {
    await save({ ...settings, [key]: value });
    toast(`${label} saved`);
  };

  const signedIn = (
    <Panel title="Signed in">
      <Typography sx={{ fontWeight: 600 }}>
        {user.name} · {ROLE_LABEL[user.role] ?? user.role}
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
        {user.email}
      </Typography>
      <Button variant="outlined" onClick={logout}>
        Sign out
      </Button>
    </Panel>
  );

  // Employees: only their own details.
  if (isEmployee(user)) {
    return (
      <>
        <PageHeader eyebrow={user.name} title="My account" />
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 7, xl: 5 }}>
            <MyDetailsPanel />
          </Grid>
          <Grid size={{ xs: 12, md: 5, xl: 4 }}>{signedIn}</Grid>
        </Grid>
      </>
    );
  }

  return (
    <>
      <PageHeader eyebrow={admin ? 'Admin' : user.name} title="Settings" />
      {!admin ? (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Only admins can change these lists. Security staff see them in the check-in form.
        </Alert>
      ) : null}
      {error && !settings ? (
        <Alert severity="error" sx={{ mb: 2 }} action={<Button onClick={reload}>Retry</Button>}>
          {error}
        </Alert>
      ) : null}
      {!settings ? (
        !error ? (
          <Box sx={{ py: 6, display: 'grid', placeItems: 'center' }}>
            <CircularProgress />
          </Box>
        ) : null
      ) : (
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 6, xl: 4 }}>
            <MyDetailsPanel />
          </Grid>
          <Grid size={{ xs: 12, md: 6, xl: 4 }}>
            <ListPanel
              title="Departments"
              items={settings.departments}
              editable={admin}
              addLabel="Add a department"
              onSave={saveField('departments', 'Departments')}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 6, xl: 4 }}>
            <ListPanel
              title="Purposes"
              items={settings.purposes}
              editable={admin}
              addLabel="Add a purpose"
              onSave={saveField('purposes', 'Purposes')}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 6, xl: 4 }}>
            <ListPanel
              title="Types of post"
              description="The quick-pick buttons when security logs incoming post."
              items={settings.mailKinds ?? []}
              editable={admin}
              addLabel="Add a type"
              onSave={saveField('mailKinds', 'Types of post')}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 6, xl: 4 }}>
            <OverstayPanel
              hours={settings.overstayHours}
              editable={admin}
              onSave={saveField('overstayHours', 'Overstay alert')}
            />
          </Grid>
          {admin ? (
            <Grid size={{ xs: 12, xl: 8 }}>
              <UsersPanel />
            </Grid>
          ) : null}
          <Grid size={{ xs: 12, md: 6, xl: 4 }}>{signedIn}</Grid>
        </Grid>
      )}
    </>
  );
}
