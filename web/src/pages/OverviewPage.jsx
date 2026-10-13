import AddIcon from '@mui/icons-material/Add';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router';
import { errorMessage } from '../api/client';
import { statsApi, visitsApi } from '../api/endpoints';
import { useUser } from '../auth/context';
import { canOperate } from '../auth/roles';
import { PageHeader, Panel } from '../components/bits';
import { VisitorCard } from '../components/VisitorCard';
import { useNow } from '../hooks';
import { usePaginatedQuery } from '../hooks/usePaginatedQuery';
import { useVisitChanges } from '../realtime/context';
import { useSettings, useVisitUi } from '../state/context';
import { fonts } from '../theme/tokens';
import { fmtHour, fmtLongDay, fmtMinutes } from '../utils/format';
import { visitStatus } from '../utils/visit';

const REFRESH_MS = 5 * 60 * 1000;

function useOverview() {
  const [state, setState] = useState({ loaded: false, data: null, error: null });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    const ctrl = new AbortController();
    statsApi
      .overview(ctrl.signal)
      .then((data) => setState({ loaded: true, data, error: null }))
      .catch((err) => {
        if (!ctrl.signal.aborted) setState((s) => ({ ...s, loaded: true, error: errorMessage(err) }));
      });
    const t = setTimeout(() => setNonce((n) => n + 1), REFRESH_MS);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [nonce]);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, loading: !state.loaded, refresh };
}

function StatTile({ label, value, tone }) {
  return (
    <Paper
      variant="outlined"
      sx={(theme) => ({
        p: { xs: 1.75, md: 2.25 },
        height: '100%',
        ...(tone === 'accent' && {
          bgcolor: theme.vars.palette.gb.accentSoft,
          borderColor: theme.vars.palette.gb.accent,
        }),
        ...(tone === 'warn' && { bgcolor: theme.vars.palette.gb.warnSoft, borderColor: theme.vars.palette.gb.warn }),
      })}
    >
      <Typography
        variant="eyebrow"
        sx={{ color: tone === 'warn' ? 'warning.main' : 'text.secondary', fontSize: '0.78rem' }}
      >
        {label}
      </Typography>
      <Typography
        variant="display"
        sx={{
          mt: 0.75,
          color: tone === 'warn' ? 'warning.main' : 'text.primary',
          fontSize: { xs: '2.1rem', md: '2.6rem' },
        }}
      >
        {value}
      </Typography>
    </Paper>
  );
}

