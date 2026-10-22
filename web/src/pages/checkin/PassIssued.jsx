import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { FieldLabel, PageHeader, VisitorThumb } from '../../components/bits';
import { LogoTile } from '../../components/AppShell';
import { HostActions } from '../../components/HostActions';
import { AgreementButton } from '../../components/Terms';
import { VisitMaterialButtons } from '../../components/material/VisitMaterial';
import { useRealtimeEvent } from '../../realtime/context';
import { useSettings } from '../../state/context';
import { fonts } from '../../theme/tokens';
import { fmtDateTime } from '../../utils/format';

/** What happens next with the host, kept live (the host may answer while this screen is open). */
function HostNote({ visit: v }) {
  const { settings } = useSettings();
  const actions = (
    <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', mt: 1 }}>
      <HostActions visit={v} />
    </Stack>
  );
  if (v.allowedAt) return <Alert severity="success">{v.name} has been let in.</Alert>;
  if (v.hostStatus === 'declined') {
    return (
      <Alert severity="error">
        <b>{v.host} declined.</b>
        {v.hostNote ? ` “${v.hostNote}”` : ''} Collect pass {v.badge} and record the exit.
      </Alert>
    );
  }
  if (v.hostStatus === 'accepted') {
    return (
      <Alert severity="success">
        <b>{v.host} accepted.</b>
        {v.hostNote ? ` “${v.hostNote}”` : ''} Send {v.name} in.
        {actions}
      </Alert>
    );
  }
  if (v.hostStatus === 'manual') {
    return (
      <Alert severity="warning">
        <b>{v.host} isn&apos;t on TruSentinel.</b> Call them to confirm, then let {v.name} in.
        {actions}
      </Alert>
    );
  }
  return (
    <Alert severity="info">
      <b>{v.host} has been notified.</b> Ask the visitor to wait. If there is no reply in{' '}
      {settings?.hostReplyMinutes ?? 5} minutes, you&apos;ll get an alert to call them.
      {actions}
    </Alert>
  );
}

/** "Visitor pass issued" ticket shown after a successful check-in. */
export function PassIssued({ visit: issued, onNext }) {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const company = settings?.company;
  const [visit, setVisit] = useState(issued);
  useRealtimeEvent('visit:updated', ({ visit: v }) => {
    if (v.id === issued.id) setVisit(v);
  });
  const rows = [
    ['Name', visit.name],
    ['Meeting', [visit.host, visit.dept].filter(Boolean).join(' · ')],
    ['Purpose', `${visit.purpose}${visit.persons > 1 ? ` · ${visit.persons} persons` : ''}`],
    ['In', fmtDateTime(visit.inAt)],
  ];
  return (
    <>
      <PageHeader eyebrow="Entry recorded" title="Visitor pass issued" />
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, sm: 10, md: 7, lg: 5 }}>
          <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
            <Stack
              direction="row"
              sx={{
                bgcolor: 'gb.rail',
                color: 'gb.railInk',
                px: 2.5,
                py: 1.5,
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
                {company?.logoUrl ? <LogoTile size={30} src={company.logoUrl} /> : null}
                <Typography sx={{ fontFamily: fonts.display, fontWeight: 700, letterSpacing: '0.2em', fontSize: 20 }}>
                  VISITOR
                </Typography>
              </Stack>
              <Typography
                sx={{
                  fontFamily: fonts.display,
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'gb.railMuted',
                }}
              >
                {company?.name ? `${company.name} · ${visit.site}` : visit.site}
              </Typography>
            </Stack>
            <Box sx={{ p: 2.5 }}>
              <Stack direction="row" spacing={2.5}>
                <VisitorThumb src={visit.photoUrl} name={visit.name} width={110} height={140} />
                <Stack spacing={1.25} sx={{ minWidth: 0 }}>
                  {rows.map(([label, value]) => (
                    <Box key={label}>
                      <FieldLabel>{label}</FieldLabel>
                      <Typography
                        sx={{
                          fontWeight: label === 'Name' ? 700 : 500,
                          fontSize: label === 'Name' ? 18 : 15,
                          wordBreak: 'break-word',
                        }}
                      >
                        {value || '—'}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              </Stack>
            </Box>
            <Box sx={{ borderTop: '2px dashed', borderColor: 'divider', mx: 2.5 }} />
            <Box sx={{ p: 2.5, textAlign: 'center' }}>
              <FieldLabel>Pass number</FieldLabel>
              {visit.badge ? (
                <Typography
                  sx={{ fontFamily: fonts.mono, fontWeight: 500, fontSize: 40, lineHeight: 1.2, color: 'text.primary' }}
                >
                  {visit.badge}
                </Typography>
              ) : (
                <Typography sx={{ fontWeight: 600, fontSize: 18, py: 1 }}>No pass card</Typography>
              )}
              <Typography variant="mono" sx={{ color: 'text.secondary' }}>
                Entry {visit.pass}
              </Typography>
            </Box>
          </Paper>
          {visit.badge ? (
            <Typography sx={{ mt: 2, fontWeight: 500 }}>
              Hand pass <b>{visit.badge}</b> to the visitor. Collect it back at exit.
            </Typography>
          ) : null}
          <Box sx={{ mt: 1.5 }}>
            <HostNote visit={visit} />
          </Box>
          <Box sx={{ mt: 1.5 }}>
            <VisitMaterialButtons visit={visit} />
          </Box>
          {visit.termsAt ? (
            <Alert
              severity="info"
              icon={false}
              sx={{ mt: 1.5, bgcolor: 'gb.sunk', color: 'text.primary', alignItems: 'center' }}
              action={<AgreementButton visit={visit} onUpdated={setVisit} />}
            >
              <b>Terms accepted.</b> Confidentiality agreement saved with the visitor&apos;s photo
              {visit.agreementUrl ? '.' : ' (the PDF is being made).'}
            </Alert>
          ) : null}
          <Grid container spacing={1.5} sx={{ mt: 1 }}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Button variant="outlined" size="large" fullWidth onClick={() => navigate('/inside')}>
                See who&apos;s inside
              </Button>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Button variant="contained" color="primary" size="large" fullWidth onClick={onNext}>
                Check in next visitor
              </Button>
            </Grid>
          </Grid>
        </Grid>
      </Grid>
    </>
  );
}
