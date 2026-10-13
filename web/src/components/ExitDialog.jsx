import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { errorMessage } from '../api/client';
import { visitsApi } from '../api/endpoints';
import { useToast } from '../state/context';
import { fmtDuration, fmtTime, toLocalInput } from '../utils/format';
import { PassBadge, VisitorThumb } from './bits';
import { Sheet } from './Sheet';
/** Bottom sheet on phone, centred dialog on desktop. */
export function ExitDialog({ visit, open, onClose, onDone }) {
  return (
    <Sheet open={open && !!visit} onClose={onClose}>
      {visit ? <ExitForm key={visit.id + (visit.outAt ?? '')} visit={visit} onClose={onClose} onDone={onDone} /> : null}
    </Sheet>
  );
}
/** datetime-local value for N minutes ago. */
const minutesAgoInput = (minutes) => toLocalInput(Date.now() - minutes * 60_000);

const QUICK = [
  { label: 'Now', minutes: 0 },
  { label: '5 min ago', minutes: 5 },
  { label: '15 min ago', minutes: 15 },
  { label: '30 min ago', minutes: 30 },
];
function ExitForm({ visit, onClose, onDone }) {
  const toast = useToast();
  const correcting = !!visit.outAt;
  // `null` = "now" (let the server stamp it); otherwise the datetime-local value.
  const [custom, setCustom] = useState(() => (visit.outAt ? toLocalInput(visit.outAt) : null));
  const [quick, setQuick] = useState(() => (visit.outAt ? null : 0));
  const [passBack, setPassBack] = useState(visit.passReturned ?? true);
  const [note, setNote] = useState(visit.exitNote ?? '');
  const [openedAt] = useState(() => minutesAgoInput(0));
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const pickQuick = (minutes) => {
    setQuick(minutes);
    setCustom(minutes === 0 ? null : minutesAgoInput(minutes));
    setError(null);
  };
  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    const inAt = new Date(visit.inAt).getTime();
    let outAtIso;
    if (custom !== null || correcting) {
      const raw = custom ? new Date(custom).getTime() : NaN;
      if (Number.isNaN(raw)) {
        setError('Pick the exit time.');
        return;
      }
      // datetime-local has minute precision: the check-in minute itself means "at check-in".
      let t = raw;
      if (t < inAt && inAt - t < 60_000) t = inAt;
      if (t < inAt) {
        setError(`Exit time can't be before check-in (${fmtTime(visit.inAt)}).`);
        return;
      }
      if (t > Date.now() + 5 * 60_000) {
        setError("Exit time can't be in the future.");
        return;
      }
      outAtIso = new Date(t).toISOString();
    }
    setBusy(true);
    try {
      const updated = await visitsApi.exit(visit.id, {
        outAt: outAtIso,
        exitNote: note.trim(),
        passReturned: visit.badge ? passBack : undefined,
      });
      const parts = correcting
        ? [`Exit time corrected · ${updated.name}`]
        : [`${updated.name} checked out`, fmtDuration(updated.inAt, updated.outAt)];
      if (updated.badge && updated.passReturned === false) parts.push('pass not returned');
      toast(parts.join(' · '));
      onDone(updated);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Box component="form" onSubmit={submit} sx={{ p: { xs: 2, md: 3 } }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 2.5 }}>
        <VisitorThumb src={visit.photoUrl} name={visit.name} size={56} />
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="eyebrow" sx={{ color: 'text.secondary' }}>
            {correcting ? 'Correct exit time' : 'Record exit'}
          </Typography>
          <Typography variant="h2" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {visit.name}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.5 }}>
            <PassBadge badge={visit.badge} />
            <Typography variant="mono" sx={{ color: 'text.secondary' }}>
              In {fmtTime(visit.inAt)}
            </Typography>
          </Stack>
        </Box>
      </Stack>

      <Stack spacing={2}>
        <TextField
          label="Exit time"
          type="datetime-local"
          value={custom ?? openedAt}
          onChange={(e) => {
            setCustom(e.target.value);
            setQuick(null);
            setError(null);
          }}
          slotProps={{ htmlInput: { step: 60 } }}
        />
        {!correcting ? (
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1, mt: '8px !important' }}>
            {QUICK.map((q) => (
              <Chip
                key={q.label}
                label={q.label}
                clickable
                onClick={() => pickQuick(q.minutes)}
                variant={quick === q.minutes ? 'filled' : 'outlined'}
                color={quick === q.minutes ? 'secondary' : 'default'}
              />
            ))}
          </Stack>
        ) : null}
        {visit.badge ? (
          <FormControlLabel
            control={<Checkbox checked={passBack} onChange={(e) => setPassBack(e.target.checked)} />}
            label={
              <span>
                Pass <b>{visit.badge}</b> collected back
              </span>
            }
          />
        ) : null}
        <TextField
          label="Exit remarks"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          multiline
          minRows={2}
          placeholder="Optional"
        />
        {error ? <Alert severity="error">{error}</Alert> : null}
        <Stack direction="row" spacing={1.5} sx={{ justifyContent: 'flex-end', pt: 0.5 }}>
          <Button variant="outlined" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            color="primary"
            disabled={busy}
            sx={{ flex: { xs: 1, md: 'none' } }}
          >
            {busy ? 'Saving…' : correcting ? 'Save exit time' : 'Confirm exit'}
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
