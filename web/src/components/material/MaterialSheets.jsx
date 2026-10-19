import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Grid from '@mui/material/Grid';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import { errorMessage } from '../../api/client';
import { materialApi } from '../../api/endpoints';
import { useSettings } from '../../state/context';
import { boxesText, carrierName } from '../../utils/material';
import { VisitorThumb } from '../bits';
import { PhotoTile } from '../PhotoTile';
import { Sheet } from '../Sheet';

/** Shared shell: title, body, error, buttons. */
function Shell({ eyebrow, title, children, error, onClose, action, busy, disabled }) {
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
        {action ? (
          <Button
            variant="contained"
            color={action.color ?? 'primary'}
            onClick={action.run}
            disabled={busy || disabled}
          >
            {busy ? 'Saving…' : action.label}
          </Button>
        ) : null}
      </DialogActions>
    </>
  );
}

/** Box count with the pass's number beside it. */
function Count({ value, onChange, expected, label = 'Count the boxes' }) {
  const ok = Number(value) === expected;
  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
      <TextField
        label={label}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
        sx={{ width: 160 }}
        color={value ? (ok ? 'success' : 'error') : undefined}
        focused={!!value}
        slotProps={{ htmlInput: { inputMode: 'numeric', style: { fontSize: 22, fontWeight: 700 } } }}
      />
      <Typography sx={{ color: 'text.secondary' }}>Pass says {expected}</Typography>
    </Stack>
  );
}

/** Runs an action and reports the result. */
function useRun(onDone) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = async (fn, toastText) => {
    setBusy(true);
    setError(null);
    try {
      const pass = await fn();
      onDone(pass, typeof toastText === 'function' ? toastText(pass) : toastText);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, run };
}

/** Approve / reject (the employee named on a security-made OUT pass). */
function Decide({ pass: p, approve, onClose, onDone }) {
  const [note, setNote] = useState('');
  const { busy, error, run } = useRun(onDone);
  return (
    <Shell
      eyebrow={`${p.id} · material OUT`}
      title={approve ? 'Approve this gate pass?' : 'Reject this gate pass?'}
      error={error}
      busy={busy}
      onClose={onClose}
      action={{
        label: approve ? 'Approve' : 'Reject',
        color: approve ? 'success' : 'error',
        run: () =>
          run(
            () => materialApi.decision(p.id, { approve, note: note.trim() }),
            approve ? 'Approved' : 'Rejected. Security has been told.',
          ),
      }}
    >
      <Typography>
        {boxesText(p.boxes)} going out with {carrierName(p)}
        {p.challanType ? ` · ${p.challanType} ${p.refNo}` : ''}.
      </Typography>
      <TextField
        label={approve ? 'Note for security (optional)' : 'Reason (optional)'}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        multiline
        minRows={2}
      />
    </Shell>
  );
}

/** Received / not received (employee), or received on paper (security). kind: yes | no | sec */
function Receipt({ pass: p, kind, onClose, onDone }) {
  const [note, setNote] = useState('');
  const { busy, error, setError, run } = useRun(onDone);
  const name = p.authorisedBy?.name ?? 'the employee';
  return (
    <Shell
      eyebrow={`${p.id} · material IN`}
      title={
        kind === 'sec'
          ? `Record that ${name} received it`
          : kind === 'yes'
            ? `I received ${boxesText(p.boxes)}`
            : 'I have not received it'
      }
      error={error}
      busy={busy}
      onClose={onClose}
      action={{
        label: kind === 'no' ? 'Tell security' : 'Confirm received',
        color: kind === 'no' ? 'error' : 'success',
        run: () => {
          if (kind === 'sec' && !note.trim()) return setError('Say how the receipt was confirmed');
          return run(
            () => materialApi.receipt(p.id, { ok: kind !== 'no', note: note.trim() }),
            kind === 'no' ? 'Security has been told' : 'Recorded as received',
          );
        },
      }}
    >
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
        <VisitorThumb src={p.carrier?.photoUrl} name={carrierName(p)} size={52} />
        <Box>
          <Typography sx={{ fontWeight: 600 }}>{carrierName(p)}</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {[p.carrier?.company, p.challanType && `${p.challanType} ${p.refNo}`].filter(Boolean).join(' · ')}
          </Typography>
        </Box>
      </Stack>
      {p.challanPhotoUrls[0] ? (
        <Box
          component="img"
          src={p.challanPhotoUrls[0]}
          alt="Challan"
          sx={{
            maxHeight: 220,
            maxWidth: '100%',
            objectFit: 'contain',
            borderRadius: 1,
            border: 1,
            borderColor: 'divider',
          }}
        />
      ) : null}
      <TextField
        label={kind === 'sec' ? 'How was it confirmed?' : kind === 'yes' ? 'Note (optional)' : 'What is wrong?'}
        required={kind === 'sec'}
        placeholder={
          kind === 'sec'
            ? 'e.g. Signed on the challan copy'
            : kind === 'yes'
              ? 'e.g. 2 boxes slightly damaged'
              : 'e.g. Only 3 boxes reached me'
        }
        value={note}
        onChange={(e) => setNote(e.target.value)}
        multiline
        minRows={2}
      />
    </Shell>
  );
}

