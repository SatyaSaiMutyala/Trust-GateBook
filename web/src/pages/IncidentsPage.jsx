import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import PhotoCameraOutlinedIcon from '@mui/icons-material/PhotoCameraOutlined';
import SearchIcon from '@mui/icons-material/Search';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import CircularProgress from '@mui/material/CircularProgress';
import Grid from '@mui/material/Grid';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { errorMessage } from '../api/client';
import { incidentsApi } from '../api/endpoints';
import { useUser } from '../auth/context';
import { isGateUser } from '../auth/roles';
import { EmptyState, PageHeader } from '../components/bits';
import { IncidentSheets, SeverityChip, StatusPill } from '../components/incidents/IncidentSheets';
import { useNow } from '../hooks';
import { usePaginatedQuery } from '../hooks/usePaginatedQuery';
import { useUrlListParams } from '../hooks/useUrlListParams';
import { useIncidentChanges, useRealtimeEvent } from '../realtime/context';
import { useToast } from '../state/context';
import { fonts } from '../theme/tokens';
import { fmtRelative } from '../utils/format';
import { SEVERITIES, SEVERITY_TONE } from '../utils/incidents';

const DEFAULTS = { tab: 'open', severity: '', q: '', limit: 20 };

/** One incident in the list. */
function IncidentCard({ i, now, onOpen }) {
  const tone = SEVERITY_TONE[i.severity] ?? SEVERITY_TONE.low;
  return (
    <Paper variant="outlined" sx={{ display: 'flex', overflow: 'hidden' }}>
      <Box sx={{ width: 6, flexShrink: 0, bgcolor: i.status === 'closed' ? 'divider' : tone.bg }} />
      <ButtonBase
        onClick={() => onOpen(i)}
        aria-label={`Open incident ${i.id}`}
        sx={{ flex: 1, minWidth: 0, p: 1.5, display: 'block', textAlign: 'left' }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
          <Typography sx={{ fontWeight: 700 }}>{i.type}</Typography>
          <SeverityChip severity={i.severity} />
          <StatusPill status={i.status} />
          {i.photoUrls.length ? (
            <Stack direction="row" spacing={0.25} sx={{ alignItems: 'center', color: 'text.secondary' }}>
              <PhotoCameraOutlinedIcon sx={{ fontSize: 16 }} />
              <Typography variant="body2">{i.photoUrls.length}</Typography>
            </Stack>
          ) : null}
        </Stack>
        <Typography variant="body2" noWrap sx={{ mt: 0.5 }}>
          {i.description}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.25 }}>
          <Box component="span" sx={{ fontFamily: fonts.mono }}>
            {i.id}
          </Box>
          {' · '}
          {[i.location, i.site].filter(Boolean).join(', ')} · reported {fmtRelative(i.reportedAt, now)} by{' '}
          {i.reportedBy?.name}
          {i.assignedTo ? ` · with ${i.assignedTo.name}` : ''}
          {i.updates.length ? ` · ${i.updates.length} update${i.updates.length === 1 ? '' : 's'}` : ''}
        </Typography>
      </ButtonBase>
    </Paper>
  );
}

/**
 * `/incidents` — report and follow up incidents. Gate users see every incident (CSV too); others the ones they
 * reported or were given. `?open=IN-…` opens one (from a notification).
 */
