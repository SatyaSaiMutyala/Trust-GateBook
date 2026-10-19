import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import KeyOutlinedIcon from '@mui/icons-material/KeyOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import SearchIcon from '@mui/icons-material/Search';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
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
import { useCallback, useEffect, useMemo, useState } from 'react';
import { errorMessage } from '../api/client';
import { keysApi } from '../api/endpoints';
import { useUser } from '../auth/context';
import { canOperate, isAdmin } from '../auth/roles';
import { EmptyState, PageHeader } from '../components/bits';
import { KeySheets } from '../components/keys/KeySheets';
import { useNow } from '../hooks';
import { usePaginatedQuery } from '../hooks/usePaginatedQuery';
import { useUrlListParams } from '../hooks/useUrlListParams';
import { useKeysChanges } from '../realtime/context';
import { useSettings, useToast } from '../state/context';
import { fonts } from '../theme/tokens';
import { fmtDateTime, fmtRelative, fmtTime } from '../utils/format';
import { DIARY_PERIODS, KEY_STATE, freeCopies } from '../utils/keys';

const DEFAULTS = { tab: 'board', period: '7d', state: 'all', site: '', q: '', limit: 30 };
const CHIP_VARIANT = { ok: 'inside', warn: 'pending', bad: 'issue', muted: 'exited' };

/** Downloads a blob as a file. */
function download({ blob, filename }, fallback) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? fallback;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Who has a copy, since when, and when it is due. */
function OutLine({ move: m, now, onReturn }) {
  const s = KEY_STATE[m.state];
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', py: 0.5, borderTop: 1, borderColor: 'divider' }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
          {m.taker.name}
          {m.taker.phone ? (
            <Box component="span" sx={{ fontWeight: 400, color: 'text.secondary' }}>
              {' '}
              · {m.taker.phone}
            </Box>
          ) : null}
        </Typography>
        <Typography variant="body2" sx={{ color: m.state === 'overdue' ? 'error.main' : 'text.secondary' }} noWrap>
          Out {fmtRelative(m.issuedAt, now)}
          {m.dueAt ? ` · ${m.state === 'overdue' ? 'was due' : 'due'} ${fmtTime(m.dueAt)}` : ' · no return time'}
          {m.purpose ? ` · ${m.purpose}` : ''}
        </Typography>
      </Box>
      <Chip size="small" variant={CHIP_VARIANT[s.tone]} label={s.label} />
      {onReturn ? (
        <Button size="small" variant="outlined" onClick={() => onReturn(m)}>
          Return
        </Button>
      ) : null}
    </Stack>
  );
}

/** One key on the board. */
function KeyTile({ k, now, operator, onIssue, onReturn }) {
  const free = freeCopies(k);
  const overdue = k.out.some((m) => m.state === 'overdue');
  return (
    <Paper
      variant="outlined"
      sx={(theme) => ({
        p: 1.5,
        height: '100%',
        borderColor: overdue ? theme.vars.palette.gb.bad : k.out.length ? theme.vars.palette.gb.accent : undefined,
      })}
    >
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
        <Box
          sx={(theme) => ({
            minWidth: 64,
            px: 1,
            py: 0.75,
            borderRadius: '8px',
            textAlign: 'center',
            bgcolor: free ? theme.vars.palette.gb.okSoft : theme.vars.palette.gb.accentSoft,
            color: free ? theme.vars.palette.gb.ok : theme.vars.palette.gb.warn,
          })}
        >
          <Typography sx={{ fontFamily: fonts.mono, fontWeight: 700, fontSize: 16 }}>{k.number}</Typography>
          <Typography sx={{ fontSize: 11 }}>
            {free ? (k.copies > 1 ? `${free} of ${k.copies} in` : 'In') : 'Out'}
          </Typography>
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700 }} noWrap>
            {k.name}
            {k.restricted ? <LockOutlinedIcon sx={{ fontSize: 16, ml: 0.5, verticalAlign: '-2px' }} /> : null}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }} noWrap>
            {[k.location, k.site].filter(Boolean).join(' · ')}
          </Typography>
        </Box>
        {operator && free ? (
          <Button size="small" variant="contained" onClick={() => onIssue(k)}>
            Issue
          </Button>
        ) : null}
      </Stack>
      {k.out.length ? (
        <Box sx={{ mt: 1 }}>
          {k.out.map((m) => (
            <OutLine key={m.id} move={m} now={now} onReturn={operator ? onReturn : null} />
          ))}
        </Box>
      ) : null}
    </Paper>
  );
}

