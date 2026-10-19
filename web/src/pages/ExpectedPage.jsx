import AddIcon from '@mui/icons-material/Add';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import SearchIcon from '@mui/icons-material/Search';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Grid from '@mui/material/Grid';
import InputAdornment from '@mui/material/InputAdornment';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMemo, useState } from 'react';
import { errorMessage } from '../api/client';
import { expectedApi, visitsApi } from '../api/endpoints';
import { useUser } from '../auth/context';
import { canOperate, hasModule, isGateUser } from '../auth/roles';
import { EmptyState, PageHeader } from '../components/bits';
import { usePaginatedQuery } from '../hooks/usePaginatedQuery';
import { useUrlListParams } from '../hooks/useUrlListParams';
import { useExpectedChanges, useLocalEmit, useRealtimeEvent } from '../realtime/context';
import { useExpected, useMaterialUi, useToast, useVisitUi } from '../state/context';
import { fonts } from '../theme/tokens';
import { fmtDate, fmtTime, startOfLocalDay } from '../utils/format';
import { boxesLine, expectedStateChip, expectedTitle, mayManageExpected, mayPreRegister } from '../utils/expected';

const DEFAULTS = { tab: '', q: '', limit: 20 };
const CHIP = { wait: 'pending', go: 'inside', bad: 'issue', neutral: 'exited' };

/** Time column: "TODAY 3:00 pm" / "21 OCT 3:00 pm" (+ "to 4:00 pm"). */
function When({ e }) {
  const at = new Date(e.expectedAt);
  const today = startOfLocalDay(at).getTime() === startOfLocalDay().getTime();
  return (
    <Box
      sx={{
        width: 84,
        flexShrink: 0,
        textAlign: 'center',
        borderRadius: 1,
        bgcolor: 'gb.accentSoft',
        py: 1,
        px: 0.5,
        alignSelf: 'flex-start',
      }}
    >
      <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: 'text.secondary' }}>
        {today
          ? 'TODAY'
          : fmtDate(at)
              .replace(/ \d{4}$/, '')
              .toUpperCase()}
      </Typography>
      <Typography sx={{ fontFamily: fonts.mono, fontWeight: 600, fontSize: 15 }}>{fmtTime(at)}</Typography>
      {e.untilAt ? (
        <Typography sx={{ fontFamily: fonts.mono, fontSize: 11, color: 'text.secondary' }}>
          to {fmtTime(e.untilAt)}
        </Typography>
      ) : null}
    </Box>
  );
}

