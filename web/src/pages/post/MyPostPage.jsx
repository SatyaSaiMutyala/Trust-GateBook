import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useCallback, useMemo, useState } from 'react';
import { mailApi } from '../../api/endpoints';
import { useUser } from '../../auth/context';
import { EmptyState, FillThumb, PageHeader } from '../../components/bits';
import { MailCard } from '../../components/mail/MailCard';
import { useNow } from '../../hooks';
import { usePaginatedQuery } from '../../hooks/usePaginatedQuery';
import { useMailChanges, useRealtimeEvent } from '../../realtime/context';
import { useMailUi } from '../../state/context';
import { fonts } from '../../theme/tokens';
import { fmtTime } from '../../utils/format';
import { firstWord, whenShort } from '../../utils/mail';

const EARLIER = 'confirmed,closed,disputed,resolved';

function SectionTitle({ children, count }) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1.5, mt: 1 }}>
      <Typography variant="h3">{children}</Typography>
      {count ? <Chip size="small" variant="pending" label={count} sx={{ fontFamily: fonts.mono }} /> : null}
    </Stack>
  );
}

function LoadMore({ list }) {
  if (!list.pagination.hasNextPage) return null;
  return (
    <Box sx={{ textAlign: 'center', mt: 2 }}>
      <Button variant="outlined" onClick={list.loadMore} disabled={list.loadingMore}>
        {list.loadingMore ? 'Loading…' : `Load more · ${list.pagination.total - list.data.length} more`}
      </Button>
    </Box>
  );
}

/** "Please confirm you received these": big card with the confirm / dispute answer. */
function ConfirmCard({ item: m, now, note, onNote }) {
  const { openDetails, confirm } = useMailUi();
  const [busy, setBusy] = useState(false);
  const answer = async (ok) => {
    setBusy(true);
    const done = await confirm(m, ok, note);
    setBusy(false);
    if (done) onNote('');
  };
  const meta = [
    m.carrier ? `Via ${m.carrier}` : '',
    m.refNo,
    m.pieces > 1 ? `${m.pieces} pieces` : '',
    `arrived ${whenShort(m.receivedAt, now)}`,
  ].filter(Boolean);
  return (
    <Paper variant="outlined" sx={{ p: { xs: 1.5, md: 2 }, borderColor: 'success.main', borderWidth: 2 }}>
      <Grid container spacing={2}>
        <Grid size={{ xs: 4, sm: 3 }}>
          <ButtonBase
            onClick={() => openDetails(m)}
            aria-label="Open item details"
            sx={{ width: '100%', aspectRatio: '4 / 3', borderRadius: 1, overflow: 'hidden' }}
          >
            <FillThumb src={m.coverPhotoUrl} name="Cover" />
          </ButtonBase>
        </Grid>
        <Grid size={{ xs: 8, sm: 9 }} sx={{ minWidth: 0 }}>
          <Typography variant="h2" sx={{ fontSize: { xs: '1.25rem', md: '1.6rem' }, wordBreak: 'break-word' }}>
            {m.kind}
            {m.sender ? ` from ${m.sender}` : ''}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            {meta.map((x, i) => (
              <span key={i}>
                {i ? ' · ' : ''}
                {x === m.refNo ? (
                  <Box component="span" sx={{ fontFamily: fonts.mono }}>
                    {x}
                  </Box>
                ) : (
                  x
                )}
              </span>
            ))}
          </Typography>
          <Typography sx={{ mt: 0.75 }}>
            Security handed it to <b>{firstWord(m.collectedBy) || m.collectedBy}</b>
            {m.handedAt ? ` at ${fmtTime(m.handedAt)}` : ''}
          </Typography>
        </Grid>
        <Grid size={12}>
          <TextField
            size="small"
            label="If you did not get it, tell security why"
            value={note}
            onChange={(e) => onNote(e.target.value)}
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 4 }} offset={{ sm: 4 }}>
          <Button
            fullWidth
            variant="outlined"
            disabled={busy}
            onClick={() => answer(false)}
            sx={{ color: 'error.main', borderColor: 'error.main' }}
          >
            I did not get it
          </Button>
        </Grid>
        <Grid size={{ xs: 6, sm: 4 }}>
          <Button fullWidth variant="contained" color="success" disabled={busy} onClick={() => answer(true)}>
            Yes, I collected it
          </Button>
        </Grid>
      </Grid>
    </Paper>
  );
}