/** The key board: every key, what is out, issue / return. */
function Board({ params, setParams, search, now, operator, open }) {
  const { settings } = useSettings();
  const [state, setState] = useState({ keys: [], counts: null, loading: true, error: null });
  const q = params.q;
  const site = params.site;
  const load = useCallback(() => {
    keysApi
      .board({ q: q || undefined, site: site || undefined })
      .then((r) => setState({ ...r, loading: false, error: null }))
      .catch((err) => setState((s) => ({ ...s, loading: false, error: errorMessage(err) })));
  }, [q, site]);
  useEffect(() => {
    load();
  }, [load]);
  useKeysChanges(load);
  const keys = state.keys.filter((k) => k.active);
  const c = state.counts;
  return (
    <>
      {c ? (
        <Stack direction="row" sx={{ gap: 3, mb: 2, flexWrap: 'wrap' }}>
          {[
            [c.total, 'keys'],
            [c.out, 'out now'],
            [c.overdue, 'overdue', c.overdue ? 'error.main' : undefined],
          ].map(([n, label, color]) => (
            <Box key={label}>
              <Typography sx={{ fontFamily: fonts.mono, fontWeight: 700, fontSize: 24, color }}>{n}</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {label}
              </Typography>
            </Box>
          ))}
        </Stack>
      ) : null}
      <Grid container spacing={1.5} sx={{ mb: 2, alignItems: 'center' }}>
        {(settings?.sites?.length ?? 0) > 1 ? (
          <Grid size={{ xs: 12, sm: 'auto' }}>
            <TextField
              select
              size="small"
              value={params.site}
              onChange={(e) => setParams({ site: e.target.value })}
              sx={{ minWidth: 180 }}
              slotProps={{ htmlInput: { 'aria-label': 'Gate / site' } }}
            >
              <MenuItem value="">All gates</MenuItem>
              {settings.sites.map((s) => (
                <MenuItem key={s} value={s}>
                  {s}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
        ) : null}
        <Grid size={{ xs: 12, sm: 'grow' }} sx={{ maxWidth: { md: 520 } }}>
          {search}
        </Grid>
      </Grid>
      {state.error ? (
        <Alert severity="error" sx={{ mb: 2 }} action={<Button onClick={load}>Retry</Button>}>
          {state.error}
        </Alert>
      ) : null}
      {state.loading ? (
        <Box sx={{ py: 6, display: 'grid', placeItems: 'center' }}>
          <CircularProgress />
        </Box>
      ) : keys.length === 0 ? (
        <EmptyState
          title={q ? 'No match' : 'No keys yet'}
          text={
            q ? 'Try a different key number or name.' : 'An admin adds the keys kept at the gate in Settings → Keys.'
          }
        />
      ) : (
        <Grid container spacing={1.5}>
          {keys.map((k) => (
            <Grid key={k.id} size={{ xs: 12, md: 6, xl: 4 }}>
              <KeyTile
                k={k}
                now={now}
                operator={operator}
                onIssue={(key) => open({ kind: 'issue', key })}
                onReturn={(move) => open({ kind: 'return', move })}
              />
            </Grid>
          ))}
        </Grid>
      )}
    </>
  );
}

/** The key diary: every issue and return. */
function Diary({ params, setParams, search, operator, open }) {
  const query = useMemo(
    () => ({
      period: params.period,
      state: params.state,
      site: params.site || undefined,
      q: params.q || undefined,
      limit: params.limit,
    }),
    [params.period, params.state, params.site, params.q, params.limit],
  );
  const list = usePaginatedQuery(keysApi.diary, query, { append: true });
  useKeysChanges(list.refresh);
  return (
    <>
      <Grid container spacing={1.5} sx={{ mb: 2, alignItems: 'center' }}>
        <Grid size={{ xs: 6, sm: 'auto' }}>
          <TextField
            select
            size="small"
            value={params.period}
            onChange={(e) => setParams({ period: e.target.value })}
            slotProps={{ htmlInput: { 'aria-label': 'Period' } }}
          >
            {DIARY_PERIODS.map(([k, label]) => (
              <MenuItem key={k} value={k}>
                {label}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 6, sm: 'auto' }}>
          <TextField
            select
            size="small"
            value={params.state}
            onChange={(e) => setParams({ state: e.target.value })}
            slotProps={{ htmlInput: { 'aria-label': 'Status' } }}
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="out">Out now</MenuItem>
            <MenuItem value="overdue">Overdue</MenuItem>
            <MenuItem value="returned">Returned</MenuItem>
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, sm: 'grow' }} sx={{ maxWidth: { md: 520 } }}>
          {search}
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
        <EmptyState title="Nothing in the diary" text="Every key issued and returned is kept here." />
      ) : (
        <Stack spacing={1} sx={{ opacity: list.loading ? 0.6 : 1 }}>
          {list.data.map((m) => {
            const s = KEY_STATE[m.state];
            return (
              <Paper key={m.id} variant="outlined" sx={{ p: 1.5 }}>
                <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
                  <Typography sx={{ fontFamily: fonts.mono, fontWeight: 700, minWidth: 64 }}>{m.key.number}</Typography>
                  <Box sx={{ flex: 1, minWidth: 200 }}>
                    <Typography sx={{ fontWeight: 600 }} noWrap>
                      {m.key.name} · {m.taker.name}
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                      Issued {fmtDateTime(m.issuedAt)} by {m.issuedBy.name}
                      {m.dueAt ? ` · due ${fmtDateTime(m.dueAt)}` : ''}
                      {m.returnedAt
                        ? ` · back ${fmtDateTime(m.returnedAt)}${m.receivedBy ? ` (${m.receivedBy.name})` : ''}`
                        : ''}
                      {m.purpose ? ` · ${m.purpose}` : ''}
                      {m.returnNote ? ` · “${m.returnNote}”` : ''}
                    </Typography>
                  </Box>
                  <Chip size="small" variant={CHIP_VARIANT[s.tone]} label={s.label} />
                  {operator && !m.returnedAt ? (
                    <Button size="small" variant="outlined" onClick={() => open({ kind: 'return', move: m })}>
                      Return
                    </Button>
                  ) : null}
                </Stack>
              </Paper>
            );
          })}
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

/** `/keys` — Key register: the key board and the key diary (gate users with the Keys module). */
export function KeysPage() {
  const user = useUser();
  const operator = canOperate(user);
  const now = useNow();
  const toast = useToast();
  const { params, setParams, search, setSearch } = useUrlListParams(DEFAULTS, { prefix: '' });
  const [sheet, setSheet] = useState(null);
  const [exporting, setExporting] = useState(false);
  const diary = params.tab === 'diary';

  const exportCsv = async () => {
    setExporting(true);
    try {
      download(
        await keysApi.exportCsv({
          period: params.period,
          state: params.state,
          site: params.site || undefined,
          q: params.q || undefined,
        }),
        'key-diary.csv',
      );
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      setExporting(false);
    }
  };

  const searchBox = (
    <TextField
      size="small"
      value={search}
      onChange={(e) => setSearch(e.target.value)}
      placeholder={diary ? 'Search key, person, purpose…' : 'Search key number, what it opens, location…'}
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon />
            </InputAdornment>
          ),
        },
        htmlInput: { type: 'search', 'aria-label': 'Search keys' },
      }}
    />
  );

  const onDone = (r, s) => {
    if (s.kind === 'issue') toast(`Key ${r.key.number} issued to ${r.move.taker.name}`);
    else if (s.kind === 'return') toast(`Key ${r.move.key.number} is back`);
    else toast(`Key ${r.number} ${s.key ? 'saved' : 'added'}`);
  };

  return (
    <>
      <PageHeader
        eyebrow="Gate desk"
        title="Key register"
        right={
          diary ? (
            <Button
              variant="outlined"
              startIcon={<FileDownloadOutlinedIcon />}
              onClick={exportCsv}
              disabled={exporting}
            >
              Export CSV
            </Button>
          ) : isAdmin(user) ? (
            <Button variant="outlined" startIcon={<KeyOutlinedIcon />} onClick={() => setSheet({ kind: 'edit' })}>
              Add key
            </Button>
          ) : null
        }
      />
      <Tabs
        value={diary ? 'diary' : 'board'}
        onChange={(_, v) => setParams({ tab: v })}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab value="board" label="Key board" />
        <Tab value="diary" label="Key diary" />
      </Tabs>
      {diary ? (
        <Diary params={params} setParams={setParams} search={searchBox} operator={operator} open={setSheet} />
      ) : (
        <Board params={params} setParams={setParams} search={searchBox} now={now} operator={operator} open={setSheet} />
      )}
      <KeySheets sheet={sheet} onClose={() => setSheet(null)} onDone={onDone} />
    </>
  );
}
