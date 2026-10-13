import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useNavigate } from 'react-router';
import { FieldLabel, PageHeader, VisitorThumb } from '../../components/bits';
import { fonts } from '../../theme/tokens';
import { fmtDateTime } from '../../utils/format';

/** "Visitor pass issued" ticket shown after a successful check-in. */
export function PassIssued({ visit, onNext }) {
  const navigate = useNavigate();
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
              <Typography sx={{ fontFamily: fonts.display, fontWeight: 700, letterSpacing: '0.2em', fontSize: 20 }}>
                VISITOR
              </Typography>
              <Typography
                sx={{
                  fontFamily: fonts.display,
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'gb.railMuted',
                }}
              >
                Main entrance
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
              <Typography
                sx={{ fontFamily: fonts.mono, fontWeight: 500, fontSize: 40, lineHeight: 1.2, color: 'text.primary' }}
              >
                {visit.badge}
              </Typography>
              <Typography variant="mono" sx={{ color: 'text.secondary' }}>
                Entry {visit.pass}
              </Typography>
            </Box>
          </Paper>
          <Typography sx={{ mt: 2, fontWeight: 500 }}>
            Hand pass <b>{visit.badge}</b> to the visitor. Collect it back at exit.
          </Typography>
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
