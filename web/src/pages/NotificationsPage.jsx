import AlarmOutlinedIcon from '@mui/icons-material/AlarmOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlined';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import KeyOutlinedIcon from '@mui/icons-material/KeyOutlined';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import EventBusyOutlinedIcon from '@mui/icons-material/EventBusyOutlined';
import MarkunreadMailboxOutlinedIcon from '@mui/icons-material/MarkunreadMailboxOutlined';
import NotificationsNoneOutlinedIcon from '@mui/icons-material/NotificationsNoneOutlined';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import CircularProgress from '@mui/material/CircularProgress';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { errorMessage } from '../api/client';
import { mailApi, notificationsApi, visitsApi } from '../api/endpoints';
import { useUser } from '../auth/context';
import { isGateUser } from '../auth/roles';
import { EmptyState, PageHeader } from '../components/bits';
import { useNow } from '../hooks';
import { usePaginatedQuery } from '../hooks/usePaginatedQuery';
import { useUrlListParams } from '../hooks/useUrlListParams';
import { useRealtimeEvent } from '../realtime/context';
import { useMailUi, useMaterialUi, useNotifications, useToast, useVisitUi } from '../state/context';
import { fonts } from '../theme/tokens';
import { fmtRelative } from '../utils/format';

const DEFAULTS = { tab: 'all', limit: 20 };

/** Event → icon + token colour (📬 logged, ⏰ reminder, ✅ confirm, ⚠️ dispute, 🙋 sign-up request). */
const EVENT = {
  mail_logged: { Icon: MarkunreadMailboxOutlinedIcon, fg: 'gb.accentInk', bg: 'gb.accent' },
  mail_reminder: { Icon: AlarmOutlinedIcon, fg: 'gb.warn', bg: 'gb.warnSoft' },
  mail_confirm: { Icon: CheckCircleOutlineIcon, fg: 'gb.ok', bg: 'gb.okSoft' },
  mail_disputed: { Icon: ReportProblemOutlinedIcon, fg: 'gb.bad', bg: 'gb.badSoft' },
  signup_request: { emoji: '🙋', fg: 'gb.ink', bg: 'gb.accentSoft' },
  visit_arrived: { emoji: '🚪', fg: 'gb.ink', bg: 'gb.accentSoft' },
  visit_reply: { Icon: CheckCircleOutlineIcon, fg: 'gb.ok', bg: 'gb.okSoft' },
  visit_no_reply: { Icon: AlarmOutlinedIcon, fg: 'gb.warn', bg: 'gb.warnSoft' },
  expected_new: { Icon: EventAvailableOutlinedIcon, fg: 'gb.accentInk', bg: 'gb.accent' },
  expected_arrived: { Icon: CheckCircleOutlineIcon, fg: 'gb.ok', bg: 'gb.okSoft' },
  expected_cancelled: { Icon: EventBusyOutlinedIcon, fg: 'gb.muted', bg: 'gb.sunk' },
  escalation: { Icon: AlarmOutlinedIcon, fg: 'gb.bad', bg: 'gb.badSoft' },
  material_in: { Icon: Inventory2OutlinedIcon, fg: 'gb.ok', bg: 'gb.okSoft' },
  material_approval: { Icon: Inventory2OutlinedIcon, fg: 'gb.accentInk', bg: 'gb.accent' },
  material_decision: { Icon: CheckCircleOutlineIcon, fg: 'gb.ok', bg: 'gb.okSoft' },
  material_disputed: { Icon: ReportProblemOutlinedIcon, fg: 'gb.bad', bg: 'gb.badSoft' },
  key_issued: { Icon: KeyOutlinedIcon, fg: 'gb.accentInk', bg: 'gb.accent' },
  incident_assigned: { Icon: ReportProblemOutlinedIcon, fg: 'gb.accentInk', bg: 'gb.accent' },
  incident_update: { Icon: ReportProblemOutlinedIcon, fg: 'gb.warn', bg: 'gb.warnSoft' },
  incident_closed: { Icon: CheckCircleOutlineIcon, fg: 'gb.ok', bg: 'gb.okSoft' },
};
const FALLBACK = { Icon: NotificationsNoneOutlinedIcon, fg: 'gb.muted', bg: 'gb.sunk' };

function NotificationRow({ n, now, onOpen }) {
  const unread = !n.readAt;
  const { Icon, emoji, fg, bg } = EVENT[n.event] ?? FALLBACK;
  return (
    <ButtonBase
      onClick={() => onOpen(n)}
      aria-label={`${unread ? 'Unread: ' : ''}${n.title}`}
      sx={(theme) => ({
        display: 'block',
        width: '100%',
        textAlign: 'left',
        borderRadius: '10px',
        border: `1px solid ${unread ? theme.vars.palette.gb.accent : theme.vars.palette.gb.line}`,
        bgcolor: unread ? theme.vars.palette.gb.accentSoft : theme.vars.palette.gb.surface,
        p: { xs: 1.5, md: 2 },
        transition: 'border-color .15s',
        '&:hover': { borderColor: theme.vars.palette.gb.muted },
        '&:focus-visible': { outline: `2px solid ${theme.vars.palette.gb.accent}`, outlineOffset: 2 },
      })}
    >
      <Grid container spacing={1.5} sx={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
        <Grid size="auto">
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              bgcolor: bg,
              color: fg,
              display: 'grid',
              placeItems: 'center',
            }}
          >
            {emoji ? (
              <Box component="span" aria-hidden sx={{ fontSize: 20, lineHeight: 1 }}>
                {emoji}
              </Box>
            ) : (
              <Icon fontSize="small" />
            )}
          </Box>
        </Grid>
        <Grid size="grow" sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, lineHeight: 1.3, wordBreak: 'break-word' }}>{n.title}</Typography>
          {n.body ? (
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.25, wordBreak: 'break-word' }}>
              {n.body}
            </Typography>
          ) : null}
        </Grid>
        <Grid size="auto">
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Typography sx={{ fontFamily: fonts.mono, fontSize: 12, color: 'text.secondary', whiteSpace: 'nowrap' }}>
              {fmtRelative(n.createdAt, now)}
            </Typography>
            {unread ? (
              <Box aria-hidden sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: 'gb.accent', flexShrink: 0 }} />
            ) : null}
          </Stack>
        </Grid>
      </Grid>
    </ButtonBase>
  );
}

