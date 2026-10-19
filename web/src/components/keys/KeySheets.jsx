import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { errorMessage, gate } from '../../api/client';
import { keysApi } from '../../api/endpoints';
import { RecipientField } from '../../pages/post/RecipientField';
import { useSettings } from '../../state/context';
import { fmtDateTime, toLocalInput } from '../../utils/format';
import { dueChips } from '../../utils/keys';
import { Sheet } from '../Sheet';

/** Title, body, error, buttons. */
function Shell({ eyebrow, title, children, error, onClose, action, busy }) {
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

/** Runs a save and reports it. */
function useRun(onDone) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      onDone(await fn());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, run };
}

const TAKER_WORDING = {
  label: 'Taken by',
  picked: 'Gets a reminder in Gatebook when the key is due back',
  typed: 'Not on Gatebook — the guards are reminded instead.',
  idle: 'Pick the employee, or type the name of anyone else (electrician, vendor).',
  noMatch: (name) => `No one named “${name}” on Gatebook. Keep the typed name.`,
  none: 'No employees on Gatebook yet. Type the name.',
};

/** Hand a copy of a key to someone. */
function IssueBody({ keyItem: k, defaultHours, onClose, onDone }) {
  const [taker, setTaker] = useState(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [purpose, setPurpose] = useState('');
  const [chips] = useState(() => dueChips());
  const [due, setDue] = useState(() =>
    defaultHours > 0 ? toLocalInput(new Date(Date.now() + defaultHours * 3_600_000)) : '',
  );
  const { busy, error, setError, run } = useRun(onDone);
  const submit = () => {
    if (!taker && !name.trim()) {
      setError('Who is taking the key?');
      return;
    }
    run(() =>
      keysApi.issue(k.id, {
        takerId: taker?.id,
        takerName: taker ? undefined : name.trim(),
        takerPhone: phone.trim(),
        purpose: purpose.trim(),
        dueAt: due ? new Date(due).toISOString() : null,
      }),
    );
  };
  return (
    <Shell
      eyebrow={`Key ${k.number}`}
      title={`Issue: ${k.name}`}
      error={error}
      busy={busy}
      onClose={onClose}
      action={{ label: 'Issue key', run: submit }}
    >
      {k.restricted ? (
        <Alert severity="warning" icon={<LockOutlinedIcon />}>
          Restricted key.{k.authorised ? ` Only: ${k.authorised}.` : ' Check the person is allowed to take it.'}
        </Alert>
      ) : null}
      <RecipientField
        recipient={taker}
        text={name}
        onPick={(h) => {
          setTaker(h);
          if (h) setName(h.name);
          if (h?.phone && !phone) setPhone(h.phone);
        }}
        onText={(t) => {
          setTaker(null);
          setName(t);
        }}
        wording={TAKER_WORDING}
      />
      <Grid container spacing={1.5}>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField label="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField label="Purpose (optional)" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
        </Grid>
      </Grid>
      <Stack spacing={1}>
        <Typography variant="eyebrow" sx={{ color: 'text.secondary', fontSize: '0.78rem' }}>
          Return by
        </Typography>
        <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
          {chips.map(([label, d]) => (
            <Chip
              key={label}
              label={label}
              clickable
              color={due === toLocalInput(d) ? 'primary' : 'default'}
              onClick={() => setDue(toLocalInput(d))}
            />
          ))}
          <Chip label="No return time" clickable color={due ? 'default' : 'primary'} onClick={() => setDue('')} />
        </Stack>
        <TextField
          type="datetime-local"
          label="Return by"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          sx={{ maxWidth: 260 }}
          slotProps={{ inputLabel: { shrink: true } }}
          helperText={due ? 'Security and the holder are reminded if it is not back by then.' : 'No reminders.'}
        />
      </Stack>
    </Shell>
  );
}

/** Take a key back. */
function ReturnBody({ move: m, onClose, onDone }) {
  const [by, setBy] = useState(m.taker.name);
  const [note, setNote] = useState('');
  const { busy, error, run } = useRun(onDone);
  return (
    <Shell
      eyebrow={`Key ${m.key.number}`}
      title={`Take back: ${m.key.name}`}
      error={error}
      busy={busy}
      onClose={onClose}
      action={{
        label: 'Key is back',
        run: () => run(() => keysApi.giveBack(m.id, { returnedByName: by.trim(), note: note.trim() })),
      }}
    >
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        Taken by {m.taker.name} at {fmtDateTime(m.issuedAt)}
        {m.dueAt ? ` · due ${fmtDateTime(m.dueAt)}` : ''}.
      </Typography>
      <TextField label="Returned by" value={by} onChange={(e) => setBy(e.target.value)} />
      <TextField label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} multiline minRows={2} />
    </Shell>
  );
}

