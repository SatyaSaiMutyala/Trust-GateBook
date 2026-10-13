import BarChartIcon from '@mui/icons-material/BarChart';
import SearchIcon from '@mui/icons-material/Search';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Grid from '@mui/material/Grid';
import InputAdornment from '@mui/material/InputAdornment';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { visitsApi } from '../api/endpoints';
import { useUser } from '../auth/context';
import { canOperate } from '../auth/roles';
import { EmptyState, PageHeader } from '../components/bits';
import { VisitorCard } from '../components/VisitorCard';
import { useNow } from '../hooks';
import { usePaginatedQuery } from '../hooks/usePaginatedQuery';
import { useUrlListParams } from '../hooks/useUrlListParams';
import { useRealtimeEvent, useVisitChanges } from '../realtime/context';
import { useSettings, useVisitUi } from '../state/context';
import { plural } from '../utils/format';
import { visitStatus } from '../utils/visit';

const DEFAULTS = { q: '', overstay: '', limit: 20, sort: 'inAt' };
/** Signed photo URLs last an hour; reload well before. */
const URL_REFRESH_MS = 15 * 60 * 1000;

export function InsideNowPage() {
  const user = useUser();
  const navigate = useNavigate();
  const { settings } = useSettings();
  const { openDetails, openExit } = useVisitUi();
  const now = useNow();
  const { params, setParams, search, setSearch } = useUrlListParams(DEFAULTS);

  const query = useMemo(
    () => ({
      q: params.q || undefined,
      overstay: params.overstay === 'true' ? 'true' : undefined,
      limit: params.limit,
      sort: params.sort,
    }),
    [params.q, params.overstay, params.limit, params.sort],
  );
  const list = usePaginatedQuery(visitsApi.inside, query, { append: true });

  // Patch loaded cards in place (exits drop out); anything else refreshes page 1 without losing loaded pages.
  useRealtimeEvent('visit:updated', ({ visit }) => {
    if (visit.outAt) list.patch(visit, false);
    else list.patch(visit, true);
  });
  useVisitChanges(list.refresh, 500);
  const { refresh } = list;
  useEffect(() => {
    const t = setInterval(refresh, URL_REFRESH_MS);
    return () => clearInterval(t);
  }, [refresh]);

  const overstayOnly = params.overstay === 'true';
  const total = list.pagination.total;
  const searching = !!params.q;

  return (
    <>
      <PageHeader
        eyebrow="Register"
        title="Inside now"
        right={
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <Typography variant="mono" sx={{ fontSize: 15, color: 'text.secondary' }}>
              {list.loading ? '…' : plural(total, 'visitor')}
            </Typography>
            <Button variant="outlined" size="small" startIcon={<BarChartIcon />} onClick={() => navigate('/overview')}>
              Today
            </Button>
          </Stack>
        }
      />

      <Grid container spacing={1.5} sx={{ mb: 2, alignItems: 'center' }}>
        <Grid size={{ xs: 12, sm: 8, md: 6, lg: 5 }}>
          <TextField
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, phone, pass…"
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              },
              htmlInput: { 'aria-label': 'Search inside now', type: 'search' },
            }}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 4, md: 'auto' }}>
          <Chip
            label={`Overstay only${settings ? ` (> ${settings.overstayHours} h)` : ''}`}
            clickable
            onClick={() => setParams({ overstay: overstayOnly ? '' : 'true' })}
            variant={overstayOnly ? 'overstay' : 'outlined'}
            sx={{ height: 40, px: 0.5, bgcolor: overstayOnly ? undefined : 'background.paper' }}
          />
        </Grid>
      </Grid>

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
        searching || overstayOnly ? (
          <EmptyState
            title="No match"
            text={
              overstayOnly && !searching
                ? 'No one is past the overstay limit.'
                : 'Try a different name, number or pass.'
            }
          />
        ) : (
          <EmptyState
            title="Nobody inside"
            text="Visitors appear here as soon as they are checked in, and leave this list when their exit is recorded."
            action={
              <Button variant="contained" color="primary" size="large" onClick={() => navigate('/check-in')}>
                Check in a visitor
              </Button>
            }
          />
        )
      ) : (
        <Box sx={{ opacity: list.loading ? 0.6 : 1, transition: 'opacity .15s' }}>
          <Grid container spacing={1.5}>
            {list.data.map((v) => (
              <Grid key={v.id} size={{ xs: 12, xl: 6 }}>
                <VisitorCard
                  visit={v}
                  now={now}
                  status={visitStatus(v, settings?.overstayHours, now)}
                  onOpen={() => openDetails(v)}
                  onExit={canOperate(user) ? () => openExit(v) : undefined}
                />
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
    </>
  );
}
