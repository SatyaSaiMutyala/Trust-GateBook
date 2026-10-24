import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '../api/client';
import { keysApi } from '../api/endpoints';
import { EmptyState, PageHeader } from '../components/bits';
import { useNow } from '../hooks';
import { useRealtimeEvent } from '../realtime/context';
import { fonts } from '../theme/tokens';
import { fmtDateTime, fmtRelative, fmtTime } from '../utils/format';
import { KEY_STATE } from '../utils/keys';

const CHIP_VARIANT = { ok: 'inside', warn: 'pending', bad: 'issue', muted: 'exited' };

/** One key issued to me (still with me, or given back). */
function MyKeyCard({ move: m, now }) {
  const s = KEY_STATE[m.state];
  const back = !!m.returnedAt;
  const overdue = m.state === 'overdue';
  return (
    <Paper
      variant="outlined"
      sx={(theme) => ({
        p: 1.5,
        borderColor: overdue ? theme.vars.palette.gb.bad : back ? undefined : theme.vars.palette.gb.accent,
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
            bgcolor: back ? theme.vars.palette.gb.okSoft : theme.vars.palette.gb.accentSoft,
            color: back ? theme.vars.palette.gb.ok : theme.vars.palette.gb.warn,
          })}
        >
          <Typography sx={{ fontFamily: fonts.mono, fontWeight: 700, fontSize: 16 }}>{m.key.number}</Typography>
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700 }}>{m.key.name}</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {[m.key.location, m.site].filter(Boolean).join(' · ')}
          </Typography>
          <Typography variant="body2" sx={{ color: overdue ? 'error.main' : 'text.secondary', mt: 0.5 }}>
            {back
              ? `Given back ${fmtDateTime(m.returnedAt)}${m.receivedBy ? ` · taken by ${m.receivedBy.name}` : ''}`
              : `Taken ${fmtRelative(m.issuedAt, now)}${
                  m.dueAt ? ` · ${overdue ? 'was due' : 'return by'} ${fmtTime(m.dueAt)}` : ' · no return time'
                }`}
            {m.purpose ? ` · ${m.purpose}` : ''}
          </Typography>
        </Box>
        <Chip size="small" variant={CHIP_VARIANT[s.tone]} label={s.label} />
      </Stack>
    </Paper>
  );
}

/** My keys: the keys the gate has issued to me, read only. Returning is done at the security desk. */
export function MyKeysPage() {
  const now = useNow(60000);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  // Bumped to fetch again (a key was issued / taken back, the socket reconnected, Retry).
  const [tick, setTick] = useState(0);
  const load = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    const ctl = new AbortController();
    keysApi.mine(ctl.signal).then(
      (r) => {
        setData(r);
        setError('');
      },
      (err) => {
        if (!ctl.signal.aborted) setError(errorMessage(err));
      },
    );
    return () => ctl.abort();
  }, [tick]);
  useRealtimeEvent('mykeys:changed', load);
  useRealtimeEvent('reconnect', load);

  const open = data?.data ?? [];
  const returned = data?.returned ?? [];
  const overdue = data?.counts?.overdue ?? 0;
  return (
    <Box>
      <PageHeader eyebrow="My desk" title="My keys" />
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
        Keys the security desk has given you. Please hand them back at the desk by the return time.
      </Typography>
      {error ? (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" size="small" onClick={() => load()}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      ) : null}
      {!data && !error ? (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <CircularProgress size={28} />
        </Box>
      ) : null}
      {data ? (
        <Stack spacing={1.5}>
          {overdue ? (
            <Alert severity="error">
              {overdue === 1 ? 'A key is' : `${overdue} keys are`} past the return time. Please take{' '}
              {overdue === 1 ? 'it' : 'them'} back to the security desk.
            </Alert>
          ) : null}
          <Typography variant="h3">With me · {open.length}</Typography>
          {open.length ? (
            open.map((m) => <MyKeyCard key={m.id} move={m} now={now} />)
          ) : (
            <EmptyState title="No keys with you" text="When security gives you a key, it shows here." />
          )}
          {returned.length ? (
            <>
              <Typography variant="h3" sx={{ pt: 1.5 }}>
                Given back this week
              </Typography>
              {returned.map((m) => (
                <MyKeyCard key={m.id} move={m} now={now} />
              ))}
            </>
          ) : null}
        </Stack>
      ) : null}
    </Box>
  );
}
