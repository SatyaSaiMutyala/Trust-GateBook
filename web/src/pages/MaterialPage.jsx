import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import SearchIcon from '@mui/icons-material/Search';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import CircularProgress from '@mui/material/CircularProgress';
import Grid from '@mui/material/Grid';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { useMemo, useState } from 'react';
import { errorMessage } from '../api/client';
import { materialApi } from '../api/endpoints';
import { useUser } from '../auth/context';
import { canOperate, isGateUser } from '../auth/roles';
import { EmptyState, PageHeader } from '../components/bits';
import { MaterialCard } from '../components/material/MaterialCard';
import { useNow } from '../hooks';
import { usePaginatedQuery } from '../hooks/usePaginatedQuery';
import { useUrlListParams } from '../hooks/useUrlListParams';
import { useMaterialChanges } from '../realtime/context';
import { useMaterialUi, useToast } from '../state/context';
import { fonts } from '../theme/tokens';

const GATE_DEFAULTS = { tab: 'today', dir: '', days: '30', q: '', limit: 20 };
const MINE_DEFAULTS = { tab: '', q: '', limit: 20 };

const GATE_TABS = [
  ['today', 'Boxes in / out today'],
  ['accept', 'Waiting for employee to accept'],
  ['gate', 'To count, hand over or release'],
  ['open', 'Returnable not closed'],
  ['overdue', 'Overdue returns'],
  ['all', 'All passes'],
];
const GATE_EMPTY = {
  today: ['Nothing yet today', 'Use Material IN or OUT above, or add material for a visitor from their details.'],
  accept: ['Nothing waiting', 'Material brought in stays here until the employee taps Received.'],
  gate: [
    'Nothing to do at the gate',
    'Boxes waiting to be counted out with a visitor, handed in for pickup, or collected show here.',
  ],
  open: ['No returnable material out', 'Returnable passes stay here until everything is back.'],
  overdue: ['No overdue returns', 'Returnable material past its return date shows here.'],
  all: ['No gate passes', 'Every material IN and OUT is kept here.'],
};
const MINE_EMPTY = {
  todo: [
    'Nothing to accept',
    'When a visitor or courier brings boxes for you, you get a notification and they show here. Tap Received once you have them.',
  ],
  sent: ['Nothing sent yet', 'Tap “Send material out” to prepare an OUT pass.'],
  in: ['Nothing received yet', 'Material you accept is kept here.'],
};

/** KPI tab: number + label. */
function Kpi({ value, label, tone }) {
  return (
    <Box sx={{ textAlign: 'left', py: 0.5 }}>
      <Typography
        sx={{
          fontFamily: fonts.mono,
          fontWeight: 700,
          fontSize: 22,
          lineHeight: 1.1,
          color: tone === 'bad' ? 'error.main' : tone === 'warn' ? 'warning.main' : 'text.primary',
        }}
      >
        {value ?? '–'}
      </Typography>
      <Typography sx={{ fontSize: 12, textTransform: 'none', color: 'text.secondary', maxWidth: 140, lineHeight: 1.3 }}>
        {label}
      </Typography>
    </Box>
  );
}

/** Big Material IN / OUT buttons. */
function BigButton({ icon, title, sub, onClick, tone }) {
  return (
    <ButtonBase
      onClick={onClick}
      sx={(theme) => ({
        flex: 1,
        p: 2,
        borderRadius: '12px',
        border: 2,
        borderColor: tone === 'in' ? theme.vars.palette.gb.ok : theme.vars.palette.gb.accent,
        bgcolor: tone === 'in' ? theme.vars.palette.gb.okSoft : theme.vars.palette.gb.accentSoft,
        justifyContent: 'flex-start',
        gap: 1.5,
        textAlign: 'left',
      })}
    >
      {icon}
      <Box>
        <Typography sx={{ fontWeight: 700, fontSize: 18 }}>{title}</Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {sub}
        </Typography>
      </Box>
    </ButtonBase>
  );
}

/**
 * `/material` — gate users: Material gate passes (tabs with counts, IN / OUT, search, CSV).
 * Employees: Gate passes (to accept, sent out, received) and "Send material out".
 */
