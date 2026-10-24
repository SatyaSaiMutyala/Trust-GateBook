import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Grid from '@mui/material/Grid';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { errorMessage } from '../api/client';
import { genApi } from '../api/endpoints';
import { useUser } from '../auth/context';
import { canOperate, isAdmin } from '../auth/roles';
import { EmptyState, PageHeader, Panel, VisitorThumb } from '../components/bits';
import { GenSheets } from '../components/gen/GenSheets';
import { useNow } from '../hooks';
import { usePaginatedQuery } from '../hooks/usePaginatedQuery';
import { useGenChanges } from '../realtime/context';
import { useToast } from '../state/context';
import { fonts } from '../theme/tokens';
import { fmtDate, fmtDateTime } from '../utils/format';
import { download, dur, hrs } from '../utils/ops';

function Box3({ title, value, sub, tone, children }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, height: '100%' }}>
      <Typography variant="eyebrow" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
        {title}
      </Typography>
      <Typography sx={{ fontWeight: 700, fontSize: 18, color: tone }}>{value}</Typography>
      {sub ? (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {sub}
        </Typography>
      ) : null}
      {children}
    </Paper>
  );
}

/** One generator: running state, diesel gauge, level check, this month, actions. */
function GenPanel({ g, now, operator, open }) {
  const e = g.estimate;
  const ran = g.running ? dur(now - new Date(g.running.startAt).getTime()) : null;
  return (
    <Paper
      variant="outlined"
      sx={(t) => ({ p: 2, borderColor: g.low || g.checkOverdue ? t.vars.palette.gb.bad : undefined })}
    >
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start', mb: 1.5, flexWrap: 'wrap' }}>
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Typography variant="h3">{g.name}</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {[g.kva && `${g.kva} kVA`, `Tank ${g.tankL} L`, g.rateLph ? `rated ${g.rateLph} L/h` : '']
              .filter(Boolean)
              .join(' · ')}
          </Typography>
          {g.running ? (
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              Started {fmtDateTime(g.running.startAt)} · {g.running.reason}· by {g.running.startedBy?.name}
            </Typography>
          ) : null}
        </Box>
        <Chip variant={g.running ? 'inside' : 'exited'} label={g.running ? `Running ${ran}` : 'Off'} />
      </Stack>
      <Box sx={{ mb: 2 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.5 }}>
          <Typography sx={{ fontWeight: 600 }}>Diesel in tank</Typography>
          {g.low ? <Chip size="small" variant="issue" label="Low: arrange refill" /> : null}
        </Stack>
        {e ? (
          <>
            <Typography sx={{ fontFamily: fonts.mono, fontWeight: 700 }}>
              About {Math.round(e.litres)} L of {g.tankL} L · {Math.round(e.pct ?? 0)}%
            </Typography>
            <Box sx={{ position: 'relative', my: 0.75 }}>
              <LinearProgress
                variant="determinate"
                value={Math.min(100, e.pct ?? 0)}
                color={g.low ? 'error' : 'success'}
                sx={{ height: 12, borderRadius: 6 }}
              />
              <Box
                sx={{
                  position: 'absolute',
                  top: -2,
                  bottom: -2,
                  left: `${g.lowPct}%`,
                  width: 2,
                  bgcolor: 'error.main',
                }}
              />
            </Box>
            <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                0
              </Typography>
              <Typography variant="body2" sx={{ color: 'error.main' }}>
                Low {g.lowPct}%
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {g.tankL} L
              </Typography>
            </Stack>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
              Estimate: last reading {e.baseL} L on {fmtDateTime(e.baseAt)} + {e.fills} L filled − {hrs(e.hours)} run ×{' '}
              {g.rateLph} L/h. The weekly dip reading corrects it.
            </Typography>
          </>
        ) : (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            No level reading yet. Record the weekly level check to start tracking diesel.
          </Typography>
        )}
      </Box>
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Box3
            title="Diesel level check"
            value={g.checkOverdue ? `Overdue since ${fmtDate(g.checkDueAt)}` : `Next due ${fmtDate(g.checkDueAt)}`}
            tone={g.checkOverdue ? 'error.main' : undefined}
            sub={
              g.lastCheck
                ? `Last: ${fmtDate(g.lastCheck.at)} · ${g.lastCheck.levelL} L by ${g.lastCheck.by?.name}`
                : 'Not done yet'
            }
          >
            {g.lastCheck?.photoUrl ? (
              <Box sx={{ mt: 1 }}>
                <VisitorThumb src={g.lastCheck.photoUrl} name="Gauge photo" size={56} />
              </Box>
            ) : null}
          </Box3>
        </Grid>
        <Grid size={{ xs: 6, md: 4 }}>
          <Box3 title="Run this month" value={hrs(g.month.hours)} sub={`${g.month.starts} starts`} />
        </Grid>
        <Grid size={{ xs: 6, md: 4 }}>
          <Box3 title="Diesel filled this month" value={`${g.month.filledL} L`} />
        </Grid>
      </Grid>
      {operator ? (
        <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
          {g.running ? (
            <Button variant="contained" color="error" onClick={() => open('stop', g)}>
              Stop generator
            </Button>
          ) : (
            <Button variant="contained" color="success" onClick={() => open('start', g)} disabled={!g.active}>
              Start generator
            </Button>
          )}
          <Button variant="outlined" onClick={() => open('fill', g)}>
            Log diesel fill
          </Button>
          <Button variant={g.checkOverdue ? 'contained' : 'outlined'} onClick={() => open('check', g)}>
            Weekly level check
          </Button>
        </Stack>
      ) : null}
    </Paper>
  );
}