function HourBars({ byHour }) {
  const hours = Array.from({ length: 17 }, (_, i) => i + 6);
  const counts = new Map(byHour.map((b) => [b.hour, b.count]));
  const max = Math.max(1, ...hours.map((h) => counts.get(h) ?? 0));
  return (
    <Box>
      <Stack direction="row" spacing={{ xs: 0.4, sm: 0.75 }} sx={{ alignItems: 'flex-end', height: 170 }}>
        {hours.map((h) => {
          const c = counts.get(h) ?? 0;
          return (
            <Stack
              key={h}
              sx={{ flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center' }}
              title={`${fmtHour(h)}: ${c}`}
            >
              {c > 0 ? (
                <Typography sx={{ fontFamily: fonts.mono, fontSize: 10.5, color: 'text.secondary', mb: 0.25 }}>
                  {c}
                </Typography>
              ) : null}
              <Box
                sx={{
                  width: '100%',
                  height: `${(c / max) * 100}%`,
                  minHeight: c > 0 ? 4 : 2,
                  bgcolor: c > 0 ? 'gb.accent' : 'gb.line',
                  borderRadius: '4px 4px 0 0',
                }}
              />
            </Stack>
          );
        })}
      </Stack>
      <Stack
        direction="row"
        spacing={{ xs: 0.4, sm: 0.75 }}
        sx={{ mt: 0.75, borderTop: 1, borderColor: 'divider', pt: 0.5 }}
      >
        {hours.map((h) => (
          <Box
            key={h}
            sx={{
              flex: 1,
              textAlign: 'center',
              fontFamily: fonts.mono,
              fontSize: 10.5,
              color: 'text.secondary',
              whiteSpace: 'nowrap',
            }}
          >
            {(h - 6) % 3 === 0 ? fmtHour(h) : ''}
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

function HBars({ items, color, empty }) {
  if (!items.length) return <Typography sx={{ color: 'text.secondary' }}>{empty}</Typography>;
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <Stack spacing={1.25}>
      {items.map((i) => (
        <Box key={i.label}>
          <Stack direction="row" sx={{ justifyContent: 'space-between', mb: 0.4 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {i.label}
            </Typography>
            <Typography variant="mono" sx={{ color: 'text.secondary' }}>
              {i.count}
            </Typography>
          </Stack>
          <Box sx={{ height: 10, borderRadius: 5, bgcolor: 'gb.sunk', overflow: 'hidden' }}>
            <Box sx={{ height: '100%', width: `${(i.count / max) * 100}%`, bgcolor: color, borderRadius: 5 }} />
          </Box>
        </Box>
      ))}
    </Stack>
  );
}

export function OverviewPage() {
  const user = useUser();
  const navigate = useNavigate();
  const { settings } = useSettings();
  const { openDetails, openExit } = useVisitUi();
  const now = useNow();
  const ov = useOverview();

  // "Needs attention": first 5 overstaying visitors, paginated server-side.
  const attentionQuery = useMemo(() => ({ overstay: 'true', page: 1, limit: 5 }), []);
  const attention = usePaginatedQuery(visitsApi.inside, attentionQuery);

  const { refresh: refreshOverview } = ov;
  const { refresh: refreshAttention } = attention;
  const refreshAll = useCallback(() => {
    refreshOverview();
    refreshAttention();
  }, [refreshOverview, refreshAttention]);
  useVisitChanges(refreshAll, 600);

  const o = ov.data;
  const hours = o?.overstayHours ?? settings?.overstayHours ?? 4;
  const overCount = o?.overstayCount ?? attention.pagination.total;

  return (
    <>
      <PageHeader
        eyebrow={fmtLongDay(now)}
        title="Today at the gate"
        right={
          <Button
            variant="contained"
            color="primary"
            size="large"
            startIcon={<AddIcon />}
            onClick={() => navigate('/check-in')}
          >
            Check in a visitor
          </Button>
        }
      />

      {ov.error ? (
        <Alert severity="error" sx={{ mb: 2 }} action={<Button onClick={ov.refresh}>Retry</Button>}>
          {ov.error}
        </Alert>
      ) : null}

      <Grid container spacing={{ xs: 1.5, md: 2 }} sx={{ mb: { xs: 1.5, md: 2 } }}>
        <Grid size={{ xs: 6, md: 4, xl: 'grow' }}>
          <StatTile label="Inside now" value={o ? o.insideNow : '–'} tone="accent" />
        </Grid>
        <Grid size={{ xs: 6, md: 4, xl: 'grow' }}>
          <StatTile label="Entries today" value={o ? o.entriesToday : '–'} />
        </Grid>
        <Grid size={{ xs: 6, md: 4, xl: 'grow' }}>
          <StatTile label="Persons today" value={o ? o.personsToday : '–'} />
        </Grid>
        <Grid size={{ xs: 6, md: 4, xl: 'grow' }}>
          <StatTile
            label="Average stay"
            value={o ? (o.avgStayMinutes === null ? '–' : fmtMinutes(o.avgStayMinutes)) : '–'}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 4, xl: 'grow' }}>
          <StatTile
            label={`Over ${hours} h inside`}
            value={o ? overCount : '–'}
            tone={overCount > 0 ? 'warn' : undefined}
          />
        </Grid>
      </Grid>

      <Grid container spacing={{ xs: 1.5, md: 2 }}>
        <Grid size={{ xs: 12, lg: 7 }}>
          <Panel title="Arrivals by hour">{o ? <HourBars byHour={o.byHour} /> : <Box sx={{ height: 200 }} />}</Panel>
        </Grid>
        <Grid size={{ xs: 12, lg: 5 }}>
          <Panel title="Why they came">
            {o ? <HBars items={o.byPurpose} color="gb.ink" empty="No entries yet today." /> : null}
          </Panel>
        </Grid>
        <Grid size={{ xs: 12, lg: 7 }}>
          <Panel
            title="Needs attention"
            action={
              attention.pagination.total > 0 ? (
                <Button component={RouterLink} to="/inside?overstay=true" size="small" variant="text">
                  View all ({attention.pagination.total})
                </Button>
              ) : null
            }
          >
            {attention.error ? <Alert severity="error">{attention.error}</Alert> : null}
            {!attention.loading && !attention.error && attention.data.length === 0 ? (
              <Typography sx={{ color: 'text.secondary' }}>
                No one has been inside longer than {hours} hours. Visitors who stay past the limit show up here.
              </Typography>
            ) : (
              <Stack spacing={1.25}>
                {attention.data.map((v) => (
                  <VisitorCard
                    key={v.id}
                    visit={v}
                    now={now}
                    status={visitStatus(v, hours, now)}
                    onOpen={() => openDetails(v)}
                    onExit={canOperate(user) ? () => openExit(v) : undefined}
                  />
                ))}
              </Stack>
            )}
          </Panel>
        </Grid>
        <Grid size={{ xs: 12, lg: 5 }}>
          <Panel title="Departments visited">
            {o ? <HBars items={o.byDept} color="gb.accent" empty="No entries yet today." /> : null}
          </Panel>
        </Grid>
      </Grid>
    </>
  );
}
