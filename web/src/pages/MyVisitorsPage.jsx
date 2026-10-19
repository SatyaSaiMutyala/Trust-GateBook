import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useCallback, useMemo, useState } from 'react';
import { visitsApi } from '../api/endpoints';
import { useUser } from '../auth/context';
import { EmptyState, FillThumb, PageHeader, PassBadge } from '../components/bits';
import { HostRespond } from '../components/HostRespond';
import { VisitorCard } from '../components/VisitorCard';
import { useNow } from '../hooks';
import { usePaginatedQuery } from '../hooks/usePaginatedQuery';
import { useRealtimeEvent, useVisitChanges } from '../realtime/context';
import { useSettings, useVisitUi } from '../state/context';
import { fonts } from '../theme/tokens';
import { fmtDuration, fmtTime } from '../utils/format';
import { visitStatus } from '../utils/visit';

function SectionTitle({ children, count }) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1.5, mt: 1 }}>
      <Typography variant="h3">{children}</Typography>
      {count ? <Chip size="small" variant="pending" label={count} sx={{ fontFamily: fonts.mono }} /> : null}
    </Stack>
  );
}

function LoadMore({ list }) {
  if (!list.pagination.hasNextPage) return null;
  return (
    <Box sx={{ textAlign: 'center', mt: 2 }}>
      <Button variant="outlined" onClick={list.loadMore} disabled={list.loadingMore}>
        {list.loadingMore ? 'Loading…' : `Load more · ${list.pagination.total - list.data.length} more`}
      </Button>
    </Box>
  );
}