/** Add or edit a key (Settings → Keys). */
function EditBody({ keyItem: k, onClose, onDone }) {
  const { settings } = useSettings();
  const sites = settings?.sites ?? [];
  const [f, setF] = useState(() => ({
    number: k?.number ?? '',
    name: k?.name ?? '',
    location: k?.location ?? '',
    site: k?.site ?? (gate.site || sites[0]) ?? '',
    copies: String(k?.copies ?? 1),
    restricted: k?.restricted ?? false,
    authorised: k?.authorised ?? '',
    active: k?.active ?? true,
  }));
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const { busy, error, run } = useRun(onDone);
  const submit = () => {
    const body = { ...f, number: f.number.trim(), name: f.name.trim(), copies: Number(f.copies) || 1 };
    run(() => (k ? keysApi.update(k.id, body) : keysApi.create(body)));
  };
  return (
    <Shell
      eyebrow="Key register"
      title={k ? `Edit key ${k.number}` : 'Add a key'}
      error={error}
      busy={busy}
      onClose={onClose}
      action={{ label: k ? 'Save' : 'Add key', run: submit }}
    >
      <Grid container spacing={1.5}>
        <Grid size={{ xs: 5 }}>
          <TextField
            label="Key number"
            required
            value={f.number}
            onChange={(e) => set({ number: e.target.value.toUpperCase() })}
            slotProps={{ htmlInput: { maxLength: 20 } }}
          />
        </Grid>
        <Grid size={{ xs: 7 }}>
          <TextField label="What it opens" required value={f.name} onChange={(e) => set({ name: e.target.value })} />
        </Grid>
        <Grid size={{ xs: 12, sm: 7 }}>
          <TextField
            label="Location (optional)"
            value={f.location}
            onChange={(e) => set({ location: e.target.value })}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 5 }}>
          <TextField select label="Gate / site" required value={f.site} onChange={(e) => set({ site: e.target.value })}>
            {sites.map((s) => (
              <MenuItem key={s} value={s}>
                {s}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 5 }}>
          <TextField
            label="Copies"
            value={f.copies}
            onChange={(e) => set({ copies: e.target.value.replace(/\D/g, '').slice(0, 2) })}
            slotProps={{ htmlInput: { inputMode: 'numeric' } }}
          />
        </Grid>
      </Grid>
      <FormControlLabel
        control={<Switch checked={f.restricted} onChange={(e) => set({ restricted: e.target.checked })} />}
        label="Restricted: only some people may take it"
      />
      {f.restricted ? (
        <TextField
          label="Who may take it"
          placeholder="e.g. IT team, Facility manager"
          value={f.authorised}
          onChange={(e) => set({ authorised: e.target.value })}
        />
      ) : null}
      {k ? (
        <FormControlLabel
          control={<Switch checked={f.active} onChange={(e) => set({ active: e.target.checked })} />}
          label={f.active ? 'In use' : 'Not in use (hidden from the key board)'}
        />
      ) : null}
    </Shell>
  );
}

/**
 * The key sheets. `sheet` = { kind: 'issue', key } | { kind: 'return', move } | { kind: 'edit', key? } | null.
 * `onDone(result)` after a save.
 */
export function KeySheets({ sheet, onClose, onDone }) {
  const { settings } = useSettings();
  const done = (r) => {
    onDone?.(r, sheet);
    onClose();
  };
  return (
    <Sheet open={!!sheet} onClose={onClose} maxWidth="sm">
      {sheet?.kind === 'issue' ? (
        <IssueBody keyItem={sheet.key} defaultHours={settings?.keyReturnHours ?? 4} onClose={onClose} onDone={done} />
      ) : sheet?.kind === 'return' ? (
        <ReturnBody move={sheet.move} onClose={onClose} onDone={done} />
      ) : sheet?.kind === 'edit' ? (
        <EditBody keyItem={sheet.key ?? null} onClose={onClose} onDone={done} />
      ) : null}
    </Sheet>
  );
}