/** Security: the employee handed the boxes in for pickup. */
function Drop({ pass: p, onClose, onDone }) {
  const [count, setCount] = useState('');
  const { busy, error, run } = useRun(onDone);
  return (
    <Shell
      eyebrow={`${p.id} · for pickup by ${p.pickerName || 'someone'}`}
      title={`Boxes handed in by ${p.authorisedBy?.name ?? 'the employee'}`}
      error={error}
      busy={busy}
      onClose={onClose}
      action={{
        label: 'Keep at the gate',
        run: () => run(() => materialApi.drop(p.id, Number(count)), 'Kept at the gate for pickup'),
      }}
    >
      <Typography>Count the boxes. The pass says {boxesText(p.boxes)}.</Typography>
      <Count value={count} onChange={setCount} expected={p.boxes} label="Boxes counted" />
    </Shell>
  );
}

/** Security: count and release (with a visitor / carrier), or hand over to the person collecting. */
function Release({ pass: p, onClose, onDone }) {
  const { settings } = useSettings();
  const pickup = p.status === 'ready_for_pickup';
  const [count, setCount] = useState('');
  const [vehicle, setVehicle] = useState(p.carrier?.vehicle ?? '');
  const [visitors, setVisitors] = useState([]);
  const [pickerVisitId, setPickerVisitId] = useState('');
  const [name, setName] = useState(p.pickerName ?? '');
  const [phone, setPhone] = useState(p.pickerPhone ?? '');
  const [photo, setPhoto] = useState(null);
  const { busy, error, setError, run } = useRun(onDone);
  useEffect(() => {
    if (!pickup) return undefined;
    const ctrl = new AbortController();
    materialApi
      .visitors(ctrl.signal)
      .then((list) => {
        setVisitors(list);
        const match = list.find((v) => p.pickerName && v.name.toLowerCase() === p.pickerName.toLowerCase());
        if (match) setPickerVisitId(match.id);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [pickup, p.pickerName]);
  const n = Number(count);
  const submit = () => {
    if (n !== p.boxes)
      return setError(`Counted ${n || 0} boxes but the pass is for ${boxesText(p.boxes)}. Do not release.`);
    if (pickup && !pickerVisitId && !photo && settings?.mpCarrierPhotoRequired !== false)
      return setError('Take a photo of the person collecting');
    return run(
      () =>
        materialApi.release(
          p.id,
          {
            boxes: n,
            vehicle: vehicle.trim(),
            ...(pickup
              ? pickerVisitId
                ? { pickerVisitId }
                : { pickerName: name.trim(), pickerPhone: phone.trim() }
              : {}),
          },
          pickup && !pickerVisitId ? photo?.blob : null,
        ),
      `${boxesText(p.boxes)} released`,
    );
  };
  return (
    <Shell
      eyebrow={`${p.id} · material OUT`}
      title={pickup ? 'Hand over to the person collecting' : 'Count the boxes and release'}
      error={error}
      busy={busy}
      onClose={onClose}
      disabled={n !== p.boxes}
      action={{ label: `Release ${boxesText(p.boxes)}`, run: submit }}
    >
      {pickup ? (
        <>
          <TextField
            select
            label="Who is collecting"
            value={pickerVisitId}
            onChange={(e) => setPickerVisitId(e.target.value)}
            slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
            helperText={`Expected: ${[p.pickerName, p.pickerCompany, p.pickerPhone].filter(Boolean).join(' · ')}`}
          >
            <MenuItem value="">
              <em>Someone not checked in as a visitor</em>
            </MenuItem>
            {visitors.map((v) => (
              <MenuItem key={v.id} value={v.id}>
                {v.name}
                {v.company ? ` · ${v.company}` : ''}
                {v.badge ? ` · pass ${v.badge}` : ''}
              </MenuItem>
            ))}
          </TextField>
          {!pickerVisitId ? (
            <Grid container spacing={1.5}>
              <Grid size={{ xs: 12, sm: 7 }}>
                <Stack spacing={1.5}>
                  <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} />
                  <TextField
                    label="Mobile"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/[^\d+\s]/g, '').slice(0, 14))}
                  />
                </Stack>
              </Grid>
              <Grid size={{ xs: 6, sm: 5 }}>
                <PhotoTile
                  title="Photo of the person collecting"
                  label="Photo of person"
                  hint="Face, shoulders up"
                  aspect="3 / 4"
                  facing="user"
                  required={settings?.mpCarrierPhotoRequired !== false}
                  value={photo}
                  onChange={setPhoto}
                  maxEdge={640}
                />
              </Grid>
            </Grid>
          ) : null}
        </>
      ) : (
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <VisitorThumb src={p.carrier?.photoUrl} name={carrierName(p)} size={56} />
          <Box>
            <Typography sx={{ fontWeight: 600 }}>{carrierName(p)}</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Check this is the person taking the boxes.
            </Typography>
          </Box>
        </Stack>
      )}
      <Count value={count} onChange={setCount} expected={p.boxes} />
      <TextField
        label="Vehicle number"
        value={vehicle}
        onChange={(e) => setVehicle(e.target.value.toUpperCase())}
        sx={{ maxWidth: 260 }}
      />
    </Shell>
  );
}

