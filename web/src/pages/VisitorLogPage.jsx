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
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TablePagination from '@mui/material/TablePagination';
import TableRow from '@mui/material/TableRow';
import TableSortLabel from '@mui/material/TableSortLabel';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { useMemo, useState } from 'react';
import { errorMessage } from '../api/client';
import { visitsApi } from '../api/endpoints';
import { EmptyState, PageHeader, PassBadge, StatusChip, VisitorThumb } from '../components/bits';
import { VisitorCard } from '../components/VisitorCard';
import { useIsDesktop, useNow } from '../hooks';
import { usePaginatedQuery } from '../hooks/usePaginatedQuery';
import { nextSort, PAGE_SIZES, useUrlListParams } from '../hooks/useUrlListParams';
import { useRealtimeEvent, useVisitChanges } from '../realtime/context';
import { useSettings, useToast, useVisitUi } from '../state/context';
import { fonts } from '../theme/tokens';
import {
  addDays,
  fmtDate,
  fmtDuration,
  fmtTime,
  parseLocalDate,
  plural,
  startOfLocalDay,
  toLocalDateInput,
} from '../utils/format';
import { hostReplyText, passNotReturned, visitStatus } from '../utils/visit';

const RANGES = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: 'dates', label: 'Dates' },
];
const STATUSES = [
  { value: 'all', label: 'All statuses' },
  { value: 'in', label: 'Inside' },
  { value: 'out', label: 'Exited' },
  { value: 'over', label: 'Overstay' },
  { value: 'waiting', label: 'Waiting at gate' },
  { value: 'declined', label: 'Host declined' },
  { value: 'noreply', label: 'Host did not reply' },
];

const DEFAULTS = { range: 'today', from: '', to: '', status: 'all', q: '', sort: '-inAt', page: 1, limit: 20 };

/** Range → { from, to } ISO (local days; `to` exclusive). */
function rangeBounds(range, fromStr, toStr) {
  const today = startOfLocalDay();
  switch (range) {
    case 'yesterday':
      return { from: addDays(today, -1), to: today };
    case '7d':
      return { from: addDays(today, -6), to: addDays(today, 1) };
    case '30d':
      return { from: addDays(today, -29), to: addDays(today, 1) };
    case 'dates': {
      const f = parseLocalDate(fromStr) ?? today;
      const t = parseLocalDate(toStr) ?? f;
      return { from: f, to: addDays(t < f ? f : t, 1) };
    }
    default:
      return { from: today, to: addDays(today, 1) };
  }
}