/** One expected visitor / delivery with what the viewer can do with it. */
function ExpectedCard({ e, onReceive, onCancel }) {
  const user = useUser();
  const { checkInFrom, openEdit } = useExpected();
  const { openDetails } = useVisitUi();
  const { openDetail: openMaterial } = useMaterialUi();
  const chip = expectedStateChip(e);
  const delivery = e.kind === 'delivery';
  const open = e.status === 'expected';
  const people = [e.host.name, ...e.also.map((a) => a.name)].join(', ');
  const visitorLine = [e.company, e.purpose, e.persons > 1 ? `${e.persons} persons` : ''].filter(Boolean).join(' · ');
  return (
    <Paper
      variant="outlined"
      sx={(theme) => ({
        p: 1.5,
        display: 'flex',
        gap: 1.5,
        opacity: open ? 1 : 0.8,
        ...(delivery && { borderLeft: `4px solid ${theme.vars.palette.gb.ok}` }),
      })}
    >
      <When e={e} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          {delivery ? <Inventory2OutlinedIcon fontSize="small" sx={{ color: 'success.main' }} /> : null}
          <Typography sx={{ fontWeight: 700, fontSize: '1.05rem', wordBreak: 'break-word' }}>
            {expectedTitle(e)}
          </Typography>
          <Chip size="small" variant={CHIP[chip.tone]} label={chip.label} />
          {!delivery && e.preapproved && open ? <Chip size="small" variant="inside" label="Pre-approved" /> : null}
        </Stack>
        {delivery ? (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {boxesLine(e)}
            {e.name ? ` · carried by ${e.name}` : ''}
          </Typography>
        ) : visitorLine ? (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {visitorLine}
          </Typography>
        ) : null}
        <Typography variant="body2">
          {delivery ? 'To be received by' : e.contact ? `Received by ${e.contact.name} · for` : 'To meet'}{' '}
          <b>{people}</b>
          {e.createdBy.id !== e.host.id ? (
            <Box component="span" sx={{ color: 'text.secondary' }}>
              {' '}
              · registered by {e.createdBy.name}
            </Box>
          ) : null}
        </Typography>
        {!delivery && boxesLine(e) ? <Typography variant="body2">Bringing {boxesLine(e)}</Typography> : null}
        {e.items || e.vehicle ? (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {[e.items ? `Bringing: ${e.items}` : '', e.vehicle ? `Vehicle ${e.vehicle}` : '']
              .filter(Boolean)
              .join(' · ')}
          </Typography>
        ) : null}
        {e.notes ? (
          <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
            “{e.notes}”
          </Typography>
        ) : null}
        <Typography variant="body2" sx={{ fontFamily: fonts.mono, fontSize: 12, color: 'text.secondary', mt: 0.25 }}>
          {e.phone ? `${e.phone} · ` : ''}
          {e.code}
          {e.arrivedAt
            ? ` · ${delivery ? 'received' : 'arrived'} ${fmtTime(e.arrivedAt)}${e.arrivedBy ? ` by ${e.arrivedBy.name}` : ''}`
            : ''}
          {e.cancelledBy ? ` · cancelled by ${e.cancelledBy.name}` : ''}
        </Typography>
      </Box>
      <Stack spacing={1} sx={{ alignItems: 'flex-end', flexShrink: 0 }}>
        {open && canOperate(user) && !delivery ? (
          <Button size="small" variant="contained" color="success" onClick={() => checkInFrom(e)}>
            Check in
          </Button>
        ) : null}
        {open && canOperate(user) && delivery ? (
          <Button size="small" variant="contained" color="success" onClick={() => onReceive(e)}>
            Received
          </Button>
        ) : null}
        {e.mpId && hasModule(user, 'material') ? (
          <Button size="small" variant="outlined" onClick={() => openMaterial(e.mpId)}>
            Gate pass
          </Button>
        ) : null}
        {e.visitId && isGateUser(user) ? (
          <Button size="small" variant="outlined" onClick={() => visitsApi.get(e.visitId).then(openDetails, () => {})}>
            View visit
          </Button>
        ) : null}
        {mayManageExpected(e, user) ? (
          <>
            <Button size="small" onClick={() => openEdit(e)}>
              Edit
            </Button>
            <Button size="small" color="error" onClick={() => onCancel(e)}>
              Cancel
            </Button>
          </>
        ) : null}
      </Stack>
    </Paper>
  );
}

/**
 * Expected visitors and deliveries. Gate users: Today · Upcoming · Earlier (everything at the gate); others:
 * Upcoming · Earlier (what they registered, host, receive or are told about). Tab and search live in the URL.
 */