/** Security: returnable boxes back in (OUT) / taken back out (IN). */
function Return({ pass: p, onClose, onDone }) {
  const lines = p.items.map((it, i) => ({ ...it, i })).filter((it) => it.outstanding > 0);
  const [qty, setQty] = useState(() => Object.fromEntries(lines.map((l) => [l.i, String(l.outstanding)])));
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState(null);
  const { busy, error, setError, run } = useRun(onDone);
  const submit = () => {
    const chosen = lines.map((l) => ({ i: l.i, qty: Number(qty[l.i]) || 0 })).filter((l) => l.qty > 0);
    if (!chosen.length) return setError('Enter at least one quantity');
    return run(
      () => materialApi.returnBack(p.id, { lines: chosen, note: note.trim() }, photo?.blob),
      (pass) => (pass.status === 'returned' ? 'All back. Pass closed.' : 'Recorded. The rest is still outstanding.'),
    );
  };
  const out = p.direction === 'out';
  return (
    <Shell
      eyebrow={`${p.id} · returnable`}
      title={out ? 'Record boxes back' : 'Record boxes going back out'}
      error={error}
      busy={busy}
      onClose={onClose}
      action={{ label: 'Save', run: submit }}
    >
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        Enter how many came {out ? 'back' : 'out'} now. The pass stays open for the rest.
      </Typography>
      {lines.map((l) => (
        <Stack key={l.i} direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 600 }}>{l.desc}</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {l.outstanding} outstanding{l.serial ? ` · ${l.serial}` : ''}
            </Typography>
          </Box>
          <TextField
            size="small"
            value={qty[l.i]}
            onChange={(e) => setQty((q) => ({ ...q, [l.i]: e.target.value.replace(/[^\d.]/g, '') }))}
            sx={{ width: 90 }}
            slotProps={{ htmlInput: { inputMode: 'decimal', 'aria-label': `${l.desc} quantity` } }}
          />
          <Typography sx={{ width: 48, color: 'text.secondary' }}>{l.unit}</Typography>
        </Stack>
      ))}
      <TextField
        label="Remarks"
        placeholder="e.g. Came back with goods return challan GRC-118"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <Box sx={{ maxWidth: 200 }}>
        <PhotoTile
          title="Photo"
          label="Take pic"
          hint="Optional"
          aspect="4 / 3"
          value={photo}
          onChange={setPhoto}
          maxEdge={1100}
        />
      </Box>
    </Shell>
  );
}

/**
 * One action sheet for a pass. `action`: { kind: 'approve' | 'reject' | 'receipt-yes' | 'receipt-no' | 'receipt-sec'
 * | 'drop' | 'release' | 'return', pass }.
 */
export function MaterialActionSheet({ action, onClose, onDone }) {
  const p = action?.pass;
  const k = action?.kind;
  const props = { pass: p, onClose, onDone };
  return (
    <Sheet open={!!action} onClose={onClose} maxWidth="sm">
      {p ? (
        k === 'approve' || k === 'reject' ? (
          <Decide {...props} approve={k === 'approve'} />
        ) : k?.startsWith('receipt') ? (
          <Receipt {...props} kind={k.slice(8)} />
        ) : k === 'drop' ? (
          <Drop {...props} />
        ) : k === 'release' ? (
          <Release {...props} />
        ) : k === 'return' ? (
          <Return {...props} />
        ) : null
      ) : null}
    </Sheet>
  );
}