export function VisitorLogPage() {
  const desktop = useIsDesktop();
  const now = useNow();
  const toast = useToast();
  const { settings } = useSettings();
  const { openDetails } = useVisitUi();

  const { params, setParams, search, setSearch, setPage, setLimit, setSort } = useUrlListParams(DEFAULTS);

  const filters = useMemo(() => {
    const { from, to } = rangeBounds(params.range, params.from, params.to);
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      status: params.status,
      q: params.q || undefined,
      sort: params.sort,
    };
  }, [params.range, params.from, params.to, params.status, params.q, params.sort]);

  const query = useMemo(
    () => ({ ...filters, page: params.page, limit: params.limit }),
    [filters, params.page, params.limit],
  );
  const list = usePaginatedQuery(visitsApi.list, query, { append: !desktop });

  useRealtimeEvent('visit:updated', ({ visit }) => list.patch(visit));
  useVisitChanges(list.refresh, 600);

  const [exporting, setExporting] = useState(false);
  const exportCsv = async () => {
    setExporting(true);
    try {
      const { blob, filename } = await visitsApi.exportCsv(filters);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename ?? `visitor-log-${toLocalDateInput(new Date())}.csv`;
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

  const total = list.pagination.total;
  const summary = list.extra.summary;

  const sortHeader = (field, label, firstDir = 'asc') => {
    const active = params.sort.replace(/^-/, '') === field;
    return (
      <TableSortLabel
        active={active}
        direction={active && params.sort.startsWith('-') ? 'desc' : 'asc'}
        onClick={() => setSort(nextSort(params.sort, field, firstDir))}
      >
        {label}
      </TableSortLabel>
    );
  };

  return (
    <>
      <PageHeader
        eyebrow="Register"
        title="Visitor log"
        right={
          <Button variant="outlined" startIcon={<FileDownloadOutlinedIcon />} onClick={exportCsv} disabled={exporting}>
            {exporting ? 'Exporting…' : 'Export CSV'}
          </Button>
        }
      />

      <Paper variant="outlined" sx={{ p: { xs: 1.5, md: 2 }, mb: 2 }}>
        <Grid container spacing={1.5} sx={{ alignItems: 'flex-end' }}>
          <Grid size={{ xs: 12, lg: 'auto' }}>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={params.range}
              onChange={(_, v) => v && setParams({ range: v })}
              sx={{
                flexWrap: 'wrap',
                width: { xs: '100%', lg: 'auto' },
                '& .MuiToggleButton-root': { flex: { xs: 1, lg: 'none' } },
              }}
              aria-label="Date range"
            >
              {RANGES.map((r) => (
                <ToggleButton key={r.value} value={r.value}>
                  {r.label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Grid>
          {params.range === 'dates' ? (
            <>
              <Grid size={{ xs: 6, sm: 3, lg: 2 }}>
                <TextField
                  type="date"
                  label="From"
                  value={params.from || toLocalDateInput(new Date())}
                  onChange={(e) => setParams({ from: e.target.value })}
                />
              </Grid>
              <Grid size={{ xs: 6, sm: 3, lg: 2 }}>
                <TextField
                  type="date"
                  label="To"
                  value={params.to || params.from || toLocalDateInput(new Date())}
                  onChange={(e) => setParams({ to: e.target.value })}
                />
              </Grid>
            </>
          ) : null}
          <Grid size={{ xs: 12, sm: 4, lg: 2 }}>
            <TextField
              select
              label="Status"
              value={params.status}
              onChange={(e) => setParams({ status: e.target.value })}
            >
              {STATUSES.map((s) => (
                <MenuItem key={s.value} value={s.value}>
                  {s.label}
                </MenuItem>
              ))}
            </TextField>
          </Grid>

          <Grid size={{ xs: 12, sm: 8, lg: 'grow' }}>
            <TextField
              label="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, phone, pass, company…"
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                },
                htmlInput: { type: 'search' },
              }}
            />
          </Grid>
        </Grid>
      </Paper>

      <Typography sx={{ mb: 1.5, color: 'text.secondary', fontWeight: 500 }}>
        {list.loading && !summary
          ? 'Loading…'
          : `${plural(total, 'entry', 'entries')} · ${plural(summary?.persons ?? 0, 'person')} · ${(summary?.inside ?? 0).toLocaleString('en-IN')} still inside`}
      </Typography>

      {list.error ? (
        <Alert severity="error" sx={{ mb: 2 }} action={<Button onClick={list.refresh}>Retry</Button>}>
          {list.error}
        </Alert>
      ) : null}

      {list.loading && list.data.length === 0 ? (
        <Box sx={{ py: 6, display: 'grid', placeItems: 'center' }}>
          <CircularProgress />
        </Box>
      ) : !list.loading && list.data.length === 0 && !list.error && total === 0 ? (
        <EmptyState
          title="No entries"
          text="Nothing matches these filters. Try a wider date range or a different search."
        />
      ) : desktop ? (
        <Paper
          variant="outlined"
          sx={{ overflow: 'hidden', opacity: list.loading ? 0.6 : 1, transition: 'opacity .15s' }}
        >
          <TableContainer>
            <Table size="small" sx={{ minWidth: 1000 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 56 }} />
                  <TableCell>{sortHeader('badge', 'Pass no.')}</TableCell>
                  <TableCell>{sortHeader('name', 'Visitor')}</TableCell>
                  <TableCell>Coming from</TableCell>
                  <TableCell>Purpose</TableCell>
                  <TableCell>Meeting</TableCell>
                  <TableCell>{sortHeader('inAt', 'In', 'desc')}</TableCell>
                  <TableCell>{sortHeader('outAt', 'Out', 'desc')}</TableCell>
                  <TableCell>Duration</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {list.data.map((v) => (
                  <TableRow key={v.id} hover onClick={() => openDetails(v)} sx={{ cursor: 'pointer' }}>
                    <TableCell>
                      <VisitorThumb src={v.photoUrl} name={v.name} size={40} />
                    </TableCell>
                    <TableCell>
                      <PassBadge badge={v.badge} />
                      {passNotReturned(v) ? (
                        <Typography sx={{ color: 'error.main', fontSize: 12, fontWeight: 600, mt: 0.25 }}>
                          Not returned
                        </Typography>
                      ) : null}
                    </TableCell>
                    <TableCell sx={{ maxWidth: 220 }}>
                      <Typography sx={{ fontWeight: 600 }} noWrap>
                        {v.name}
                      </Typography>
                      <Typography sx={{ fontFamily: fonts.mono, fontSize: 12, color: 'text.secondary' }} noWrap>
                        {v.phone} · {v.pass}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ maxWidth: 160 }}>
                      <Typography variant="body2" noWrap>
                        {v.company || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{v.purpose}</Typography>
                      {v.persons > 1 ? (
                        <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{v.persons} persons</Typography>
                      ) : null}
                    </TableCell>
                    <TableCell sx={{ maxWidth: 180 }}>
                      <Typography variant="body2" noWrap>
                        {v.host}
                      </Typography>
                      {v.dept ? (
                        <Typography sx={{ fontSize: 12, color: 'text.secondary' }} noWrap>
                          {v.dept}
                        </Typography>
                      ) : null}
                      {v.hostStatus === 'manual' && v.allowedAt ? null : (
                        <Typography
                          sx={{
                            fontSize: 12,
                            color: v.hostStatus === 'declined' || v.escalatedAt ? 'error.main' : 'text.secondary',
                          }}
                          noWrap
                        >
                          {hostReplyText(v)}
                          {v.hostVia === 'app' && v.hostAt ? ` in ${fmtDuration(v.inAt, v.hostAt)}` : ''}
                        </Typography>
                      )}
                    </TableCell>

                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <Typography sx={{ fontFamily: fonts.mono, fontSize: 13 }}>{fmtTime(v.inAt)}</Typography>
                      <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{fmtDate(v.inAt)}</Typography>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap', fontFamily: fonts.mono, fontSize: 13 }}>
                      {v.outAt ? fmtTime(v.outAt) : '—'}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap', fontFamily: fonts.mono, fontSize: 13 }}>
                      {fmtDuration(v.inAt, v.outAt, now)}
                    </TableCell>
                    <TableCell>
                      <StatusChip status={visitStatus(v, settings?.overstayHours, now)} size="small" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={total}
            page={Math.max(0, Math.min(params.page - 1, Math.max(0, list.pagination.totalPages - 1)))}
            onPageChange={(_, p) => setPage(p + 1)}
            rowsPerPage={params.limit}
            rowsPerPageOptions={PAGE_SIZES}
            onRowsPerPageChange={(e) => setLimit(Number(e.target.value))}
            sx={{ borderTop: 1, borderColor: 'divider' }}
          />
        </Paper>
      ) : (
        <Box sx={{ opacity: list.loading ? 0.6 : 1 }}>
          <Grid container spacing={1.25}>
            {list.data.map((v) => (
              <Grid key={v.id} size={12}>
                <VisitorCard
                  visit={v}
                  now={now}
                  status={visitStatus(v, settings?.overstayHours, now)}
                  logMode
                  onOpen={() => openDetails(v)}
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
