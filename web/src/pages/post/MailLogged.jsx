import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useNavigate } from 'react-router';
import { FieldLabel, FillThumb, PageHeader, PhotoPlaceholder } from '../../components/bits';
import { KindTag } from '../../components/mail/MailBits';
import { fonts } from '../../theme/tokens';

/** "Item logged" confirmation after a successful log. */
export function MailLogged({ item: m, onNext }) {
  const navigate = useNavigate();
  const line = [
    m.sender ? `From ${m.sender}` : '',
    m.carrier ? `via ${m.carrier}` : '',
    m.broughtBy ? `brought by ${m.broughtBy}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <>
      <PageHeader eyebrow="Post room" title="Item logged" />
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, sm: 10, md: 8, lg: 6 }}>
          <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 } }}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Grid container spacing={1}>
                  <Grid size={6}>
                    <FieldLabel>Front</FieldLabel>
                    <Box sx={{ aspectRatio: '4 / 3', mt: 0.5 }}>
                      <FillThumb src={m.coverPhotoUrl} name="Cover, front" contain />
                    </Box>
                  </Grid>
                  <Grid size={6}>
                    <FieldLabel>Back</FieldLabel>
                    <Box sx={{ aspectRatio: '4 / 3', mt: 0.5 }}>
                      {m.coverBackPhotoUrl ? (
                        <FillThumb src={m.coverBackPhotoUrl} name="Cover, back" contain />
                      ) : (
                        <PhotoPlaceholder text="No back photo" />
                      )}
                    </Box>
                  </Grid>
                </Grid>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Stack direction="row" sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 0.75 }}>
                  <KindTag kind={m.kind} />
                  <Typography sx={{ fontWeight: 600 }}>for {m.recipientName}</Typography>
                </Stack>
                <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
                  {line}
                </Typography>
                <Typography sx={{ fontFamily: fonts.mono, fontSize: 13 }}>
                  {m.id}
                  {m.refNo ? ` · ${m.refNo}` : ''}
                </Typography>
              </Grid>
              <Grid size={12}>
                {m.notifiedAt ? (
                  <Box
                    sx={{ p: 1.5, borderRadius: 1, bgcolor: 'gb.accentSoft', border: 1, borderColor: 'primary.main' }}
                  >
                    <Typography>
                      <b>{m.recipientName} has been notified</b> to collect it at the gate.
                    </Typography>
                  </Box>
                ) : (
                  <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: 'gb.warnSoft', border: 1, borderColor: 'warning.main' }}>
                    <Typography>
                      <b>
                        {m.recipientName} {m.recipient ? "can't sign in to Gatebook." : "isn't on Gatebook."}
                      </b>{' '}
                      Call them to collect it.
                    </Typography>
                  </Box>
                )}
              </Grid>
            </Grid>
          </Paper>
          <Grid container spacing={1.5} sx={{ mt: 1.5 }}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Button variant="outlined" size="large" fullWidth onClick={() => navigate('/post')}>
                Post room
              </Button>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Button variant="contained" color="primary" size="large" fullWidth onClick={onNext}>
                Log next item
              </Button>
            </Grid>
          </Grid>
        </Grid>
      </Grid>
    </>
  );
}
