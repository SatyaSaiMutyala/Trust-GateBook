import CloseIcon from '@mui/icons-material/Close';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Drawer from '@mui/material/Drawer';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { useAuth } from '../auth/context';
import { canOperate, isAdmin } from '../auth/roles';
import { useIsDesktop, useNow } from '../hooks';
import { useSettings } from '../state/context';
import { fonts } from '../theme/tokens';
import { fmtDateTime, fmtDuration } from '../utils/format';
import { visitStatus } from '../utils/visit';
import { FieldLabel, FillThumb, PassBadge, StatusChip, TimelineItem } from './bits';
import { ImagePreview } from './ImagePreview';
/** Drawer on desktop, full screen on phone. */
export function VisitorDetailsDrawer({ visit, open, onClose, onExit }) {
  const desktop = useIsDesktop();
  const content = visit ? <Details visit={visit} onClose={onClose} onExit={onExit} /> : null;
  if (desktop) {
    return (
      <Drawer
        anchor="right"
        open={open && !!visit}
        onClose={onClose}
        slotProps={{
          paper: {
            sx: {
              width: 500,
              maxWidth: '100vw',
              bgcolor: 'background.default',
            },
          },
        }}
      >
        {content}
      </Drawer>
    );
  }
  return (
    <Dialog
      fullScreen
      open={open && !!visit}
      onClose={onClose}
      slotProps={{
        paper: { sx: { bgcolor: 'background.default', borderRadius: 0 } },
      }}
    >
      {content}
    </Dialog>
  );
}
function Details({ visit: v, onClose, onExit }) {
  const { user } = useAuth();
  // Full-screen photo viewer: index into the photos, or null when closed.
  const [preview, setPreview] = useState(null);
  const { settings } = useSettings();
  const now = useNow();
  const status = visitStatus(v, settings?.overstayHours, now);
  const inside = !v.outAt;
  const details = [
    ['Mobile', <Mono key="m">{v.phone || '—'}</Mono>],
    ['Coming from', v.company || '—'],
    ['Purpose', v.purpose || '—'],
    ['Persons', String(v.persons)],
    ['Whom to meet', v.host || '—'],
    ['Department', v.dept || '—'],
    ['ID shown', v.idType === 'None' || !v.idType ? 'None' : `${v.idType}${v.idLast4 ? ` ·· ${v.idLast4}` : ''}`],
    ['Vehicle', v.vehicle ? <Mono key="v">{v.vehicle}</Mono> : '—'],
    ['Items carried', v.items || '—'],
    ['Remarks', v.notes || '—'],
  ];
  return (
    <Stack sx={{ minHeight: '100%' }}>
      <Box
        sx={{
          p: { xs: 2, md: 3 },
          pb: 2,
          bgcolor: 'background.paper',
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Stack
          direction="row"
          sx={{
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 1,
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
              <PassBadge badge={v.badge} />
              <Typography variant="mono" sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>
                Entry {v.pass}
              </Typography>
            </Stack>
            <Typography variant="h2" sx={{ wordBreak: 'break-word' }}>
              {v.name}
            </Typography>
            <Box sx={{ mt: 1 }}>
              <StatusChip status={status} />
            </Box>
          </Box>
          <IconButton onClick={onClose} aria-label="Close" sx={{ border: 1, borderColor: 'divider' }}>
            <CloseIcon />
          </IconButton>
        </Stack>
      </Box>

      <Box sx={{ p: { xs: 2, md: 3 }, flex: 1 }}>
        <Grid container spacing={1.5} sx={{ mb: 3 }}>
          <Grid size={6}>
            <FieldLabel>Photo</FieldLabel>
            <Box sx={{ mt: 0.75, aspectRatio: '3 / 4', width: '100%' }}>
              <FillThumb src={v.photoUrl} name={v.name} onOpen={v.photoUrl ? () => setPreview(0) : undefined} />
            </Box>
          </Grid>
          <Grid size={6}>
            <FieldLabel>ID proof</FieldLabel>
            <Box sx={{ mt: 0.75, aspectRatio: '3 / 4', width: '100%' }}>
              {v.idPhotoUrl ? (
                <FillThumb src={v.idPhotoUrl} name="ID proof" contain onOpen={() => setPreview(v.photoUrl ? 1 : 0)} />
              ) : (
                <Box
                  sx={{
                    height: '100%',
                    borderRadius: 1,
                    border: '1px dashed',
                    borderColor: 'divider',
                    bgcolor: 'gb.sunk',
                    display: 'grid',
                    placeItems: 'center',
                    color: 'text.secondary',
                    fontWeight: 600,
                  }}
                >
                  No ID photo
                </Box>
              )}
            </Box>
          </Grid>
        </Grid>

        <Stack spacing={0} sx={{ mb: 3 }}>
          <TimelineItem kind="in">
            <b>In</b> <Mono>{fmtDateTime(v.inAt)}</Mono>
            {v.guardIn ? ` · logged by ${v.guardIn.name}` : ''}
          </TimelineItem>
          {v.outAt ? (
            <TimelineItem kind="out" last>
              <b>Out</b> <Mono>{fmtDateTime(v.outAt)}</Mono> · Stayed <Mono>{fmtDuration(v.inAt, v.outAt)}</Mono>
              {v.guardOut ? ` · logged by ${v.guardOut.name}` : ''}
              {v.badge ? (
                v.passReturned === false ? (
                  <>
                    {' · '}
                    <Box component="b" sx={{ color: 'error.main' }}>
                      pass not returned
                    </Box>
                  </>
                ) : (
                  ' · pass returned'
                )
              ) : null}
              {v.exitNote ? ` · ${v.exitNote}` : ''}
            </TimelineItem>
          ) : (
            <TimelineItem kind="pending" last>
              <b>Still inside</b> <Mono>{fmtDuration(v.inAt, null, now)}</Mono>
            </TimelineItem>
          )}
        </Stack>

        <Grid
          container
          spacing={2}
          sx={{
            bgcolor: 'background.paper',
            border: 1,
            borderColor: 'divider',
            borderRadius: '10px',
            p: 2,
            m: 0,
          }}
        >
          {details.map(([label, value]) => (
            <Grid key={label} size={{ xs: 6 }} sx={{ minWidth: 0 }}>
              <FieldLabel>{label}</FieldLabel>
              <Typography
                sx={{
                  fontWeight: 500,
                  wordBreak: 'break-word',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {value}
              </Typography>
            </Grid>
          ))}
        </Grid>
      </Box>

      {(inside && canOperate(user)) || (!inside && isAdmin(user)) ? (
        <Box
          sx={{
            p: { xs: 2, md: 3 },
            pt: 2,
            position: 'sticky',
            bottom: 0,
            bgcolor: 'background.default',
            borderTop: 1,
            borderColor: 'divider',
          }}
        >
          {inside ? (
            <Button variant="exit" size="large" fullWidth onClick={() => onExit(v)}>
              Mark exit
            </Button>
          ) : (
            <Button variant="outlined" size="large" fullWidth onClick={() => onExit(v)}>
              Correct exit time
            </Button>
          )}
        </Box>
      ) : null}
      {preview !== null ? (
        <ImagePreview
          open
          index={preview}
          onClose={() => setPreview(null)}
          images={[
            { src: v.photoUrl, label: `Visitor · ${v.name}` },
            { src: v.idPhotoUrl, label: `ID proof · ${v.idType || 'ID'}` },
          ]}
        />
      ) : null}
    </Stack>
  );
}
function Mono({ children }) {
  return (
    <Box component="span" sx={{ fontFamily: fonts.mono, fontSize: '0.92em' }}>
      {children}
    </Box>
  );
}
