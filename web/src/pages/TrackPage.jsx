import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { keyframes } from '@mui/system';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { errorMessage } from '../api/client';
import { mailApi, visitsApi } from '../api/endpoints';
import { EmptyState, PageHeader } from '../components/bits';
import { useNow } from '../hooks';
import { useMailUi, useMaterialUi, useSite, useToast, useTrack, useVisitUi } from '../state/context';
import { hhmm } from '../utils/ops';

const pulse = keyframes`
  0%, 100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.55); }
  50% { box-shadow: 0 0 0 8px rgba(220, 38, 38, 0); }
`;

/** Card colours per tone. */
function toneSx(tone) {
  return (t) => {
    const p = t.vars.palette.gb;
    if (tone === 'alarm')
      return { bgcolor: p.bad, color: '#fff', borderColor: p.bad, animation: `${pulse} 1.4s infinite` };
    if (tone === 'go') return { bgcolor: p.okSoft, borderColor: p.ok };
    if (tone === 'bad') return { bgcolor: p.badSoft, borderColor: p.bad };
    return { bgcolor: p.warnSoft, borderColor: p.warn };
  };
}

/** The buttons for one item. */
function Actions({ item: i, busy, run }) {
  const navigate = useNavigate();
  const { allow, openExit } = useVisitUi();
  const { openDetails, openResolve } = useMailUi();
  const { openDetail } = useMaterialUi();
  const { quiet, isQuiet } = useTrack();
  const x = i.extra ?? {};
  const visit = { id: x.visitId, name: x.name };
  const exit = () => run(async () => openExit(await visitsApi.get(x.visitId)));
  // On the red alarm card: white outline buttons (the theme's outlined buttons are white-filled).
  const light =
    i.tone === 'alarm'
      ? {
          color: '#fff',
          bgcolor: 'transparent',
          borderColor: 'rgba(255,255,255,0.7)',
          '&:hover': { bgcolor: 'rgba(255,255,255,0.12)', borderColor: '#fff' },
        }
      : undefined;
  /** @param {string} label @param {() => void} onClick @param {'contained' | 'outlined'} [variant] */
  const b = (label, onClick, variant = 'outlined') => (
    <Button
      key={label}
      size="small"
      variant={variant}
      onClick={onClick}
      disabled={busy}
      sx={variant === 'outlined' ? light : undefined}
    >
      {label}
    </Button>
  );
  const call = (phone, label) =>
    phone ? (
      <Button key={label} size="small" variant="outlined" href={`tel:${phone}`} sx={light}>
        {label}
      </Button>
    ) : null;
  switch (i.kind) {
    case 'visit_go':
      return [b('Allowed in', () => run(() => allow(visit)), 'contained')];
    case 'visit_declined':
      return [b('Mark exit', exit, 'contained')];
    case 'visit_noreply':
      return [
        call(x.hostPhone, 'Call host'),
        b('Confirmed by phone', () => run(() => allow(visit, true)), 'contained'),
        b('Exit', exit),
      ];
    case 'visit_manual':
      return [b('Confirmed, allow in', () => run(() => allow(visit, true)), 'contained'), b('Exit', exit)];
    case 'mail_disputed':
      return [
        b('View', () => run(async () => openDetails(await mailApi.get(i.ref.id)))),
        b('Resolve', () => run(async () => openResolve(await mailApi.get(i.ref.id))), 'contained'),
      ];
    case 'material_disputed':
    case 'material_overdue':
      return [b('View', () => openDetail(i.ref.id), 'contained')];
    case 'key_overdue':
      return [call(x.phone, 'Call'), b('Key board', () => navigate('/keys'), 'contained')];
    case 'patrol_late':
      return [
        b(isQuiet(i.id) ? 'Silenced' : 'Silence 5 min', () => quiet(i.id)),
        <Button
          key="scan"
          size="small"
          variant="contained"
          color="inherit"
          sx={{ color: 'error.main' }}
          onClick={() => navigate('/patrol?scan=1')}
        >
          Scan now
        </Button>,
      ];
    case 'patrol_due':
      return [b('Scan', () => navigate('/patrol?scan=1'), 'contained')];
    case 'incident_critical':
      return [b('View', () => navigate(`/incidents?open=${encodeURIComponent(i.ref.id)}`), 'contained')];
    case 'gen_low':
      return [b('Log fill', () => navigate('/generator'), 'contained')];
    case 'gen_check':
      return [b('Check now', () => navigate('/generator'), 'contained')];
    default:
      return null;
  }
}