/** A visitor waiting at the gate for my answer: big photo, who they are, then Accept / Decline. */
function WaitingCard({ visit: v, now, note, onNote }) {
  const { openDetails } = useVisitUi();
  const from = [v.company, v.purpose, v.persons > 1 ? `${v.persons} persons` : ''].filter(Boolean).join(' · ');
  return (
    <Paper variant="outlined" sx={{ p: { xs: 1.5, md: 2 }, borderColor: 'gb.accent', borderWidth: 2 }}>
      <Grid container spacing={2}>
        <Grid size={{ xs: 4, sm: 3 }}>
          <ButtonBase
            onClick={() => openDetails(v)}
            aria-label="Open visitor details"
            sx={{ width: '100%', aspectRatio: '3 / 4', borderRadius: 1, overflow: 'hidden' }}
          >
            <FillThumb src={v.photoUrl} name={v.name} />
          </ButtonBase>
        </Grid>
        <Grid size={{ xs: 8, sm: 9 }} sx={{ minWidth: 0 }}>
          <Typography variant="h2" sx={{ fontSize: { xs: '1.35rem', md: '1.7rem' }, wordBreak: 'break-word' }}>
            {v.name}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            {from || 'No company given'}
          </Typography>
          <Stack direction="row" sx={{ mt: 1, alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <PassBadge badge={v.badge} />
            <Typography variant="body2">
              Arrived <b>{fmtTime(v.inAt)}</b> ·{' '}
              <Box component="span" sx={{ color: 'warning.main', fontFamily: fonts.mono }}>
                waiting {fmtDuration(v.inAt, null, now)}
              </Box>
            </Typography>
          </Stack>
          {v.items ? (
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              Carrying: {v.items}
            </Typography>
          ) : null}
          {v.escalatedAt ? (
            <Typography variant="body2" sx={{ mt: 0.5, color: 'warning.main' }}>
              Security has been asked to call you.
            </Typography>
          ) : null}
        </Grid>
        <Grid size={12}>
          <HostRespond visit={v} note={note} onNote={onNote} onDone={() => onNote('')} />
        </Grid>
      </Grid>
    </Paper>
  );
}

/**
 * My visitors (any user who can receive visitors): waiting for my answer · visiting me now · earlier.
 * Each section is its own paginated `GET /api/visits/mine?scope=…`; live visit events refresh them.
 */
export function MyVisitorsPage() {
  const user = useUser();
  const now = useNow();
  const { settings } = useSettings();
  const { openDetails } = useVisitUi();
  // Typed messages to security live here (by visit id), so live refreshes never wipe them.
  const [notes, setNotes] = useState({});

  const waitingQ = useMemo(() => ({ scope: 'waiting', limit: 10 }), []);
  const currentQ = useMemo(() => ({ scope: 'current', limit: 10 }), []);
  const earlierQ = useMemo(() => ({ scope: 'earlier', limit: 10 }), []);
  const waiting = usePaginatedQuery(visitsApi.mine, waitingQ, { append: true });
  const current = usePaginatedQuery(visitsApi.mine, currentQ, { append: true });
  const earlier = usePaginatedQuery(visitsApi.mine, earlierQ, { append: true });

  const { refresh: r1 } = waiting;
  const { refresh: r2 } = current;
  const { refresh: r3 } = earlier;
  const refreshAll = useCallback(() => {
    r1();
    r2();
    r3();
  }, [r1, r2, r3]);
  useVisitChanges(refreshAll, 400);
  useRealtimeEvent('visit:updated', ({ visit }) => {
    if (visit.hostId !== user.id) return;
    waiting.patch(visit, !visit.outAt && visit.hostStatus === 'waiting');
    current.patch(visit, !visit.outAt && visit.hostStatus !== 'waiting');
    earlier.patch(visit, !!visit.outAt);
  });

  const firstLoad = waiting.loading && current.loading && earlier.loading;
  const error = waiting.error || current.error || earlier.error;

  return (
    <>
      <PageHeader eyebrow={`Host desk · ${user.name}`} title="My visitors" />
      {error ? (
        <Alert severity="error" sx={{ mb: 2 }} action={<Button onClick={refreshAll}>Retry</Button>}>
          {error}
        </Alert>
      ) : null}
      {firstLoad ? (
        <Box sx={{ py: 6, display: 'grid', placeItems: 'center' }}>
          <CircularProgress />
        </Box>
      ) : (
        <Grid container spacing={3}>
          <Grid size={12}>
            <SectionTitle count={waiting.pagination.total}>Waiting at the gate</SectionTitle>
            {waiting.data.length === 0 && !waiting.loading ? (
              <EmptyState
                title="No one waiting"
                text="When security checks someone in for you, they appear here and you get a notification. Accept or decline from here or from your phone."
              />
            ) : (
              <Grid container spacing={1.5}>
                {waiting.data.map((v) => (
                  <Grid key={v.id} size={{ xs: 12, lg: 6 }}>
                    <WaitingCard
                      visit={v}
                      now={now}
                      note={notes[v.id] ?? ''}
                      onNote={(t) => setNotes((n) => ({ ...n, [v.id]: t }))}
                    />
                  </Grid>
                ))}
              </Grid>
            )}
            <LoadMore list={waiting} />
          </Grid>

          {current.data.length ? (
            <Grid size={12}>
              <SectionTitle>Visiting you now</SectionTitle>
              <Grid container spacing={1.5}>
                {current.data.map((v) => (
                  <Grid key={v.id} size={{ xs: 12, lg: 6 }}>
                    <VisitorCard
                      visit={v}
                      now={now}
                      status={visitStatus(v, settings?.overstayHours, now)}
                      onOpen={() => openDetails(v)}
                    />
                  </Grid>
                ))}
              </Grid>
              <LoadMore list={current} />
            </Grid>
          ) : null}

          {earlier.data.length ? (
            <Grid size={12}>
              <SectionTitle>Earlier visitors</SectionTitle>
              <Grid container spacing={1.5}>
                {earlier.data.map((v) => (
                  <Grid key={v.id} size={{ xs: 12, lg: 6 }}>
                    <VisitorCard
                      visit={v}
                      now={now}
                      logMode
                      status={visitStatus(v, settings?.overstayHours, now)}
                      onOpen={() => openDetails(v)}
                    />
                  </Grid>
                ))}
              </Grid>
              <LoadMore list={earlier} />
            </Grid>
          ) : null}
        </Grid>
      )}
    </>
  );
}
