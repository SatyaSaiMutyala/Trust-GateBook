import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import { errorMessage } from '../../api/client';
import { termsApi } from '../../api/endpoints';
import { Panel } from '../../components/bits';
import { TermsDoc } from '../../components/Terms';
import { useSettings, useToast } from '../../state/context';
import { fmtDate } from '../../utils/format';

/** Settings → Terms & confidentiality: the wording visitors agree to at check-in, versioned (admins). */
export function TermsPanel() {
  const { settings, save } = useSettings();
  const toast = useToast();
  const t = settings.terms;
  const [form, setForm] = useState({ company: t.company, title: t.title, body: t.body });
  const [synced, setSynced] = useState(t.version);
  const [busy, setBusy] = useState(false);
  const [versions, setVersions] = useState([]);
  // A new version saved elsewhere (or by us): show its wording.
  if (t.version !== synced) {
    setSynced(t.version);
    setForm({ company: t.company, title: t.title, body: t.body });
  }
  useEffect(() => {
    const ctrl = new AbortController();
    termsApi
      .get(ctrl.signal)
      .then((r) => setVersions(r.versions))
      .catch(() => {});
    return () => ctrl.abort();
  }, [t.version]);

  const setRequired = async (required) => {
    try {
      await save({ ...settings, terms: { ...t, required } });
      toast('Saved');
    } catch (err) {
      toast(errorMessage(err));
    }
  };
  const submit = async () => {
    const next = { company: form.company.trim(), title: form.title.trim(), body: form.body.trim() };
    if (!next.title || !next.body) return toast('Title and terms text are needed');
    if (next.company === (t.company || '') && next.title === t.title && next.body === t.body) {
      return toast('No changes to save');
    }
    setBusy(true);
    try {
      await save({ ...settings, terms: { ...t, ...next } });
      toast(`Terms saved as version ${t.version + 1}`);
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const sample = async () => {
    try {
      const { blob } = await termsApi.samplePdf();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      toast(errorMessage(err));
    }
  };
  const earlier = versions.filter((v) => v.version !== t.version);

  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, lg: 7 }}>
        <Panel title="Terms & confidentiality agreement">
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: -0.5, mb: 1.5, maxWidth: '75ch' }}>
            Shown from the Terms link on the check-in form. When security checks a visitor in with their photo, the
            visitor has agreed: Gatebook places the photo on this agreement and saves it as a PDF with the visit.
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: 'wrap' }}>
            <Button
              size="small"
              startIcon={<OpenInNewIcon />}
              component="a"
              href="/terms"
              target="_blank"
              rel="noopener"
            >
              Open terms page
            </Button>
            <Button size="small" startIcon={<PictureAsPdfOutlinedIcon />} onClick={sample}>
              Sample agreement PDF
            </Button>
          </Stack>
          <Box sx={{ p: 1.25, mb: 2, border: 1, borderColor: 'divider', borderRadius: '10px' }}>
            <FormControlLabel
              control={<Checkbox checked={!!t.required} onChange={(e) => setRequired(e.target.checked)} />}
              label={<Typography sx={{ fontWeight: 700 }}>Visitors must agree to the terms at check-in</Typography>}
            />
            <Typography variant="body2" sx={{ color: 'text.secondary', ml: 4 }}>
              Adds the agreement checkbox to the check-in form and creates the PDF for every visit.
            </Typography>
          </Box>
          <Grid container spacing={1.5}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                label="Company name on the agreement"
                placeholder={settings.company?.legalName || 'e.g. your registered company name'}
                value={form.company}
                onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                helperText={
                  !form.company && settings.company?.legalName
                    ? `Empty: “${settings.company.legalName}” is printed`
                    : ' '
                }
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                label="Title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </Grid>
            <Grid size={12}>
              <TextField
                label="Terms text"
                multiline
                minRows={16}
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                helperText="Start a numbered heading on its own line (e.g. “1. Confidentiality”) and leave a blank line between sections."
                slotProps={{ htmlInput: { style: { fontSize: 14, lineHeight: 1.5 } } }}
              />
            </Grid>
          </Grid>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 2, alignItems: { sm: 'center' } }}>
            <Button variant="contained" color="primary" onClick={submit} disabled={busy}>
              Save as version {t.version + 1}
            </Button>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Current: version {t.version}. Agreements already signed keep the wording the visitor agreed to.
            </Typography>
          </Stack>
          {earlier.length ? (
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1.5 }}>
              Earlier versions:{' '}
              {earlier.map((v, i) => (
                <span key={v.version}>
                  {i ? ' · ' : ''}
                  <Link href={`/terms?v=${v.version}`} target="_blank" rel="noopener">
                    v{v.version}
                  </Link>{' '}
                  ({fmtDate(v.at)})
                </span>
              ))}
            </Typography>
          ) : null}
        </Panel>
      </Grid>
      <Grid size={{ xs: 12, lg: 5 }}>
        <Panel title="Preview">
          <Typography variant="overline" sx={{ color: 'text.secondary' }}>
            {form.company || settings.company?.legalName || 'Visitor terms'}
          </Typography>
          <Typography variant="h3" sx={{ mb: 1 }}>
            {form.title}
          </Typography>
          <TermsDoc body={form.body} flat />
        </Panel>
      </Grid>
    </Grid>
  );
}
