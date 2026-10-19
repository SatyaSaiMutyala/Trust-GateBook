import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tabs from '@mui/material/Tabs';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { errorMessage } from '../api/client';
import { patrolApi } from '../api/endpoints';
import { useUser } from '../auth/context';
import { canOperate, isAdmin } from '../auth/roles';
import { EmptyState, PageHeader, Panel, VisitorThumb } from '../components/bits';
import { IncidentSheets } from '../components/incidents/IncidentSheets';
import { ScanSheets } from '../components/patrol/ScanSheets';
import { useNow } from '../hooks';
import { usePaginatedQuery } from '../hooks/usePaginatedQuery';
import { usePatrolChanges } from '../realtime/context';
import { useToast } from '../state/context';
import { fonts } from '../theme/tokens';
import { fmtDate, fmtDateTime } from '../utils/format';
import { LOG_STATUS, TONE_VARIANT, download, hhmm, slotChip } from '../utils/ops';

/** One dot per checkpoint: scanned ok, issue, or missed. */
function Dots({ slot }) {
  const ended = slot.status === 'partial' || slot.status === 'missed';
  return (
    <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
      {slot.checkpoints.map((c) => (
        <Tooltip
          key={c.id}
          title={`${c.name}: ${c.scannedAt ? `scanned ${hhmm(c.scannedAt)} by ${c.by}` : 'not scanned'}`}
        >
          <Box
            sx={(t) => ({
              width: 12,
              height: 12,
              borderRadius: '50%',
              bgcolor: c.scannedAt
                ? c.status === 'issue'
                  ? t.vars.palette.gb.warn
                  : t.vars.palette.gb.ok
                : ended
                  ? t.vars.palette.gb.bad
                  : t.vars.palette.gb.line,
            })}
          />
        </Tooltip>
      ))}
    </Stack>
  );
}

function SlotCard({ slot: s, now, onScan, operator }) {
  const [chip, tone] = slotChip(s, now);
  const day = new Date(s.at).toDateString() !== new Date(now).toDateString();
  return (
    <Paper
      variant="outlined"
      sx={(t) => ({ p: 1.5, borderColor: s.status === 'open' && s.late ? t.vars.palette.gb.bad : undefined })}
    >
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
        <Typography sx={{ fontFamily: fonts.mono, fontWeight: 700, fontSize: 20, minWidth: 64 }}>
          {hhmm(s.at)}
        </Typography>
        <Box sx={{ flex: 1, minWidth: 180 }}>
          <Typography sx={{ fontWeight: 700 }}>
            {s.roundName}
            {day ? (
              <Box component="span" sx={{ fontWeight: 400, color: 'text.secondary' }}>
                {' '}
                · {new Date(s.at) < new Date(now) ? 'yesterday' : 'tomorrow'}
              </Box>
            ) : null}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            On time till {hhmm(s.onTimeTill)} · ends {hhmm(s.end)}
          </Typography>
          <Box sx={{ mt: 0.75 }}>
            <Dots slot={s} />
          </Box>
          {s.escalations.length ? (
            <Typography variant="body2" sx={{ color: 'error.main', mt: 0.5 }}>
              {s.escalations.map((e) => `${e.label} · ${hhmm(e.at)} → ${e.recipients.join(', ')}`).join(' · ')}
            </Typography>
          ) : null}
        </Box>
        <Chip size="small" variant={TONE_VARIANT[tone]} label={chip} />
        {s.status === 'open' && operator ? (
          <Button size="small" variant="contained" onClick={onScan}>
            Scan
          </Button>
        ) : null}
      </Stack>
    </Paper>
  );
}