export function IncidentsPage() {
  const user = useUser();
  const gate = isGateUser(user);
  const now = useNow();
  const toast = useToast();
  const { params, setParams, search, setSearch } = useUrlListParams(DEFAULTS, { prefix: '' });
  const [searchParams, setSearchParams] = useSearchParams();
  const [sheet, setSheet] = useState(null);
  const [exporting, setExporting] = useState(false);
  const query = useMemo(
    () => ({ tab: params.tab, severity: params.severity || undefined, q: params.q || undefined, limit: params.limit }),
    [params.tab, params.severity, params.q, params.limit],
  );
  const list = usePaginatedQuery(incidentsApi.list, query, { append: true });
  useIncidentChanges(list.refresh);
  const counts = list.extra?.counts;

  // Keep an open incident current when someone else changes it.
  useRealtimeEvent('incident:changed', ({ incident }) => {
    setSheet((s) => (s?.kind === 'detail' && s.incident.id === incident.id ? { ...s, incident } : s));
  });

  // ?open=IN-… (from a notification)
  const openId = searchParams.get('open');
  useEffect(() => {
    if (!openId) return;
    // Not aborted on cleanup: removing `open` below re-runs this effect.
    incidentsApi
      .get(openId)
      .then((incident) => setSheet({ kind: 'detail', incident }))
      .catch((err) => toast(errorMessage(err)));
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('open');
        return next;
      },
      { replace: true },
    );
  }, [openId, setSearchParams, toast]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const { blob, filename } = await incidentsApi.exportCsv({
        tab: params.tab,
        severity: params.severity || undefined,
        q: params.q || undefined,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename ?? 'incident-log.csv';
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

  const canReport = user.role !== 'viewer';
  return (
    <>
      <PageHeader
        eyebrow="Site safety"
        title="Incidents"
        right={
          <Stack direction="row" spacing={1}>
            {gate ? (
              <Button
                variant="outlined"
                startIcon={<FileDownloadOutlinedIcon />}
                onClick={exportCsv}
                disabled={exporting}
              >
                Export CSV
              </Button>
            ) : null}
            {canReport ? (
              <Button variant="contained" onClick={() => setSheet({ kind: 'report' })}>
                + Report incident
              </Button>
            ) : null}
          </Stack>
        }
      />
      {!gate ? (
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2, maxWidth: '80ch' }}>
          Report anything unsafe or wrong on site: a leak, a fault, something missing, someone who should not be here.
          Security follows it up. You see the incidents you reported and the ones given to you.
        </Typography>
      ) : null}
      <Tabs
        value={params.tab}
        onChange={(_, v) => setParams({ tab: v })}
        sx={{ mb: 1.5, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab value="open" label={`Open${counts?.open ? ` (${counts.open})` : ''}`} />
        <Tab value="closed" label="Closed" />
        <Tab value="all" label="All" />
      </Tabs>
      <Grid container spacing={1.5} sx={{ mb: 2, alignItems: 'center' }}>
        <Grid size={{ xs: 12, sm: 'auto' }}>
          <TextField
            select
            size="small"
            value={params.severity}
            onChange={(e) => setParams({ severity: e.target.value })}
            sx={{ minWidth: 160 }}
            slotProps={{ htmlInput: { 'aria-label': 'Severity' } }}
          >
            <MenuItem value="">Any severity</MenuItem>
            {SEVERITIES.map(([k, label]) => (
              <MenuItem key={k} value={k}>
                {label}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, sm: 'grow' }} sx={{ maxWidth: { md: 520 } }}>
          <TextField
            size="small"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search incident no., type, place, person…"
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              },
              htmlInput: { type: 'search', 'aria-label': 'Search incidents' },
            }}
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
        <EmptyState
          title={params.q ? 'No match' : params.tab === 'open' ? 'No open incidents' : 'No incidents'}
          text={params.q ? 'Try a different incident number, type or place.' : 'Incidents reported on site show here.'}
        />
      ) : (
        <Stack spacing={1.25} sx={{ opacity: list.loading ? 0.6 : 1 }}>
          {list.data.map((i) => (
            <IncidentCard key={i.id} i={i} now={now} onOpen={(incident) => setSheet({ kind: 'detail', incident })} />
          ))}
          {list.pagination.hasNextPage ? (
            <Box sx={{ textAlign: 'center', mt: 1 }}>
              <Button variant="outlined" onClick={list.loadMore} disabled={list.loadingMore}>
                {list.loadingMore ? 'Loading…' : `Load more · ${list.pagination.total - list.data.length} more`}
              </Button>
            </Box>
          ) : null}
        </Stack>
      )}
      <IncidentSheets
        sheet={sheet}
        onClose={() => setSheet(null)}
        onReported={(incident) => {
          toast(`Incident ${incident.id} reported`);
          setSheet({ kind: 'detail', incident });
          list.refresh();
        }}
        onChanged={(incident) => {
          setSheet({ kind: 'detail', incident });
          list.refresh();
        }}
      />
    </>
  );
}
