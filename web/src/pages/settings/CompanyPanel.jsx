import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useRef, useState } from 'react';
import { errorMessage, fileUrl } from '../../api/client';
import { settingsApi } from '../../api/endpoints';
import { Panel } from '../../components/bits';
import { useSettings, useToast } from '../../state/context';

const LOGO_MAX = 1.5 * 1024 * 1024;

/** Logo preview on a light or dark background. */
function LogoBox({ url, dark }) {
  return (
    <Box
      sx={{
        flex: 1,
        height: 110,
        borderRadius: '10px',
        border: 1,
        borderColor: 'divider',
        bgcolor: dark ? '#13201B' : '#FFFFFF',
        display: 'grid',
        placeItems: 'center',
        p: 1.5,
      }}
    >
      {url ? (
        <Box
          component="img"
          src={fileUrl(url)}
          alt="Company logo"
          sx={{ maxWidth: '100%', maxHeight: 80, objectFit: 'contain' }}
        />
      ) : (
        <Typography variant="body2" sx={{ color: dark ? '#7E918A' : 'text.secondary' }}>
          No logo yet
        </Typography>
      )}
    </Box>
  );
}

function LogoPanel() {
  const { settings, setSettings } = useSettings();
  const toast = useToast();
  const input = useRef(/** @type {HTMLInputElement | null} */ (null));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const logo = settings.company?.logoUrl ?? null;

  /** @param {File} file */
  const upload = async (file) => {
    setError(null);
    if (!['image/png', 'image/jpeg'].includes(file.type)) return setError('Use a PNG or JPG image.');
    if (file.size > LOGO_MAX) return setError('Logo must be under 1.5 MB.');
    setBusy(true);
    try {
      setSettings(await settingsApi.uploadLogo(file));
      toast('Logo saved');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      setSettings(await settingsApi.removeLogo());
      toast('Logo removed');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Logo">
      <Typography variant="body2" sx={{ color: 'text.secondary', mt: -0.5, mb: 1.5 }}>
        Shown in the app header, on the sign-in page and on visitor passes. Use a PNG with a transparent background, or
        a JPG, under 1.5 MB.
      </Typography>
      <Stack direction="row" spacing={1.5} sx={{ mb: 1.5 }}>
        <LogoBox url={logo} />
        <LogoBox url={logo} dark />
      </Stack>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void upload(f);
        }}
      />
      <Stack direction="row" spacing={1}>
        <Button variant="contained" color="primary" disabled={busy} onClick={() => input.current?.click()}>
          {logo ? 'Replace logo' : 'Upload logo'}
        </Button>
        {logo ? (
          <Button color="error" disabled={busy} onClick={remove}>
            Remove logo
          </Button>
        ) : null}
      </Stack>
      {error ? (
        <Alert severity="error" sx={{ mt: 1.5 }}>
          {error}
        </Alert>
      ) : null}
    </Panel>
  );
}

const FIELDS = [
  ['name', 'Short name (shown in the app)', 60, 6],
  ['legalName', 'Registered name (on documents)', 160, 6],
  ['address', 'Address', 400, 12],
  ['phone', 'Phone', 40, 4],
  ['email', 'Email', 120, 4],
  ['website', 'Website', 160, 4],
  ['gstin', 'GSTIN', 20, 6],
  ['cin', 'CIN', 30, 6],
];

function DetailsPanel() {
  const { settings, save } = useSettings();
  const toast = useToast();
  const [form, setForm] = useState(() => ({ ...settings.company }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const changed = FIELDS.some(([k]) => (form[k] ?? '') !== (settings.company?.[k] ?? ''));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const company = Object.fromEntries(FIELDS.map(([k]) => [k, String(form[k] ?? '').trim()]));
      await save({ ...settings, company: { ...settings.company, ...company } });
      toast('Company details saved');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel title="Company details">
      <Typography variant="body2" sx={{ color: 'text.secondary', mt: -0.5, mb: 2 }}>
        The short name shows in the app header and on passes. The registered name and address are printed on documents.
      </Typography>
      <Box component="form" onSubmit={submit} noValidate>
        <Grid container spacing={1.5}>
          {FIELDS.map(([k, label, max, md]) => (
            <Grid key={k} size={{ xs: 12, md: /** @type {number} */ (md) }}>
              <TextField
                label={label}
                value={form[k] ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                multiline={k === 'address'}
                minRows={k === 'address' ? 2 : undefined}
                slotProps={{ htmlInput: { maxLength: max } }}
              />
            </Grid>
          ))}
        </Grid>
        {error ? (
          <Alert severity="error" sx={{ mt: 1.5 }}>
            {error}
          </Alert>
        ) : null}
        <Button type="submit" variant="contained" color="primary" sx={{ mt: 2 }} disabled={busy || !changed}>
          Save company details
        </Button>
      </Box>
    </Panel>
  );
}

/** Settings → Company: logo and company details (admins). */
export function CompanyPanel() {
  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, lg: 5 }}>
        <LogoPanel />
      </Grid>
      <Grid size={{ xs: 12, lg: 7 }}>
        <DetailsPanel />
      </Grid>
    </Grid>
  );
}
