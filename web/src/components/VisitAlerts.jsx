import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { keyframes } from '@mui/material/styles';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router';
import { visitsApi } from '../api/endpoints';
import { useUser } from '../auth/context';
import { canOperate } from '../auth/roles';
import { usePaginatedQuery } from '../hooks/usePaginatedQuery';
import { useRealtimeEvent, useVisitChanges } from '../realtime/context';
import { useToast, useVisitUi } from '../state/context';
import { fmtDuration, fmtTime } from '../utils/format';
import { hostStage } from '../utils/visit';
import { PassBadge, VisitorThumb } from './bits';
import { HostActions } from './HostActions';

const pulse = keyframes`
  0% { box-shadow: 0 0 0 0 rgba(233, 163, 22, 0.75); }
  70% { box-shadow: 0 0 0 10px rgba(233, 163, 22, 0); }
  100% { box-shadow: 0 0 0 0 rgba(233, 163, 22, 0); }
`;

/** What the guard should do, and why. */
function describe(v) {
  const stage = hostStage(v);
  switch (stage?.key) {
    case 'accepted':
      return {
        tone: 'ok',
        what: `Send ${v.name} in`,
        why: `${v.hostVia === 'preapproved' ? `Expected visitor, pre-approved for ${v.host}` : `${v.host} accepted at ${fmtTime(v.hostAt)}`}${v.hostLocation ? ` · ${v.hostLocation}` : ''}${v.hostNote ? ` · “${v.hostNote}”` : ''}`,
      };
    case 'declined':
      return {
        tone: 'bad',
        what: `${v.host} declined ${v.name}`,
        why: `${v.hostNote ? `“${v.hostNote}” · ` : ''}Collect pass ${v.badge} and record the exit.`,
      };
    case 'noreply':
      return {
        tone: 'bad',
        what: `No reply from ${v.host}: call them`,
        why: `${v.name} has waited ${fmtDuration(v.inAt, null, Date.now())}.${v.hostPhone ? ` Host phone ${v.hostPhone}.` : ' No phone number saved for this host.'}`,
      };
    case 'manual':
      return {
        tone: 'warn',
        what: `Call ${v.host} to confirm ${v.name}`,
        why: 'The host is not on Gatebook. Let them in once the host confirms.',
      };
    default:
      return null;
  }
}

/** Visited host: a visitor checked in for me → toast + vibration (the push covers a closed app). */
export function HostVisitNotifier() {
  const user = useUser();
  const toast = useToast();
  useRealtimeEvent('visit:created', ({ visit: v }) => {
    if (v.hostId !== user.id || v.hostStatus !== 'waiting') return;
    toast(`${v.name} is at the gate · open My visitors to accept or decline`);
    try {
      navigator.vibrate?.([180, 90, 180]);
    } catch {
      /* ignore */
    }
  });
  return null;
}

/** Seen-state of a visit for "is this news?": the answer and whether security was alerted. */
const stateKey = (v) => `${v.id}:${v.hostStatus}:${v.escalatedAt ? 1 : 0}`;

/**
 * Rows above every gate screen for open visits that need the guard now (`GET /api/visits/inside?attention=true`):
 * host accepted → Allowed in; host declined → Mark exit; no reply → Call host / Confirmed by phone; host not on
 * Gatebook → Confirmed by phone. A host's answer or a no-reply alert arriving live gets a toast and a pulse.
 */
export function VisitAlerts() {
  const user = useUser();
  const toast = useToast();
  const { openDetails, openExit } = useVisitUi();
  const [pulsing, setPulsing] = useState(null);
  const query = useMemo(() => ({ attention: 'true', page: 1, limit: 5 }), []);
  const list = usePaginatedQuery(visitsApi.inside, query);
  const seen = useRef(new Set());

  useVisitChanges(list.refresh, 300);
  useEffect(() => {
    for (const v of list.data) seen.current.add(stateKey(v));
  }, [list.data]);

  useRealtimeEvent('visit:updated', ({ visit: v }) => {
    const key = stateKey(v);
    if (seen.current.has(key)) return;
    seen.current.add(key);
    // News for the gate: the host answered in the app, or security was just alerted about no reply.
    const answered = v.hostVia === 'app' && (v.hostStatus === 'accepted' || v.hostStatus === 'declined');
    const noReply = v.hostStatus === 'waiting' && !!v.escalatedAt;
    if (v.outAt || v.allowedAt || (!answered && !noReply)) return;
    toast(describe(v)?.what ?? `${v.name} needs attention`);
    setPulsing(v.id);
    setTimeout(() => setPulsing((p) => (p === v.id ? null : p)), 2400);
  });

  const rows = list.data.map((v) => ({ v, d: describe(v) })).filter((r) => r.d);
  if (!rows.length) return null;
  const more = list.pagination.total - list.data.length;
  return (
    <Stack spacing={1} sx={{ mb: { xs: 2, md: 3 } }} role="region" aria-label="Visitors needing attention">
      {rows.map(({ v, d }) => (
        <Box
          key={v.id}
          sx={(theme) => {
            const p = theme.vars.palette.gb;
            const [bg, border] =
              d.tone === 'ok' ? [p.okSoft, p.ok] : d.tone === 'bad' ? [p.badSoft, p.bad] : [p.warnSoft, p.warn];
            return {
              p: 1.25,
              borderRadius: '10px',
              bgcolor: bg,
              border: `1px solid ${border}`,
              animation: pulsing === v.id ? `${pulse} 0.8s ease-out 3` : 'none',
            };
          }}
        >
          <Grid container spacing={1.25} sx={{ alignItems: 'center' }}>
            <Grid size="auto">
              <VisitorThumb src={v.photoUrl} name={v.name} size={44} />
            </Grid>
            <Grid size={{ xs: 'grow' }} sx={{ minWidth: 0 }}>
              <Stack direction="row" sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography sx={{ fontWeight: 700, lineHeight: 1.3 }}>{d.what}</Typography>
                <PassBadge badge={v.badge} />
              </Stack>
              <Typography variant="body2" sx={{ color: 'text.primary', wordBreak: 'break-word' }}>
                {d.why}
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, sm: 'auto' }}>
              <Stack direction="row" sx={{ gap: 1, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <Button size="small" variant="outlined" onClick={() => openDetails(v)}>
                  View
                </Button>
                <HostActions visit={v} />
                {d.tone === 'bad' && v.hostStatus === 'declined' && canOperate(user) ? (
                  <Button size="small" variant="exit" onClick={() => openExit(v)}>
                    Mark exit
                  </Button>
                ) : null}
              </Stack>
            </Grid>
          </Grid>
        </Box>
      ))}
      {more > 0 ? (
        <Button component={RouterLink} to="/inside" size="small" sx={{ alignSelf: 'flex-start' }}>
          {more} more on Inside now
        </Button>
      ) : null}
    </Stack>
  );
}
