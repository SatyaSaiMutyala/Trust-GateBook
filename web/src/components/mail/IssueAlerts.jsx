import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { keyframes } from '@mui/material/styles';
import { useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router';
import { mailApi } from '../../api/endpoints';
import { useUser } from '../../auth/context';
import { canOperate } from '../../auth/roles';
import { usePaginatedQuery } from '../../hooks/usePaginatedQuery';
import { useMailChanges, useRealtimeEvent } from '../../realtime/context';
import { useMailUi, useToast } from '../../state/context';
import { fmtTime } from '../../utils/format';
import { firstWord } from '../../utils/mail';
import { VisitorThumb } from '../bits';

const pulse = keyframes`
  0% { box-shadow: 0 0 0 0 rgba(233, 163, 22, 0.75); }
  70% { box-shadow: 0 0 0 10px rgba(233, 163, 22, 0); }
  100% { box-shadow: 0 0 0 0 rgba(233, 163, 22, 0); }
`;

/**
 * Red alert rows above every gate screen: disputed items
 * (`GET /api/mail?status=disputed&limit=5`) with View / Resolve, plus "N more" → Issues tab.
 * New disputes over the socket get a toast and a brief amber pulse.
 */
export function IssueAlerts() {
  const user = useUser();
  const toast = useToast();
  const { openDetails, openResolve } = useMailUi();
  const [pulsing, setPulsing] = useState(null);
  const query = useMemo(() => ({ status: 'disputed', page: 1, limit: 5 }), []);
  const list = usePaginatedQuery(mailApi.list, query);

  useMailChanges(list.refresh, 400);
  useRealtimeEvent('mail:updated', ({ item }) => {
    if (item.status !== 'disputed') {
      list.patch(item, false);
      return;
    }
    toast(`${item.recipientName} says they did not get it`);
    setPulsing(item.id);
    setTimeout(() => setPulsing((p) => (p === item.id ? null : p)), 2400);
  });

  if (!list.data.length) return null;
  const more = list.pagination.total - list.data.length;
  return (
    <Stack spacing={1} sx={{ mb: { xs: 2, md: 3 } }} role="region" aria-label="Post issues">
      {list.data.map((m) => (
        <Box
          key={m.id}
          sx={(theme) => ({
            p: 1.25,
            borderRadius: '10px',
            bgcolor: theme.vars.palette.gb.badSoft,
            border: `1px solid ${theme.vars.palette.gb.bad}`,
            animation: pulsing === m.id ? `${pulse} 0.8s ease-out 3` : 'none',
          })}
        >
          <Grid container spacing={1.25} sx={{ alignItems: 'center' }}>
            <Grid size="auto">
              <VisitorThumb src={m.coverPhotoUrl} name={m.kind} size={44} />
            </Grid>
            <Grid size={{ xs: 'grow' }} sx={{ minWidth: 0 }}>
              <Typography sx={{ fontWeight: 700, color: 'error.main', lineHeight: 1.3 }}>
                <ReportProblemOutlinedIcon sx={{ fontSize: 17, verticalAlign: '-3px', mr: 0.5 }} />
                {m.recipientName} says they did not get it
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.primary', wordBreak: 'break-word' }}>
                {m.kind}
                {m.sender ? ` from ${m.sender}` : ''}
                {m.collectedBy ? `, handed to ${firstWord(m.collectedBy)}` : ''}
                {m.handedAt ? ` at ${fmtTime(m.handedAt)}` : ''}
                {m.disputeNote ? ` · “${m.disputeNote}”` : ''}
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, sm: 'auto' }}>
              <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
                <Button size="small" variant="outlined" onClick={() => openDetails(m)}>
                  View
                </Button>
                {canOperate(user) ? (
                  <Button size="small" variant="contained" color="primary" onClick={() => openResolve(m)}>
                    Resolve
                  </Button>
                ) : null}
              </Stack>
            </Grid>
          </Grid>
        </Box>
      ))}
      {more > 0 ? (
        <Button
          component={RouterLink}
          to="/post?tab=issues"
          size="small"
          sx={{ alignSelf: 'flex-start', color: 'error.main' }}
        >
          {more} more {more === 1 ? 'issue' : 'issues'}
        </Button>
      ) : null}
    </Stack>
  );
}

/**
 * Receiver-side notifications: `mail:reminder` and new `mail:created` addressed to me → toast.
 */
export function MailNotifier() {
  const user = useUser();
  const toast = useToast();
  const announce = (item, reminder) => {
    if (!item.recipient || item.recipient.id !== user.id) return;
    toast(`${reminder ? 'Reminder: ' : ''}${item.kind} for you${item.sender ? ` from ${item.sender}` : ''}`);
    try {
      navigator.vibrate?.(200);
    } catch {
      /* ignore */
    }
  };
  useRealtimeEvent('mail:created', ({ item }) => announce(item, false));
  useRealtimeEvent('mail:reminder', ({ item }) => announce(item, true));
  return null;
}