/** Due now · coming up · last 12 hours. */
function Rounds({ board, now, operator, onScan, admin, navigate }) {
  if (!board.rounds.length) {
    return (
      <EmptyState
        title="No patrol rounds yet"
        text={
          admin
            ? 'Set up locations, rounds and the escalation matrix in Settings → Patrols.'
            : 'Ask your admin to set up patrol locations and rounds.'
        }
        action={
          admin ? (
            <Button variant="contained" onClick={() => navigate('/settings?tab=patrol')}>
              Open patrol set-up
            </Button>
          ) : null
        }
      />
    );
  }
  const open = board.slots.filter((s) => s.status === 'open');
  const next = board.slots.filter((s) => s.status === 'upcoming').slice(0, 3);
  const past = board.slots.filter((s) => new Date(s.end).getTime() < now).reverse();
  const count = (st) => past.filter((s) => s.logStatus === st).length;
  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography variant="h3" sx={{ mb: 1 }}>
          Due now
        </Typography>
        {open.length ? (
          <Stack spacing={1}>
            {open.map((s) => (
              <SlotCard key={s.key} slot={s} now={now} onScan={onScan} operator={operator} />
            ))}
          </Stack>
        ) : (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            No round is due right now.
          </Typography>
        )}
      </Box>
      {next.length ? (
        <Box>
          <Typography variant="h3" sx={{ mb: 1 }}>
            Coming up
          </Typography>
          <Stack spacing={1}>
            {next.map((s) => (
              <SlotCard key={s.key} slot={s} now={now} onScan={onScan} operator={operator} />
            ))}
          </Stack>
        </Box>
      ) : null}
      <Box>
        <Typography variant="h3" sx={{ mb: 0.5 }}>
          Last 12 hours
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
          {past.length
            ? `${past.length} rounds · ${count('on_time')} on time · ${count('late')} started late · ${count('partial')} partly missed · ${count('missed')} missed`
            : 'No rounds were due in the last 12 hours.'}
        </Typography>
        <Stack spacing={1}>
          {past.map((s) => (
            <SlotCard key={s.key} slot={s} now={now} onScan={onScan} operator={false} />
          ))}
        </Stack>
      </Box>
    </Stack>
  );
}

function Stat({ value, label, tone }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, flex: 1, minWidth: 150 }}>
      <Typography sx={{ fontFamily: fonts.mono, fontWeight: 700, fontSize: 24, color: tone }}>{value}</Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {label}
      </Typography>
    </Paper>
  );
}

