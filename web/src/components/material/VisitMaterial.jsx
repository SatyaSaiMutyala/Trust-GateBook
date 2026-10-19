import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useEffect, useMemo } from 'react';
import { materialApi } from '../../api/endpoints';
import { useUser } from '../../auth/context';
import { canOperate, hasModule } from '../../auth/roles';
import { usePaginatedQuery } from '../../hooks/usePaginatedQuery';
import { useMaterialChanges } from '../../realtime/context';
import { useMaterialUi } from '../../state/context';
import { FieldLabel } from '../bits';
import { MaterialCard } from './MaterialCard';

/** "Material IN / OUT with this visitor" buttons (security; the visited employee can send OUT). */
export function VisitMaterialButtons({ visit, size = 'medium' }) {
  const user = useUser();
  const { openNew } = useMaterialUi();
  if (!hasModule(user, 'material') || visit.outAt) return null;
  const gate = canOperate(user);
  const host = visit.hostId === user.id;
  if (!gate && !host) return null;
  return (
    <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
      {gate ? (
        <Button
          size={size}
          variant="outlined"
          color="success"
          startIcon={<ArrowDownwardIcon />}
          onClick={() => openNew({ direction: 'in', visitId: visit.id })}
        >
          Material IN
        </Button>
      ) : null}
      <Button
        size={size}
        variant="outlined"
        color="warning"
        startIcon={<ArrowUpwardIcon />}
        onClick={() => openNew({ direction: 'out', visitId: visit.id })}
      >
        {gate ? 'Material OUT' : 'Material OUT with this visitor'}
      </Button>
    </Stack>
  );
}

/** Visitor details → "Material": the visit's gate passes and the buttons to add one. */
export function VisitMaterial({ visit }) {
  const user = useUser();
  const enabled = hasModule(user, 'material');
  const query = useMemo(() => ({ visitId: visit.id, tab: 'all', days: 120, limit: 20 }), [visit.id]);
  const list = usePaginatedQuery(materialApi.list, query, { enabled });
  useMaterialChanges(list.refresh, 300);
  if (!enabled) return null;
  return (
    <Box>
      <Stack
        direction="row"
        sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1, gap: 1, flexWrap: 'wrap' }}
      >
        <FieldLabel>Material</FieldLabel>
        <VisitMaterialButtons visit={visit} size="small" />
      </Stack>
      {list.data.length ? (
        <Stack spacing={1}>
          {list.data.map((p) => (
            <MaterialCard key={p.id} pass={p} />
          ))}
        </Stack>
      ) : (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {list.loading ? 'Loading…' : 'No material recorded for this visitor.'}
        </Typography>
      )}
    </Box>
  );
}

/**
 * Exit screen: OUT passes ready with this visitor need a box count (released after the exit); OUT passes still
 * waiting for approval and returnable IN material are flagged. `counts` / `setCounts`: `{ [passId]: string }`.
 * `onPasses(list)` reports the passes so the exit can check and release them.
 */
export function ExitMaterial({ visit, counts, setCounts, onPasses }) {
  const user = useUser();
  const { openNew } = useMaterialUi();
  const enabled = hasModule(user, 'material') && canOperate(user);
  const query = useMemo(() => ({ visitId: visit.id, tab: 'all', days: 120, limit: 50 }), [visit.id]);
  const list = usePaginatedQuery(materialApi.list, query, { enabled });
  useMaterialChanges(list.refresh, 300);
  const ready = list.data.filter((p) => p.direction === 'out' && p.status === 'ready');
  const waiting = list.data.filter((p) => p.direction === 'out' && p.status === 'awaiting_approval');
  const returnableIn = list.data.filter(
    (p) => p.direction === 'in' && ['pending_return', 'partly_returned'].includes(p.status),
  );
  const key = ready.map((p) => p.id).join(',');
  // Tell the exit form which passes it has to check and release.
  useEffect(() => onPasses?.(ready), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!enabled) return null;
  return (
    <Stack spacing={1.25}>
      {ready.length ? (
        <Box sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: '10px' }}>
          <Typography sx={{ fontWeight: 700, mb: 1 }}>Boxes going out with {visit.name}</Typography>
          <Stack spacing={1}>
            {ready.map((p) => {
              const v = counts[p.id] ?? '';
              const ok = Number(v) === p.boxes;
              return (
                <Stack key={p.id} direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 600 }}>
                      {p.boxes} box{p.boxes === 1 ? '' : 'es'} · {p.id}
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }} noWrap>
                      {[p.challanType, p.refNo].filter(Boolean).join(' ')} · from {p.authorisedBy?.name ?? 'security'}
                    </Typography>
                  </Box>
                  <TextField
                    size="small"
                    label="Counted"
                    value={v}
                    onChange={(e) =>
                      setCounts((c) => ({ ...c, [p.id]: e.target.value.replace(/\D/g, '').slice(0, 4) }))
                    }
                    color={v ? (ok ? 'success' : 'error') : undefined}
                    focused={!!v}
                    sx={{ width: 100 }}
                    slotProps={{ htmlInput: { inputMode: 'numeric' } }}
                  />
                </Stack>
              );
            })}
          </Stack>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
            The visitor can leave only when each count matches the pass.
          </Typography>
        </Box>
      ) : null}
      {waiting.map((p) => (
        <Alert key={p.id} severity="error">
          Not approved yet: {p.boxes} box{p.boxes === 1 ? '' : 'es'} ({p.id}). Do not let the boxes go.
        </Alert>
      ))}
      {returnableIn.length ? (
        <Alert severity="warning">
          Returnable material brought in:{' '}
          {returnableIn.map((p) => `${p.boxes} box${p.boxes === 1 ? '' : 'es'} (${p.id})`).join(', ')}. Check whether it
          is being taken back out.
        </Alert>
      ) : null}
      <Button
        size="small"
        startIcon={<ArrowUpwardIcon />}
        sx={{ alignSelf: 'flex-start' }}
        onClick={() => openNew({ direction: 'out', visitId: visit.id })}
      >
        Boxes going out? Record Material OUT
      </Button>
    </Stack>
  );
}