export function ExpectedPage() {
  const user = useUser();
  const gate = isGateUser(user);
  const toast = useToast();
  const emit = useLocalEmit();
  const { openNew } = useExpected();
  const { openNew: openNewMaterial } = useMaterialUi();
  const { params, setParams, search, setSearch } = useUrlListParams(DEFAULTS);
  const tabs = gate
    ? [
        ['today', 'Today'],
        ['upcoming', 'Upcoming'],
        ['earlier', 'Earlier'],
      ]
    : [
        ['upcoming', 'Upcoming'],
        ['earlier', 'Earlier'],
      ];
  // A search covers every tab (e.g. a notification opens /expected?q=EX-…).
  const tab = params.q ? 'all' : tabs.some(([k]) => k === params.tab) ? params.tab : tabs[0][0];
  const query = useMemo(
    () => ({ when: tab, q: params.q || undefined, limit: params.limit }),
    [tab, params.q, params.limit],
  );
  const list = usePaginatedQuery(expectedApi.list, query, { append: true });
  useExpectedChanges(list.refresh, 300);
  useRealtimeEvent('expected:changed', ({ expected }) => list.patch(expected, true));

  const [confirm, setConfirm] = useState(null);
  const run = async (fn, e, done) => {
    try {
      const saved = await fn(e.code);
      emit('expected:changed', { expected: saved });
      list.patch(saved, true);
      toast(done(saved));
    } catch (err) {
      toast(errorMessage(err));
    }
  };
  // With Material gate passes, security counts the boxes on a Material IN pass made from the entry.
  const receive = (e) =>
    hasModule(user, 'material')
      ? openNewMaterial({ direction: 'in', expected: e })
      : run(
          expectedApi.received,
          e,
          (s) => `${s.company} received${s.boxes ? ` · ${boxesLine(s)}` : ''}. ${s.host.name} has been told.`,
        );

  const canAdd = mayPreRegister(user);
  return (
    <>
      <PageHeader
        eyebrow={gate ? 'Visitors' : 'Host desk'}
        title="Expected"
        right={
          canAdd ? (
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" startIcon={<Inventory2OutlinedIcon />} onClick={() => openNew('delivery')}>
                Expect a delivery
              </Button>
              <Button variant="contained" color="primary" startIcon={<AddIcon />} onClick={() => openNew('visitor')}>
                Expect a visitor
              </Button>
            </Stack>
          ) : null
        }
      />
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2, maxWidth: '75ch' }}>
        {gate
          ? 'Visitors and deliveries registered in advance. When a visitor arrives, tap Check in: their details are filled in and you take the photo. When a delivery arrives, tap Received.'
          : 'Register a visitor or a delivery before it comes. Security is notified and fills in the check-in from your entry; you are told when they arrive.'}
      </Typography>
      {!canAdd && user.role !== 'viewer' ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          You have not been given the right to pre-register visitors. An admin can switch it on in Settings → Users.
        </Alert>
      ) : null}

      <Grid container spacing={1.5} sx={{ mb: 2, alignItems: 'center' }}>
        <Grid size={{ xs: 12, md: 'auto' }}>
          <Tabs value={params.q ? false : tab} onChange={(_, v) => setParams({ tab: v, q: '' })}>
            {tabs.map(([k, label]) => (
              <Tab key={k} value={k} label={label} />
            ))}
          </Tabs>
        </Grid>
        <Grid size={{ xs: 12, sm: 8, md: 5 }}>
          <TextField
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, mobile, company, code…"
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              },
              htmlInput: { 'aria-label': 'Search expected visitors', type: 'search' },
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
          title={params.q ? 'No match' : tab === 'earlier' ? 'Nothing earlier' : 'No one expected'}
          text={
            params.q
              ? 'Try a different name, number or code.'
              : gate
                ? 'Employees pre-register visitors and deliveries from their phone or computer.'
                : 'Tap “Expect a visitor” to pre-register someone.'
          }
        />
      ) : (
        <Box sx={{ opacity: list.loading ? 0.6 : 1 }}>
          <Grid container spacing={1.5}>
            {list.data.map((e) => (
              <Grid key={e.code} size={{ xs: 12, xl: 6 }}>
                <ExpectedCard e={e} onReceive={receive} onCancel={setConfirm} />
              </Grid>
            ))}
          </Grid>
          {list.pagination.hasNextPage ? (
            <Box sx={{ textAlign: 'center', mt: 2.5 }}>
              <Button variant="outlined" onClick={list.loadMore} disabled={list.loadingMore}>
                {list.loadingMore ? 'Loading…' : `Load more · ${list.pagination.total - list.data.length} more`}
              </Button>
            </Box>
          ) : null}
        </Box>
      )}

      <Dialog open={!!confirm} onClose={() => setConfirm(null)} fullWidth maxWidth="xs">
        <DialogTitle>Cancel this pre-registration?</DialogTitle>
        <DialogContent>
          <Typography>
            {confirm ? `${expectedTitle(confirm)} · security and the people concerned are told.` : ''}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(null)}>Keep</Button>
          <Button
            color="error"
            variant="contained"
            onClick={async () => {
              const e = confirm;
              setConfirm(null);
              await run(expectedApi.cancel, e, () => 'Cancelled. Security has been told.');
            }}
          >
            Cancel it
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