function RunLog() {
  const toast = useToast();
  const query = useMemo(() => ({ days: 30, limit: 30 }), []);
  const list = usePaginatedQuery(genApi.runs, query, { append: true });
  useGenChanges(list.refresh);
  return (
    <>
      <Stack direction="row" sx={{ mb: 2, alignItems: 'center' }}>
        <Typography sx={{ flex: 1 }}>
          {list.extra?.hours != null ? hrs(list.extra.hours) : '–'} run in the last 30 days
        </Typography>
        <Button
          variant="outlined"
          startIcon={<FileDownloadOutlinedIcon />}
          onClick={async () => {
            try {
              download(await genApi.runsCsv({ days: 30 }), 'generator-runs.csv');
            } catch (err) {
              toast(errorMessage(err));
            }
          }}
        >
          Export CSV
        </Button>
      </Stack>
      {!list.data.length && !list.loading ? (
        <EmptyState
          title="No runs recorded"
          text="Start and stop the generator here every time it runs, including weekly test runs."
        />
      ) : (
        <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                {['Date', 'Generator', 'Start', 'Stop', 'Ran for', 'Reason', 'Started by', 'Stopped by'].map((h) => (
                  <TableCell key={h}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {list.data.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{fmtDate(r.startAt)}</TableCell>
                  <TableCell>{r.genName}</TableCell>
                  <TableCell>{fmtDateTime(r.startAt)}</TableCell>
                  <TableCell>
                    {r.stopAt ? fmtDateTime(r.stopAt) : <Chip size="small" variant="inside" label="Running" />}
                  </TableCell>
                  <TableCell>{hrs(r.hours)}</TableCell>
                  <TableCell>
                    {r.reason}
                    {r.note ? (
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        {r.note}
                      </Typography>
                    ) : null}
                  </TableCell>
                  <TableCell>{r.startedBy?.name}</TableCell>
                  <TableCell>{r.stoppedBy?.name ?? ''}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}
      {list.pagination.hasNextPage ? (
        <Box sx={{ textAlign: 'center', mt: 1 }}>
          <Button variant="outlined" onClick={list.loadMore}>
            Load more
          </Button>
        </Box>
      ) : null}
    </>
  );
}

function DieselLog({ gen }) {
  const toast = useToast();
  const query = useMemo(() => ({ genId: gen.id, days: 90, limit: 30 }), [gen.id]);
  const list = usePaginatedQuery(genApi.fuelLog, query, { append: true });
  useGenChanges(list.refresh);
  const use = list.extra?.consumption ?? [];
  return (
    <Panel
      title={gen.name}
      action={
        <Button
          size="small"
          variant="outlined"
          startIcon={<FileDownloadOutlinedIcon />}
          onClick={async () => {
            try {
              download(await genApi.fuelCsv({ genId: gen.id, days: 366 }), 'diesel-log.csv');
            } catch (err) {
              toast(errorMessage(err));
            }
          }}
        >
          Export CSV
        </Button>
      }
    >
      <Typography sx={{ fontWeight: 600, mb: 0.5 }}>Consumption between level readings</Typography>
      {use.length ? (
        <Stack spacing={0.5} sx={{ mb: 2 }}>
          {use.map((c) => (
            <Stack key={c.to} direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <Typography variant="body2" sx={{ flex: 1 }}>
                {fmtDate(c.from)} → {fmtDate(c.to)}: used <b>{c.used} L</b> in {hrs(c.hours)} run ({c.fills} L filled)
              </Typography>
              {c.lph !== null ? (
                <Typography variant="body2" sx={{ fontFamily: fonts.mono }}>
                  {c.lph} L/h
                </Typography>
              ) : null}
              {c.high ? <Chip size="small" variant="pending" label={`above rated ${gen.rateLph}`} /> : null}
              {c.unexplained ? <Chip size="small" variant="issue" label="Diesel dropped without running" /> : null}
            </Stack>
          ))}
        </Stack>
      ) : (
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
          Consumption appears after two level readings.
        </Typography>
      )}
      {list.data.length ? (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                {[
                  'Date & time',
                  'Entry',
                  'Litres filled',
                  'Level reading',
                  'Vendor / bill',
                  'Amount (₹)',
                  'Recorded by',
                  'Photo',
                ].map((h) => (
                  <TableCell key={h}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {list.data.map((f) => (
                <TableRow key={f.id}>
                  <TableCell>{fmtDateTime(f.at)}</TableCell>
                  <TableCell>{f.kind === 'fill' ? 'Fill' : 'Level check'}</TableCell>
                  <TableCell>{f.litres ?? ''}</TableCell>
                  <TableCell>{f.levelL ?? ''}</TableCell>
                  <TableCell>
                    {f.vendor}
                    {f.billNo ? ` · Bill ${f.billNo}` : ''}
                  </TableCell>
                  <TableCell>{f.amount ?? ''}</TableCell>
                  <TableCell>
                    {f.by?.name}
                    {f.note ? (
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        {f.note}
                      </Typography>
                    ) : null}
                  </TableCell>
                  <TableCell>{f.photoUrl ? <VisitorThumb src={f.photoUrl} name="Photo" size={36} /> : ''}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      ) : (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          No diesel entries yet.
        </Typography>
      )}
    </Panel>
  );
}

/** `/generator` — Generator & diesel: status, run log, diesel log. */
export function GeneratorPage() {
  const user = useUser();
  const operator = canOperate(user);
  const admin = isAdmin(user);
  const now = useNow(30_000);
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = ['status', 'runs', 'diesel'].includes(params.get('tab')) ? params.get('tab') : 'status';
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [sheet, setSheet] = useState(null);
  const load = useCallback(() => {
    genApi
      .status()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useGenChanges(load);
  const gens = (data?.generators ?? []).filter((g) => g.active);

  return (
    <>
      <PageHeader
        eyebrow="Site safety"
        title="Generator & diesel"
        right={
          admin ? (
            <Button variant="outlined" onClick={() => navigate('/settings?tab=gen')}>
              Set-up
            </Button>
          ) : null
        }
      />
      <Tabs
        value={tab}
        onChange={(_, v) => setParams(v === 'status' ? {} : { tab: v })}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab value="status" label="Status" />
        <Tab value="runs" label="Run log" />
        <Tab value="diesel" label="Diesel log" />
      </Tabs>
      {error ? (
        <Alert severity="error" sx={{ mb: 2 }} action={<Button onClick={load}>Retry</Button>}>
          {error}
        </Alert>
      ) : null}
      {!data ? (
        <Box sx={{ py: 6, display: 'grid', placeItems: 'center' }}>
          <CircularProgress />
        </Box>
      ) : tab === 'runs' ? (
        <RunLog />
      ) : !gens.length ? (
        <EmptyState
          title="No generator set up"
          text={
            admin
              ? 'Add the generator with its tank size in Settings → Generator.'
              : 'Ask your admin to add the generator.'
          }
        />
      ) : tab === 'diesel' ? (
        <Stack spacing={2}>
          {gens.map((g) => (
            <DieselLog key={g.id} gen={g} />
          ))}
        </Stack>
      ) : (
        <Stack spacing={2}>
          {gens.map((g) => (
            <GenPanel key={g.id} g={g} now={now} operator={operator} open={(kind, gen) => setSheet({ kind, gen })} />
          ))}
        </Stack>
      )}
      <GenSheets
        sheet={sheet}
        onClose={() => setSheet(null)}
        onDone={(text) => {
          toast(text);
          load();
        }}
      />
    </>
  );
}