export function MyPostPage() {
  const user = useUser();
  const now = useNow();
  // Typed dispute notes live here (by item id), so live refreshes never wipe them.
  const [notes, setNotes] = useState({});

  const handedQ = useMemo(() => ({ recipient: 'me', status: 'handed', sort: '-handedAt', limit: 10 }), []);
  const lodgedQ = useMemo(() => ({ recipient: 'me', status: 'lodged', sort: 'receivedAt', limit: 10 }), []);
  const earlierQ = useMemo(() => ({ recipient: 'me', status: EARLIER, sort: '-receivedAt', limit: 10 }), []);
  const handed = usePaginatedQuery(mailApi.list, handedQ, { append: true });
  const lodged = usePaginatedQuery(mailApi.list, lodgedQ, { append: true });
  const earlier = usePaginatedQuery(mailApi.list, earlierQ, { append: true });

  const { refresh: r1 } = handed;
  const { refresh: r2 } = lodged;
  const { refresh: r3 } = earlier;
  const refreshAll = useCallback(() => {
    r1();
    r2();
    r3();
  }, [r1, r2, r3]);
  useMailChanges(refreshAll, 500);
  useRealtimeEvent('mail:updated', ({ item }) => {
    handed.patch(item, item.status === 'handed');
    lodged.patch(item, item.status === 'lodged');
    earlier.patch(item, EARLIER.split(',').includes(item.status));
  });

  const firstLoad = handed.loading && lodged.loading && earlier.loading;
  const error = handed.error || lodged.error || earlier.error;

  return (
    <>
      <PageHeader eyebrow={`Post room · ${user.name}`} title="My post" />
      {error ? (
        <Alert severity="error" sx={{ mb: 2 }} action={<Button onClick={refreshAll}>Retry</Button>}>
          {error}
        </Alert>
      ) : null}
      {firstLoad ? (
        <Box sx={{ py: 6, display: 'grid', placeItems: 'center' }}>
          <CircularProgress />
        </Box>
      ) : (
        <Grid container spacing={3}>
          {handed.data.length ? (
            <Grid size={12}>
              <SectionTitle count={handed.pagination.total}>Please confirm you received these</SectionTitle>
              <Grid container spacing={1.5}>
                {handed.data.map((m) => (
                  <Grid key={m.id} size={{ xs: 12, lg: 6 }}>
                    <ConfirmCard
                      item={m}
                      now={now}
                      note={notes[m.id] ?? ''}
                      onNote={(v) => setNotes((n) => ({ ...n, [m.id]: v }))}
                    />
                  </Grid>
                ))}
              </Grid>
              <LoadMore list={handed} />
            </Grid>
          ) : null}

          <Grid size={12}>
            <SectionTitle count={lodged.pagination.total}>Waiting for you at the gate</SectionTitle>
            {lodged.data.length === 0 && !lodged.loading ? (
              <EmptyState title="Nothing waiting" text="You'll see post here as soon as security logs it for you." />
            ) : (
              <Grid container spacing={1.5}>
                {lodged.data.map((m) => (
                  <Grid key={m.id} size={{ xs: 12, lg: 6 }}>
                    <MailCard item={m} now={now} employee />
                  </Grid>
                ))}
              </Grid>
            )}
            <LoadMore list={lodged} />
          </Grid>

          {earlier.data.length ? (
            <Grid size={12}>
              <SectionTitle>Earlier</SectionTitle>
              <Grid container spacing={1.5}>
                {earlier.data.map((m) => (
                  <Grid key={m.id} size={{ xs: 12, lg: 6 }}>
                    <MailCard item={m} now={now} employee />
                  </Grid>
                ))}
              </Grid>
              <LoadMore list={earlier} />
            </Grid>
          ) : null}
        </Grid>
      )}
    </>
  );
}
