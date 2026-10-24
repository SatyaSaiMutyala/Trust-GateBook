import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { errorMessage } from '../../api/client';
import { genApi } from '../../api/endpoints';
import { fmtDateTime, toLocalInput } from '../../utils/format';
import { RUN_REASONS, dur } from '../../utils/ops';
import { PhotoList } from '../material/PhotoList';
import { Sheet } from '../Sheet';

function Shell({ eyebrow, title, children, error, busy, onClose, action }) {
  return (
    <>
      <DialogTitle component="div">
        <Typography variant="overline" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.3 }}>
          {eyebrow}
        </Typography>
        <Typography variant="h3" component="h2">
          {title}
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          {children}
          {error ? <Alert severity="error">{error}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Back</Button>
        <Button variant="contained" onClick={action.run} disabled={busy}>
          {busy ? 'Saving…' : action.label}
        </Button>
      </DialogActions>
    </>
  );
}

function useRun(onDone) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = async (fn, toast) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fn();
      onDone(typeof toast === 'function' ? toast(r) : toast);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, run };
}

function StartBody({ gen: g, onClose, onDone }) {
  const [reason, setReason] = useState('Power cut');
  const { busy, error, run } = useRun(onDone);
  return (
    <Shell
      eyebrow="Start generator"
      title={g.name}
      error={error}
      busy={busy}
      onClose={onClose}
      action={{
        label: 'Start now',
        run: () => run(() => genApi.start(g.id, { reason }), `${g.name} started`),
      }}
    >
      <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
        {RUN_REASONS.map((r) => (
          <Chip key={r} label={r} clickable color={reason === r ? 'primary' : 'default'} onClick={() => setReason(r)} />
        ))}
      </Stack>
    </Shell>
  );
}

function StopBody({ gen: g, onClose, onDone }) {
  const r = g.running;
  const [note, setNote] = useState('');
  const { busy, error, run } = useRun(onDone);
  const [openedAt] = useState(() => Date.now());
  const ran = dur(openedAt - new Date(r.startAt).getTime());
  return (
    <Shell
      eyebrow="Stop generator"
      title={g.name}
      error={error}
      busy={busy}
      onClose={onClose}
      action={{
        label: 'Stop now',
        run: () => run(() => genApi.stop(r.id, { note: note.trim() }), `${g.name} stopped after ${ran}`),
      }}
    >
      <Typography sx={{ color: 'text.secondary' }}>
        Running since {fmtDateTime(r.startAt)} · {ran} · {r.reason}
      </Typography>
      <TextField
        label="Note"
        placeholder="e.g. Grid power restored"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
    </Shell>
  );
}

function FuelBody({ gen: g, kind, onClose, onDone }) {
  const check = kind === 'check';
  const [f, setF] = useState(() => ({
    at: toLocalInput(new Date()),
    litres: '',
    levelL: '',
    vendor: '',
    billNo: '',
    amount: '',
    note: '',
  }));
  const [photos, setPhotos] = useState([]);
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const { busy, error, setError, run } = useRun(onDone);
  const numeric = (k) => (e) => set({ [k]: e.target.value.replace(/[^\d.]/g, '') });
  const pct = f.levelL && g.tankL ? Math.round((Number(f.levelL) / g.tankL) * 100) : null;
  const save = () => {
    if (check && !photos.length) return setError('Take a photo of the gauge or dipstick');
    const fields = check
      ? { kind, levelL: f.levelL, note: f.note.trim() }
      : {
          kind,
          at: f.at ? new Date(f.at).toISOString() : undefined,
          litres: f.litres,
          levelL: f.levelL,
          vendor: f.vendor.trim(),
          billNo: f.billNo.trim(),
          amount: f.amount,
          note: f.note.trim(),
        };
    return run(
      () => genApi.fuel(g.id, fields, photos[0]?.blob ?? null),
      check ? 'Level check saved' : `${f.litres} L fill saved`,
    );
  };
  return (
    <Shell
      eyebrow={check ? 'Weekly level check' : 'Diesel fill'}
      title={`${g.name} · Tank ${g.tankL} L`}
      error={error}
      busy={busy}
      onClose={onClose}
      action={{ label: 'Save', run: save }}
    >
      <PhotoList
        title={check ? 'Photo of the gauge or dipstick' : 'Photo of the bill'}
        label="Photo"
        hint={check ? 'Required. Make the reading visible.' : undefined}
        value={photos}
        onChange={setPhotos}
        max={1}
        required={check}
        maxEdge={1100}
      />
      <Grid container spacing={1.5}>
        {check ? null : (
          <>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                type="datetime-local"
                label="Filled at"
                value={f.at}
                onChange={(e) => set({ at: e.target.value })}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Litres filled"
                required
                value={f.litres}
                onChange={numeric('litres')}
                slotProps={{ htmlInput: { inputMode: 'decimal' } }}
              />
            </Grid>
          </>
        )}
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            label={check ? 'Level reading (litres)' : 'Level after filling (litres)'}
            required={check}
            value={f.levelL}
            onChange={numeric('levelL')}
            helperText={pct !== null ? `${pct}% of the tank` : check ? '' : 'If you dip-checked after filling.'}
            slotProps={{ htmlInput: { inputMode: 'decimal' } }}
          />
        </Grid>
        {check ? null : (
          <>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Supplier / bunk"
                placeholder="e.g. HP petrol bunk, Begumpet"
                value={f.vendor}
                onChange={(e) => set({ vendor: e.target.value })}
              />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <TextField label="Bill number" value={f.billNo} onChange={(e) => set({ billNo: e.target.value })} />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <TextField
                label="Amount (₹)"
                value={f.amount}
                onChange={numeric('amount')}
                slotProps={{ htmlInput: { inputMode: 'decimal' } }}
              />
            </Grid>
          </>
        )}
      </Grid>
      <TextField label="Note" value={f.note} onChange={(e) => set({ note: e.target.value })} />
    </Shell>
  );
}

/** `sheet` = { kind: 'start' | 'stop' | 'fill' | 'check', gen } | null. `onDone(toastText)`. */
export function GenSheets({ sheet, onClose, onDone }) {
  const done = (text) => {
    onDone(text);
    onClose();
  };
  return (
    <Sheet open={!!sheet} onClose={onClose} maxWidth="sm">
      {sheet?.kind === 'start' ? (
        <StartBody gen={sheet.gen} onClose={onClose} onDone={done} />
      ) : sheet?.kind === 'stop' ? (
        <StopBody gen={sheet.gen} onClose={onClose} onDone={done} />
      ) : sheet?.kind === 'fill' || sheet?.kind === 'check' ? (
        <FuelBody gen={sheet.gen} kind={sheet.kind} onClose={onClose} onDone={done} />
      ) : null}
    </Sheet>
  );
}
