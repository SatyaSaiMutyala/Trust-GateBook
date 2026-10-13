import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { errorMessage } from '../../api/client';
import { authApi } from '../../api/endpoints';
import { useAuth, useUser } from '../../auth/context';
import { isRecipient } from '../../auth/roles';
import { Panel } from '../../components/bits';
import { useSettings, useToast } from '../../state/context';
import { fonts } from '../../theme/tokens';

/** Own profile: mobile for everyone; department + location for post recipients. PATCH /api/auth/me. */
export function MyDetailsPanel() {
  const user = useUser();
  const { updateUser } = useAuth();
  const { settings } = useSettings();
  const toast = useToast();
  const recipient = isRecipient(user);
  const initial = { phone: user.phone ?? '', dept: user.dept ?? '', location: user.location ?? '' };
  const [form, setForm] = useState(initial);
  const [error, setError] = useState(null);
  const [field, setField] = useState(null);
  const [busy, setBusy] = useState(false);
  const dirty = Object.keys(initial).some((k) => form[k] !== initial[k]);
  const departments = settings?.departments ?? [];
  const deptOptions = form.dept && !departments.includes(form.dept) ? [...departments, form.dept] : departments;

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setField(null);
    try {
      const patch = recipient
        ? { phone: form.phone.trim(), dept: form.dept, location: form.location.trim() }
        : { phone: form.phone.trim() };
      const u = await authApi.updateMe(patch);
      updateUser(u);
      setForm({ phone: u.phone ?? '', dept: u.dept ?? '', location: u.location ?? '' });
      toast('Your details are saved');
    } catch (err) {
      setError(errorMessage(err));
      setField(err?.field ?? null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="My details">
      <Typography variant="body2" sx={{ color: 'text.secondary', mt: -0.5, mb: 2 }}>
        Security sees your phone number when they need to call you.
      </Typography>
      <Grid container spacing={1.5} component="form" onSubmit={save} noValidate>
        <Grid size={{ xs: 12, sm: recipient ? 6 : 12 }}>
          <TextField
            label="Mobile number"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value.replace(/[^\d+ ]/g, '').slice(0, 16) }))}
            error={field === 'phone'}
            slotProps={{ htmlInput: { inputMode: 'tel', style: { fontFamily: fonts.mono } } }}
          />
        </Grid>
        {recipient ? (
          <>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                select
                label="Department"
                value={form.dept}
                onChange={(e) => setForm((f) => ({ ...f, dept: e.target.value }))}
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
            <Grid size={12}>
              <TextField
                label="Where visitors should go"
                placeholder="e.g. 2nd floor, cabin 3"
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                error={field === 'location'}
              />
            </Grid>
          </>
        ) : null}
        {error ? (
          <Grid size={12}>
            <Alert severity="error">{error}</Alert>
          </Grid>
        ) : null}
        <Grid size={12} sx={{ textAlign: 'right' }}>
          <Button type="submit" variant="contained" color="primary" disabled={busy || !dirty}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </Grid>
      </Grid>
    </Panel>
  );
}
