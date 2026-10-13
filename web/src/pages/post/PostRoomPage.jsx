import AddIcon from '@mui/icons-material/Add';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import SearchIcon from '@mui/icons-material/Search';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Grid from '@mui/material/Grid';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { errorMessage } from '../../api/client';
import { mailApi } from '../../api/endpoints';
import { useUser } from '../../auth/context';
import { canOperate } from '../../auth/roles';
import { EmptyState, PageHeader } from '../../components/bits';
import { MailCard } from '../../components/mail/MailCard';
import { useNow } from '../../hooks';
import { usePaginatedQuery } from '../../hooks/usePaginatedQuery';
import { useUrlListParams } from '../../hooks/useUrlListParams';
import { useMailChanges, useRealtimeEvent } from '../../realtime/context';
import { useToast } from '../../state/context';
import { fonts } from '../../theme/tokens';
import { addDays, startOfLocalDay, toLocalDateInput } from '../../utils/format';
import { MAIL_PERIODS, MAIL_TABS } from '../../utils/mail';

const DEFAULTS = { tab: 'collect', period: 'today', q: '', limit: 20 };

const EMPTY = {
  collect: { title: 'Nothing waiting', text: 'Every item logged here stays in this list until it is handed over.' },
  awaiting: {
    title: 'Nothing pending',
    text: 'Items handed over stay here until the receiver confirms on their phone.',
  },
  issues: { title: 'No issues', text: 'If a receiver says they did not get an item, it shows here.' },
  all: { title: 'No items', text: 'Nothing logged in this period.' },
};

/** Tab, period and search live in the URL (`?tab=issues&period=30d&q=…`); cards page with "Load more". */
export function PostRoomPage() {
  const user = useUser();
  const navigate = useNavigate();
  const toast = useToast();
  const now = useNow();
  const { params, setParams, search, setSearch } = useUrlListParams(DEFAULTS);
  const tab = MAIL_TABS.find((t) => t.value === params.tab) ?? MAIL_TABS[0];

  const filters = useMemo(() => {
    const period = MAIL_PERIODS.find((p) => p.value === params.period) ?? MAIL_PERIODS[0];
    return {
      status: tab.status,
      from: tab.value === 'all' ? addDays(startOfLocalDay(), -period.days).toISOString() : undefined,
      q: params.q || undefined,
      sort: tab.sort,
    };
  }, [tab, params.period, params.q]);
  const query = useMemo(() => ({ ...filters, limit: params.limit }), [filters, params.limit]);
  const list = usePaginatedQuery(mailApi.list, query, { append: true });

  useRealtimeEvent('mail:updated', ({ item }) => {
    const fits = !tab.status || tab.status === item.status;
    list.patch(item, fits);
  });
  useMailChanges(list.refresh, 500);

  const [exporting, setExporting] = useState(false);
  const exportCsv = async () => {
    setExporting(true);
    try {
      const { blob, filename } = await mailApi.exportCsv(filters);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename ?? `post-register-${toLocalDateInput(new Date())}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      setExporting(false);
    }
  };

  const counts = list.extra.counts;
  const total = list.pagination.total;
  const empty = EMPTY[tab.value];

  return (
    <>
      <PageHeader
        eyebrow="Incoming mail & parcels"
        title="Post room"
        right={
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              startIcon={<FileDownloadOutlinedIcon />}
              onClick={exportCsv}
              disabled={exporting}
            >
              {exporting ? 'Exporting…' : 'Export CSV'}
            </Button>
            {canOperate(user) ? (
              <Button variant="contained" color="primary" startIcon={<AddIcon />} onClick={() => navigate('/post/new')}>
                Log new item
              </Button>
            ) : null}
          </Stack>
        }
      />

      <Paper variant="outlined" sx={{ p: { xs: 1.5, md: 2 }, mb: 2 }}>
        <Grid container spacing={1.5} sx={{ alignItems: 'center' }}>
          <Grid size={{ xs: 12, lg: 'auto' }}>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={tab.value}
              onChange={(_, v) => v && setParams({ tab: v })}
              aria-label="Post room view"
              sx={{
                flexWrap: 'wrap',
                width: { xs: '100%', lg: 'auto' },
                '& .MuiToggleButton-root': { flex: { xs: '1 1 45%', sm: 1, lg: 'none' } },
              }}
            >
              {MAIL_TABS.map((t) => (
                <ToggleButton key={t.value} value={t.value}>
                  {t.label}
                  {t.count && counts ? (
                    <Box
                      component="span"
                      sx={{
                        ml: 0.75,
                        fontFamily: fonts.mono,
                        fontWeight: 500,
                        color: t.value === 'issues' && counts.disputed > 0 ? 'error.main' : 'inherit',
                      }}
                    >
                      ({counts[t.count]})
                    </Box>
                  ) : null}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Grid>
          {tab.value === 'all' ? (
            <Grid size={{ xs: 12, sm: 4, lg: 2 }}>
              <TextField
                select
                value={params.period}
                onChange={(e) => setParams({ period: e.target.value })}
                slotProps={{ htmlInput: { 'aria-label': 'Period' } }}
              >
                {MAIL_PERIODS.map((p) => (
                  <MenuItem key={p.value} value={p.value}>
                    {p.label}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
          ) : null}
          <Grid size={{ xs: 12, sm: tab.value === 'all' ? 8 : 12, lg: 'grow' }}>
            <TextField
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, sender, ref no…"
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                },
                htmlInput: { type: 'search', 'aria-label': 'Search post' },
              }}
            />
          </Grid>
        </Grid>
      </Paper>

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
        params.q ? (
          <EmptyState title="No match" text="Try a different name, sender or reference number." />
        ) : (
          <EmptyState
            title={empty.title}
            text={empty.text}
            action={
              tab.value === 'collect' && canOperate(user) ? (
                <Button variant="contained" color="primary" size="large" onClick={() => navigate('/post/new')}>
                  Log new item
                </Button>
              ) : null
            }
          />
        )
      ) : (
        <Box sx={{ opacity: list.loading ? 0.6 : 1, transition: 'opacity .15s' }}>
          <Grid container spacing={1.5}>
            {list.data.map((m) => (
              <Grid key={m.id} size={{ xs: 12, xl: 6 }}>
                <MailCard item={m} now={now} />
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