export function MaterialPage() {
  const user = useUser();
  const gate = isGateUser(user);
  const operator = canOperate(user);
  const now = useNow();
  const toast = useToast();
  const { openNew } = useMaterialUi();
  const { params, setParams, search, setSearch } = useUrlListParams(gate ? GATE_DEFAULTS : MINE_DEFAULTS, {
    prefix: '',
  });
  const mineTab = gate ? null : params.tab || null;
  const query = useMemo(
    () =>
      gate
        ? {
            tab: params.tab,
            dir: params.dir || undefined,
            days: params.tab === 'all' ? params.days : undefined,
            q: params.q || undefined,
            limit: params.limit,
          }
        : { tab: mineTab ?? 'all', q: params.q || undefined, limit: params.limit },
    [gate, params.tab, params.dir, params.days, params.q, params.limit, mineTab],
  );
  const list = usePaginatedQuery(materialApi.list, query, { append: true });
  useMaterialChanges(list.refresh, 300);
  const counts = list.extra?.counts;
  const [exporting, setExporting] = useState(false);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const { blob, filename } = await materialApi.exportCsv({
        tab: params.tab,
        dir: params.dir || undefined,
        days: params.tab === 'all' ? params.days : undefined,
        q: params.q || undefined,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename ?? 'material-gate-passes.csv';
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

  const tabValue = gate ? params.tab : (mineTab ?? 'all');
  const empty = gate
    ? GATE_EMPTY[params.tab]
    : (MINE_EMPTY[mineTab ?? 'sent'] ?? [
        'No gate passes',
        'Material brought in for you and boxes you send out show here.',
      ]);

  return (
    <>
      <PageHeader
        eyebrow={gate ? 'Gate desk' : 'Host desk'}
        title={gate ? 'Material gate passes' : 'Gate passes'}
        right={
          gate ? (
            <Button
              variant="outlined"
              startIcon={<FileDownloadOutlinedIcon />}
              onClick={exportCsv}
              disabled={exporting}
            >
              Export CSV
            </Button>
          ) : (
            <Button variant="contained" color="primary" onClick={() => openNew({ direction: 'out' })}>
              + Send material out
            </Button>
          )
        }
      />
      {!gate ? (
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2, maxWidth: '80ch' }}>
          Material brought in for you comes here to accept. To send boxes out, prepare a pass with the number of boxes
          and a photo of the transfer or goods return challan, then give them to a visitor who is here now or leave them
          with security for someone to collect. Security counts the boxes before they leave.
        </Typography>
      ) : null}
      {operator ? (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
          <BigButton
            tone="in"
            icon={<ArrowDownwardIcon />}
            title="Material IN"
            sub="Boxes brought in by a visitor or courier, accepted by the employee"
            onClick={() => openNew({ direction: 'in' })}
          />
          <BigButton
            tone="out"
            icon={<ArrowUpwardIcon />}
            title="Material OUT"
            sub="Boxes going out with a visitor or carrier, sent by an employee"
            onClick={() => openNew({ direction: 'out' })}
          />
        </Stack>
      ) : null}

      <Tabs
        value={tabValue}
        onChange={(_, v) => setParams({ tab: v })}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        sx={{ mb: 1.5, borderBottom: 1, borderColor: 'divider' }}
      >
        {gate
          ? GATE_TABS.map(([k, label]) => {
              const value =
                k === 'today'
                  ? counts
                    ? `${counts.boxesInToday} / ${counts.boxesOutToday}`
                    : null
                  : k === 'all'
                    ? ''
                    : counts?.[k];
              const tone =
                k === 'overdue' && counts?.overdue
                  ? 'bad'
                  : (k === 'accept' || k === 'gate') && counts?.[k]
                    ? 'warn'
                    : undefined;
              return (
                <Tab
                  key={k}
                  value={k}
                  label={k === 'all' ? 'All passes' : <Kpi value={value} label={label} tone={tone} />}
                  sx={{ alignItems: 'flex-start' }}
                />
              );
            })
          : [
              <Tab key="todo" value="todo" label={`To accept${counts?.todo ? ` (${counts.todo})` : ''}`} />,
              <Tab key="sent" value="sent" label="Sent out" />,
              <Tab key="in" value="in" label="Received" />,
              <Tab key="all" value="all" label="All" />,
            ]}
      </Tabs>

      <Grid container spacing={1.5} sx={{ mb: 2, alignItems: 'center' }}>
        {gate ? (
          <Grid size={{ xs: 12, sm: 'auto' }}>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={params.dir}
              onChange={(_, v) => setParams({ dir: v ?? '' })}
            >
              <ToggleButton value="">IN &amp; OUT</ToggleButton>
              <ToggleButton value="in">IN</ToggleButton>
              <ToggleButton value="out">OUT</ToggleButton>
            </ToggleButtonGroup>
          </Grid>
        ) : null}
        {gate && params.tab === 'all' ? (
          <Grid size={{ xs: 12, sm: 'auto' }}>
            <TextField
              select
              size="small"
              value={params.days}
              onChange={(e) => setParams({ days: e.target.value })}
              slotProps={{ htmlInput: { 'aria-label': 'Period' } }}
            >
              <MenuItem value="7">Last 7 days</MenuItem>
              <MenuItem value="30">Last 30 days</MenuItem>
              <MenuItem value="120">Last 120 days</MenuItem>
            </TextField>
          </Grid>
        ) : null}
        <Grid size={{ xs: 12, sm: 'grow' }} sx={{ maxWidth: { md: 520 } }}>
          <TextField
            size="small"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search pass no., visitor, company, challan no., employee…"
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              },
              htmlInput: { type: 'search', 'aria-label': 'Search gate passes' },
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
          title={params.q ? 'No match' : empty[0]}
          text={params.q ? 'Try a different pass number, name or challan number.' : empty[1]}
        />
      ) : (
        <Stack spacing={1.25} sx={{ opacity: list.loading ? 0.6 : 1 }}>
          {list.data.map((p) => (
            <MaterialCard key={p.id} pass={p} now={now} />
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
    </>
  );
}