/** The late & missed log. */
function LateLog() {
  const toast = useToast();
  const [days, setDays] = useState(7);
  const [filter, setFilter] = useState('problems');
  const [state, setState] = useState({ data: null, error: null });
  const load = useCallback(() => {
    patrolApi
      .log({ days, filter })
      .then((r) => setState({ data: r, error: null }))
      .catch((err) => setState({ data: null, error: errorMessage(err) }));
  }, [days, filter]);
  useEffect(() => {
    load();
  }, [load]);
  usePatrolChanges(load);
  const d = state.data;
  const s = d?.summary;
  return (
    <>
      <Stack direction="row" sx={{ gap: 1.5, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <ToggleButtonGroup exclusive size="small" value={days} onChange={(_, v) => v && setDays(v)}>
          <ToggleButton value={1}>Today</ToggleButton>
          <ToggleButton value={7}>7 days</ToggleButton>
          <ToggleButton value={30}>30 days</ToggleButton>
          <ToggleButton value={90}>90 days</ToggleButton>
        </ToggleButtonGroup>
        <ToggleButtonGroup exclusive size="small" value={filter} onChange={(_, v) => v && setFilter(v)}>
          <ToggleButton value="problems">Late &amp; missed only</ToggleButton>
          <ToggleButton value="all">All rounds</ToggleButton>
        </ToggleButtonGroup>
        <Box sx={{ flex: 1 }} />
        <Button
          variant="outlined"
          startIcon={<FileDownloadOutlinedIcon />}
          onClick={async () => {
            try {
              download(await patrolApi.logCsv({ days, filter }), 'patrol-late-log.csv');
            } catch (err) {
              toast(errorMessage(err));
            }
          }}
        >
          Export CSV
        </Button>
      </Stack>
      {state.error ? <Alert severity="error">{state.error}</Alert> : null}
      {!d ? (
        <Box sx={{ py: 6, display: 'grid', placeItems: 'center' }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          <Stack direction="row" sx={{ gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
            <Stat
              value={s.rounds ? `${Math.round((s.onTime / s.rounds) * 100)}%` : '–'}
              label={`Rounds on time (${s.onTime} of ${s.rounds})`}
            />
            <Stat
              value={s.late}
              label={`Started late${s.avgLateMin !== null ? ` · average ${s.avgLateMin} min after start time` : ''}`}
              tone={s.late ? 'warning.main' : undefined}
            />
            <Stat value={s.partial} label="Partly missed" tone={s.partial ? 'error.main' : undefined} />
            <Stat value={s.missed} label="Missed completely" tone={s.missed ? 'error.main' : undefined} />
          </Stack>
          {d.data.length === 0 ? (
            <EmptyState
              title={filter === 'problems' ? 'No late or missed rounds' : 'No completed rounds yet'}
              text="Each round is written here when its time runs out: on time, late (with minutes), partly missed or missed, with every alarm and escalation sent."
            />
          ) : (
            <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    {[
                      'Date',
                      'Round',
                      'Start time',
                      'Started',
                      'Finished',
                      'Scanned',
                      'Status',
                      'Escalations',
                      'Guards',
                    ].map((h) => (
                      <TableCell key={h}>{h}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {d.data.map((r) => {
                    const st = LOG_STATUS[r.logStatus];
                    return (
                      <TableRow key={r.key}>
                        <TableCell>{fmtDate(r.at)}</TableCell>
                        <TableCell>{r.roundName}</TableCell>
                        <TableCell sx={{ fontFamily: fonts.mono }}>{hhmm(r.at)}</TableCell>
                        <TableCell sx={{ color: r.firstAt && r.lateMin > r.graceMin ? 'error.main' : undefined }}>
                          {r.firstAt ? `${hhmm(r.firstAt)} (+${r.lateMin} min)` : '—'}
                        </TableCell>
                        <TableCell>{r.done === r.total && r.lastAt ? hhmm(r.lastAt) : '—'}</TableCell>
                        <TableCell>
                          {r.done}/{r.total}
                          {r.missing.length ? (
                            <Typography variant="body2" sx={{ color: 'error.main' }}>
                              Missed: {r.missing.join(', ')}
                            </Typography>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <Chip size="small" variant={st.variant} label={st.label} />
                        </TableCell>
                        <TableCell>
                          {r.escalations.length
                            ? r.escalations.map((e, i) => (
                                <Typography key={i} variant="body2">
                                  {hhmm(e.at)} {e.label} → {e.recipients.join(', ')}
                                </Typography>
                              ))
                            : 'None'}
                        </TableCell>
                        <TableCell>{r.guards.join(', ') || '—'}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Paper>
          )}
        </>
      )}
    </>
  );
}

/** Every checkpoint scan from the last 3 days. */
function ScanLog() {
  const query = useMemo(() => ({ days: 3, limit: 30 }), []);
  const list = usePaginatedQuery(patrolApi.scans, query, { append: true });
  usePatrolChanges(list.refresh);
  if (list.loading && !list.data.length)
    return (
      <Box sx={{ py: 6, display: 'grid', placeItems: 'center' }}>
        <CircularProgress />
      </Box>
    );
  if (!list.data.length)
    return <EmptyState title="No scans yet" text="Every checkpoint scan from the last 3 days shows here." />;
  return (
    <Stack spacing={1}>
      {list.data.map((s) => (
        <Paper key={s.id} variant="outlined" sx={{ p: 1.25 }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <VisitorThumb src={s.photoUrl} name={s.checkpoint.name} size={44} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                <Typography sx={{ fontWeight: 700 }}>{s.checkpoint.name}</Typography>
                {s.status === 'issue' ? <Chip size="small" variant="issue" label="Issue" /> : null}
                {s.manual ? <Chip size="small" variant="exited" label="Code typed" /> : null}
              </Stack>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {s.by?.name} · {s.roundName ? `${s.roundName} ${hhmm(s.slotAt)}` : 'Extra scan (no round due)'}
                {s.note ? ` · “${s.note}”` : ''}
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
              {fmtDateTime(s.at)}
            </Typography>
          </Stack>
        </Paper>
      ))}
      {list.pagination.hasNextPage ? (
        <Box sx={{ textAlign: 'center' }}>
          <Button variant="outlined" onClick={list.loadMore} disabled={list.loadingMore}>
            {list.loadingMore ? 'Loading…' : 'Load more'}
          </Button>
        </Box>
      ) : null}
    </Stack>
  );
}

/** `/patrol` — rounds, the late & missed log, the scan log, and the scanner. `?cp=CODE` opens a scan. */
export function PatrolsPage() {
  const user = useUser();
  const operator = canOperate(user);
  const admin = isAdmin(user);
  const now = useNow(15_000);
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = ['rounds', 'late', 'scans'].includes(params.get('tab')) ? params.get('tab') : 'rounds';
  const [board, setBoard] = useState(null);
  const [error, setError] = useState(null);
  // ?cp=CODE (the printed QR opened in the browser) opens the scan straight away.
  const cp = params.get('cp');
  // ?scan=1 (from TRACK) opens the scanner.
  const scan = params.get('scan');
  const [sheet, setSheet] = useState(() =>
    cp && operator
      ? { kind: 'confirm', code: cp.toUpperCase(), manual: false }
      : scan && operator
        ? { kind: 'scanner' }
        : null,
  );
  const [incident, setIncident] = useState(null);
  const load = useCallback(() => {
    patrolApi
      .board()
      .then((b) => {
        setBoard(b);
        setError(null);
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  usePatrolChanges(load);

  useEffect(() => {
    if (!cp && !scan) return;
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('cp');
        next.delete('scan');
        return next;
      },
      { replace: true },
    );
  }, [cp, scan, setParams]);

  return (
    <>
      <PageHeader
        eyebrow="Site safety"
        title="Patrols"
        right={
          <Stack direction="row" spacing={1}>
            {admin ? (
              <Button variant="outlined" onClick={() => navigate('/settings?tab=patrol')}>
                Set-up
              </Button>
            ) : null}
            {operator ? (
              <Button
                variant="contained"
                startIcon={<QrCodeScannerIcon />}
                onClick={() => setSheet({ kind: 'scanner' })}
              >
                Scan checkpoint
              </Button>
            ) : null}
          </Stack>
        }
      />
      <Tabs
        value={tab}
        onChange={(_, v) => setParams(v === 'rounds' ? {} : { tab: v })}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab value="rounds" label="Rounds" />
        <Tab value="late" label="Late & missed log" />
        <Tab value="scans" label="Scan log" />
      </Tabs>
      {error ? (
        <Alert severity="error" sx={{ mb: 2 }} action={<Button onClick={load}>Retry</Button>}>
          {error}
        </Alert>
      ) : null}
      {tab === 'rounds' ? (
        board ? (
          <Rounds
            board={board}
            now={now}
            operator={operator}
            admin={admin}
            navigate={navigate}
            onScan={() => setSheet({ kind: 'scanner' })}
          />
        ) : (
          <Panel>
            <Typography sx={{ color: 'text.secondary' }}>Loading patrols…</Typography>
          </Panel>
        )
      ) : tab === 'late' ? (
        <LateLog />
      ) : (
        <ScanLog />
      )}
      <ScanSheets
        sheet={sheet}
        setSheet={setSheet}
        onScanned={load}
        onIncident={(initial) => {
          setSheet(null);
          setIncident({ kind: 'report', initial });
        }}
      />
      <IncidentSheets
        sheet={incident}
        onClose={() => setIncident(null)}
        onReported={(i) => {
          setIncident(null);
          toast(`Reported · ${i.id}`);
        }}
        onChanged={() => {}}
      />
    </>
  );
}
