import CloseIcon from '@mui/icons-material/Close';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
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
import { fmtDateTime, fmtDuration, fmtTime } from '../utils/format';
import { hostStage, visitStatus } from '../utils/visit';
import { FieldLabel, FillThumb, HostStageChip, PassBadge, StatusChip, TimelineItem } from './bits';
import { HostActions } from './HostActions';
import { HostRespond } from './HostRespond';
import { ImagePreview } from './ImagePreview';
import { AgreementButton } from './Terms';
import { VisitMaterial } from './material/VisitMaterial';
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
  const stage = hostStage(v);
  const inside = !v.outAt;
  const gate = canOperate(user);
  // The visited host looking at their own visitor who is still waiting for their answer.
  const myWaiting = inside && v.hostStatus === 'waiting' && !!user && v.hostId === user.id;
  // Visits from before host approval: let in at check-in, no host steps to show.
  const legacy = v.hostStatus === 'manual' && !!v.allowedAt;
  const details = [
    ['Mobile', <Mono key="m">{v.phone || '—'}</Mono>],
    ['Coming from', v.company || '—'],
    ['Purpose', v.purpose || '—'],
    ['Persons', String(v.persons)],
    [
      'Whom to meet',
      <span key="h">
        {v.host || '—'}
        {v.hostLocation ? (
          <Box component="span" sx={{ display: 'block', color: 'text.secondary', fontWeight: 400 }}>
            {v.hostLocation}
          </Box>
        ) : null}
        {gate && v.hostPhone ? (
          <Box
            component="span"
            sx={{ display: 'block', color: 'text.secondary', fontWeight: 400, fontFamily: fonts.mono }}
          >
            {v.hostPhone}
          </Box>
        ) : null}
      </span>,
    ],
    ['Department', v.dept || '—'],
    ['ID shown', v.idType === 'None' || !v.idType ? 'None' : `${v.idType}${v.idLast4 ? ` ·· ${v.idLast4}` : ''}`],
    ['Vehicle', v.vehicle ? <Mono key="v">{v.vehicle}</Mono> : '—'],
    ['Items carried', v.items || '—'],
    ['Remarks', v.notes || '—'],
    ...(v.hostNote ? [["Host's message", `“${v.hostNote}”`]] : []),
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
            <Stack direction="row" sx={{ mt: 1, gap: 1, flexWrap: 'wrap' }}>
              <StatusChip status={status} />
              <HostStageChip stage={stage} />
            </Stack>
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
          {legacy ? null : <HostSteps visit={v} now={now} />}
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

        <Box sx={{ mb: 2 }}>
          <VisitMaterial visit={v} />
        </Box>

        {v.termsAt ? (
          <Stack
            direction="row"
            spacing={1.5}
            sx={{
              alignItems: 'center',
              p: 1.5,
              mb: 2,
              bgcolor: 'background.paper',
              border: 1,
              borderColor: 'divider',
              borderRadius: '10px',
            }}
          >
            <DescriptionOutlinedIcon sx={{ color: 'text.secondary' }} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 700 }}>Terms &amp; confidentiality agreement</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                Accepted with photo at {fmtDateTime(v.termsAt)} · terms version {v.termsVersion}
              </Typography>
            </Box>
            {gate ? <AgreementButton visit={v} /> : null}
          </Stack>
        ) : null}

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

      {myWaiting || (inside && gate) || (!inside && isAdmin(user)) ? (
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
          {myWaiting && !gate ? (
            <HostRespond visit={v} />
          ) : inside ? (
            <Stack spacing={1.25}>
              {myWaiting ? <HostRespond visit={v} /> : null}
              <Stack direction="row" sx={{ gap: 1.25, flexWrap: 'wrap', '& > *': { flex: '1 1 160px' } }}>
                <HostActions visit={v} size="large" />
              </Stack>
              <Button variant="exit" size="large" fullWidth onClick={() => onExit(v)}>
                Mark exit
              </Button>
            </Stack>
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
/** Timeline rows between "In" and "Out": the host's answer, then when security let the visitor in. */
function HostSteps({ visit: v, now }) {
  const open = !v.outAt;
  let answer;
  if (v.hostStatus === 'waiting') {
    answer = (
      <TimelineItem kind="pending">
        <b>Waiting for {v.host}</b> · asked <Mono>{fmtDuration(v.inAt, null, now)}</Mono> ago
        {v.escalatedAt ? ` · no reply, security alerted at ${fmtTime(v.escalatedAt)}` : ''}
      </TimelineItem>
    );
  } else if (v.hostStatus === 'manual') {
    answer = (
      <TimelineItem kind="pending">
        <b>Confirm with {v.host} by phone</b> · not on Gatebook
      </TimelineItem>
    );
  } else {
    const accepted = v.hostStatus === 'accepted';
    const by =
      v.hostVia === 'phone'
        ? `confirmed by phone${v.hostBy ? ` by ${v.hostBy.name}` : ''}`
        : v.hostVia === 'preapproved'
          ? `pre-approved when registered${v.hostBy ? ` by ${v.hostBy.name}` : ''}${v.expectedId ? ` (${v.expectedId})` : ''}`
          : `by ${v.host} in ${fmtDuration(v.inAt, v.hostAt)}`;
    answer = (
      <TimelineItem kind={accepted ? 'in' : 'bad'}>
        <b>{accepted ? 'Accepted' : 'Declined'}</b> <Mono>{fmtTime(v.hostAt)}</Mono> · {by}
        {v.hostNote ? ` · “${v.hostNote}”` : ''}
      </TimelineItem>
    );
  }
  let allowed = null;
  if (v.allowedAt) {
    allowed = (
      <TimelineItem kind="in">
        <b>Let in</b> <Mono>{fmtTime(v.allowedAt)}</Mono>
        {v.allowedBy ? ` · by ${v.allowedBy.name}` : ''}
      </TimelineItem>
    );
  } else if (open && v.hostStatus !== 'declined') {
    allowed = (
      <TimelineItem kind="pending">
        <b>Not let in yet</b>
      </TimelineItem>
    );
  }
  return (
    <>
      {answer}
      {allowed}
    </>
  );
}

function Mono({ children }) {
  return (
    <Box component="span" sx={{ fontFamily: fonts.mono, fontSize: '0.92em' }}>
      {children}
    </Box>
  );
}