function ItemCard({ item: i }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = async (fn) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Paper variant="outlined" sx={[{ p: 1.5, borderWidth: 1.5 }, toneSx(i.tone)]}>
      <Typography sx={{ fontWeight: 700 }}>{i.title}</Typography>
      <Typography variant="body2" sx={{ mt: 0.25, opacity: 0.9 }}>
        {i.body}
      </Typography>
      <Stack direction="row" sx={{ gap: 1, mt: 1, flexWrap: 'wrap' }}>
        <Actions item={i} busy={busy} run={run} />
      </Stack>
    </Paper>
  );
}

/** `/track` — everything at this gate that needs someone to act now. */
export function TrackPage() {
  const { data, error, refresh } = useTrack();
  const { site } = useSite();
  const navigate = useNavigate();
  const [cat, setCat] = useState('all');
  useNow(30_000);
  const items = data?.items ?? [];
  const byCat = data?.counts?.byCat ?? {};
  const cats = (data?.cats ?? []).filter((c) => byCat[c.key]);
  const shown = cat !== 'all' && byCat[cat] ? cat : 'all';
  const n = items.length;

  return (
    <>
      <PageHeader
        eyebrow={`${site ? `${site} · ` : ''}live`}
        title="TRACK"
        right={
          <Typography sx={{ fontWeight: 700, color: n ? 'error.main' : 'success.main' }}>
            {n ? `${n} item${n === 1 ? ' needs' : 's need'} action` : 'All clear'}
          </Typography>
        }
      />
      {error ? (
        <Alert severity="error" sx={{ mb: 2 }} action={<Button onClick={refresh}>Retry</Button>}>
          {error}
        </Alert>
      ) : null}
      {!data ? (
        <Box sx={{ py: 6, display: 'grid', placeItems: 'center' }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          {cats.length ? (
            <Stack direction="row" sx={{ gap: 1, mb: 2, flexWrap: 'wrap' }}>
              <Chip
                label="All"
                color={shown === 'all' ? 'primary' : 'default'}
                onClick={() => setCat('all')}
                aria-pressed={shown === 'all'}
              />
              {cats.map((c) => (
                <Chip
                  key={c.key}
                  label={`${c.label} ${byCat[c.key]}`}
                  color={shown === c.key ? 'primary' : 'default'}
                  onClick={() => setCat(c.key)}
                  aria-pressed={shown === c.key}
                />
              ))}
            </Stack>
          ) : null}
          {!n ? (
            <EmptyState
              title="All clear"
              text="Nothing needs action right now. Visitors to send in, unanswered hosts, overdue keys and material, late patrols, critical incidents and diesel alerts all appear here."
            />
          ) : (
            <Stack spacing={2.5}>
              {cats
                .filter((c) => shown === 'all' || c.key === shown)
                .map((c) => (
                  <Box component="section" key={c.key}>
                    {shown === 'all' ? (
                      <Typography variant="h3" sx={{ mb: 1 }}>
                        {c.label}{' '}
                        <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>
                          {byCat[c.key]}
                        </Box>
                      </Typography>
                    ) : null}
                    <Stack spacing={1}>
                      {items
                        .filter((i) => i.cat === c.key)
                        .map((i) => (
                          <ItemCard key={i.id} item={i} />
                        ))}
                    </Stack>
                  </Box>
                ))}
            </Stack>
          )}
          {data.materialInProgress ? (
            <Box sx={{ mt: 3 }}>
              <Button variant="outlined" onClick={() => navigate('/material?tab=gate')}>
                Material in progress · {data.materialInProgress}
              </Button>
            </Box>
          ) : null}
          {data.expectedSoon?.length ? (
            <Box sx={{ mt: 3 }}>
              <Typography variant="h3" sx={{ mb: 1 }}>
                Expected in the next 2 hours{' '}
                <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>
                  {data.expectedSoon.length}
                </Box>
              </Typography>
              <Stack spacing={1}>
                {data.expectedSoon.map((e) => (
                  <Paper
                    key={e.id}
                    variant="outlined"
                    sx={{ p: 1.25, cursor: 'pointer' }}
                    onClick={() => navigate(`/expected?q=${encodeURIComponent(e.id)}`)}
                  >
                    <Typography sx={{ fontWeight: 600 }}>
                      {hhmm(e.at)} · {e.title}
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                      {e.body}
                    </Typography>
                  </Paper>
                ))}
              </Stack>
            </Box>
          ) : null}
        </>
      )}
    </>
  );
}