/** `/notifications`: All · Unread tabs in the URL (`?tab=unread`), newest first, "Load more". */
export function NotificationsPage() {
  const now = useNow();
  const toast = useToast();
  const user = useUser();
  const { openDetails } = useMailUi();
  const { openDetails: openVisit } = useVisitUi();
  const navigate = useNavigate();
  const { openDetail: openMaterial } = useMaterialUi();
  const { unreadCount, markRead, markAllRead } = useNotifications();
  const { params, setParams } = useUrlListParams(DEFAULTS);
  const unreadTab = params.tab === 'unread';
  const query = useMemo(
    () => ({ unread: unreadTab ? 'true' : undefined, sort: '-createdAt', limit: params.limit }),
    [unreadTab, params.limit],
  );
  const list = usePaginatedQuery(notificationsApi.list, query, { append: true });
  const [opening, setOpening] = useState(null);

  // New notifications go on top; reads elsewhere (other tabs/devices, or here) update the rows.
  useRealtimeEvent('notification:new', ({ notification }) => {
    if (notification) list.prepend(notification);
  });
  useRealtimeEvent('notification:read', ({ ids }) => {
    const at = new Date().toISOString();
    const set = ids === 'all' ? null : new Set(ids ?? []);
    list.mapData((n) => (!n.readAt && (!set || set.has(n.id)) ? { ...n, readAt: at } : n));
  });
  useRealtimeEvent('reconnect', list.refresh);

  const open = async (n) => {
    if (!n.readAt) markRead(n.id); // optimistic; also flips the row via the local notification:read event
    const { type, id } = n.data ?? {};
    if (type === 'expected' && id) {
      navigate(`/expected?q=${encodeURIComponent(id)}`);
      return;
    }
    if (type === 'material' && id) {
      openMaterial(id);
      return;
    }
    if (type === 'incident' && id) {
      navigate(`/incidents?open=${encodeURIComponent(id)}`);
      return;
    }
    if (type === 'patrol') {
      navigate('/patrol');
      return;
    }
    if (type === 'gen') {
      navigate('/generator');
      return;
    }
    if (type === 'key') {
      if (isGateUser(user)) navigate('/keys?tab=diary');
      return;
    }
    if ((type !== 'mail' && type !== 'visit') || !id) return;
    setOpening(n.id);
    try {
      if (type === 'mail') openDetails(await mailApi.get(id));
      // Gate users open the visit; a host opens their own visitor (the gate endpoints are 403 for them).
      else openVisit(isGateUser(user) ? await visitsApi.get(id) : await visitsApi.getMine(id));
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      setOpening(null);
    }
  };

  const allRead = async () => {
    if (await markAllRead()) toast('All notifications marked read');
  };

  const unread = unreadCount ?? list.extra.unreadCount ?? 0;
  const total = list.pagination.total;

  return (
    <>
      <PageHeader
        eyebrow="Inbox"
        title="Notifications"
        right={
          unread > 0 ? (
            <Button variant="outlined" startIcon={<DoneAllIcon />} onClick={allRead}>
              Mark all read
            </Button>
          ) : null
        }
      />

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 10, xl: 8 }}>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={unreadTab ? 'unread' : 'all'}
            onChange={(_, v) => v && setParams({ tab: v })}
            aria-label="Show"
            sx={{ mb: 2 }}
          >
            <ToggleButton value="all">All</ToggleButton>
            <ToggleButton value="unread">
              Unread
              <Box component="span" sx={{ ml: 0.75, fontFamily: fonts.mono, fontWeight: 500 }}>
                ({unread})
              </Box>
            </ToggleButton>
          </ToggleButtonGroup>

          {list.error ? (
            <Alert severity="error" sx={{ mb: 2 }} action={<Button onClick={list.refresh}>Retry</Button>}>
              {list.error}
            </Alert>
          ) : null}

          {list.loading && list.data.length === 0 ? (
            <Box sx={{ py: 6, display: 'grid', placeItems: 'center' }}>
              <CircularProgress />
            </Box>
          ) : list.data.length === 0 && !list.error ? (
            unreadTab ? (
              <EmptyState title="All caught up" text="You're all caught up." />
            ) : (
              <EmptyState title="No notifications yet" text="You'll see post and alerts for you here." />
            )
          ) : (
            <Box sx={{ opacity: list.loading ? 0.6 : 1, transition: 'opacity .15s' }}>
              <Grid container spacing={1}>
                {list.data.map((n) => (
                  <Grid key={n.id} size={12} sx={{ opacity: opening === n.id ? 0.6 : 1 }}>
                    <NotificationRow n={n} now={now} onOpen={open} />
                  </Grid>
                ))}
              </Grid>
              {list.pagination.hasNextPage ? (
                <Box sx={{ textAlign: 'center', mt: 2.5 }}>
                  <Button variant="outlined" size="large" onClick={list.loadMore} disabled={list.loadingMore}>
                    {list.loadingMore ? 'Loading…' : `Load more · ${total - list.data.length} more`}
                  </Button>
                </Box>
              ) : null}
            </Box>
          )}
        </Grid>
      </Grid>
    </>
  );
}
