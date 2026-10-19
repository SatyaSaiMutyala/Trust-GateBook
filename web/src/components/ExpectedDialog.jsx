import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import { ApiError, errorMessage } from '../api/client';
import { expectedApi, hostsApi } from '../api/endpoints';
import { useUser } from '../auth/context';
import { useDebounced, useIsDesktop } from '../hooks';
import { RecipientField } from '../pages/post/RecipientField';
import { useLocalEmit } from '../realtime/context';
import { useSettings, useToast } from '../state/context';
import { fonts } from '../theme/tokens';
import { toLocalDateInput } from '../utils/format';

const CHALLANS = ['Delivery challan', 'Tax invoice', 'Goods return challan', 'Transfer challan', 'Other'];

/** Employee picker wording for "visiting" / "receives the delivery" / "received at the location by". */
const HOST_WORDING = {
  label: 'Visiting',
  picked: 'Gets a notification when they arrive',
  typed: 'Pick someone from the list.',
  idle: 'The employee they are visiting.',
  noMatch: (name) => `No employee named “${name}” is on Gatebook.`,
  none: 'No employees are on Gatebook yet. An admin can add them in Settings → Users.',
};
const RECEIVER_WORDING = { ...HOST_WORDING, label: 'Received by', idle: 'The employee who accepts the boxes.' };
const CONTACT_WORDING = {
  ...HOST_WORDING,
  label: 'Received at the location by (optional)',
  picked: 'They meet the visitor when the person visited is elsewhere',
  idle: 'e.g. the lab in-charge who meets the engineer. Leave empty if it is the person above.',
};

/** Several employees ("Also meeting"), type-ahead over GET /api/hosts. */
function EmployeesField({ label, value, onChange, exclude }) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const q = useDebounced(text.trim(), 250);
  const [options, setOptions] = useState([]);
  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    hostsApi
      .list({ q: q || undefined, limit: 8, page: 1, sort: 'name' }, ctrl.signal)
      .then((r) => setOptions(r.data))
      .catch(() => {});
    return () => ctrl.abort();
  }, [q, open]);
  return (
    <Autocomplete
      multiple
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      options={options.filter((o) => !exclude.includes(o.id))}
      filterOptions={(x) => x}
      value={value}
      onChange={(_, v) => onChange(v)}
      inputValue={text}
      onInputChange={(_, v, reason) => {
        if (reason === 'input' || reason === 'clear') setText(v);
      }}
      getOptionLabel={(o) => o.name}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder="Add an employee"
          helperText="Told when the visitor arrives."
        />
      )}
    />
  );
}

/** Build the form state from an entry (edit) or defaults (new). */
function initial(entry, kind, user, settings) {
  const now = new Date();
  const start = new Date(Math.ceil((now.getTime() + 30 * 60_000) / (30 * 60_000)) * (30 * 60_000));
  const at = entry ? new Date(entry.expectedAt) : start;
  const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const self =
    user.role === 'host' || user.isHost
      ? { id: user.id, name: user.name, dept: user.dept, location: user.location }
      : null;
  return {
    kind: entry?.kind ?? kind,
    name: entry?.name ?? '',
    phone: entry?.phone ?? '',
    company: entry?.company ?? '',
    purpose: entry?.purpose ?? '',
    persons: String(entry?.persons ?? 1),
    host: entry ? entry.host : self,
    hostText: entry ? entry.host.name : (self?.name ?? ''),
    contact: entry?.contact ?? null,
    contactText: entry?.contact?.name ?? '',
    also: entry?.also ?? [],
    date: toLocalDateInput(at),
    from: hhmm(at),
    to: entry?.untilAt ? hhmm(new Date(entry.untilAt)) : '',
    vehicle: entry?.vehicle ?? '',
    items: entry?.items ?? '',
    notes: entry?.notes ?? '',
    preapproved: entry ? entry.preapproved : (settings?.expectedPreapproved ?? true),
    boxes: entry?.boxes ? String(entry.boxes) : '',
    challanType: entry?.challanType ?? '',
    challanNo: entry?.challanNo ?? '',
  };
}

/**
 * Pre-register a visitor or a delivery, or edit one (`entry`). Security at the gate is notified; the visitor is
 * checked in from it (details filled in), the delivery is marked received.
 */
export function ExpectedDialog({ open, entry, kind = 'visitor', onClose, onSaved }) {
  const user = useUser();
  const { settings } = useSettings();
  const desktop = useIsDesktop();
  const toast = useToast();
  const emit = useLocalEmit();
  const [f, setF] = useState(() => initial(entry, kind, user, settings));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [invalid, setInvalid] = useState(() => new Set());

  // Re-initialise each time the dialog opens for another entry / kind.
  const key = `${open}:${entry?.code ?? 'new'}:${kind}`;
  const [shown, setShown] = useState(key);
  if (key !== shown) {
    setShown(key);
    setF(initial(entry, kind, user, settings));
    setError(null);
    setInvalid(new Set());
  }

  const delivery = f.kind === 'delivery';
  const set = (k) => (e) => {
    setF((x) => ({ ...x, [k]: e.target.value }));
    if (invalid.has(k)) setInvalid(new Set([...invalid].filter((i) => i !== k)));
  };
  const err = (k) => invalid.has(k);

  const save = async () => {
    setError(null);
    const missing = new Set();
    if (delivery && !f.company.trim()) missing.add('company');
    if (delivery && !(Number(f.boxes) > 0)) missing.add('boxes');
    if (!delivery && !f.name.trim()) missing.add('name');
    if (!f.host) missing.add('host');
    if (!f.date || !f.from) missing.add('date');
    if (missing.size) {
      setInvalid(missing);
      setError(
        missing.has('host') && missing.size === 1 ? 'Pick the employee from the list.' : 'Fill the highlighted fields.',
      );
      return;
    }
    const at = new Date(`${f.date}T${f.from}`);
    const until = f.to ? new Date(`${f.date}T${f.to}`) : null;
    const body = {
      name: f.name.trim(),
      phone: f.phone.trim(),
      company: f.company.trim(),
      purpose: delivery ? '' : f.purpose,
      persons: delivery ? 1 : Math.min(50, Math.max(1, Number.parseInt(f.persons, 10) || 1)),
      hostId: f.host.id,
      contactId: delivery ? null : (f.contact?.id ?? null),
      alsoIds: delivery ? [] : f.also.map((a) => a.id),
      expectedAt: at.toISOString(),
      untilAt: until ? until.toISOString() : null,
      vehicle: f.vehicle.trim(),
      items: delivery ? '' : f.items.trim(),
      notes: f.notes.trim(),
      preapproved: delivery ? false : f.preapproved,
      boxes: Number(f.boxes) || 0,
      challanType: f.challanType,
      challanNo: f.challanNo.trim(),
    };
    setBusy(true);
    try {
      const saved = entry
        ? await expectedApi.update(entry.code, body)
        : await expectedApi.create({ kind: f.kind, ...body });
      emit('expected:changed', { expected: saved });
      toast(entry ? 'Saved. Security has the update.' : 'Saved. Security at the gate has been notified.');
      onSaved?.(saved);
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.field) {
        const map = { hostId: 'host', contactId: 'contact', alsoIds: 'also', expectedAt: 'date', untilAt: 'to' };
        setInvalid(new Set([map[e.field] ?? e.field]));
      }
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const purposes = settings?.purposes ?? [];
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullScreen={!desktop} fullWidth maxWidth="md">
      <DialogTitle sx={{ pb: 1 }}>
        <Typography variant="eyebrow" component="div" sx={{ color: 'text.secondary' }}>
          {entry ? `Edit · ${entry.code}` : 'Pre-register'}
        </Typography>
        {entry
          ? delivery
            ? `Delivery from ${entry.company}`
            : entry.name
          : delivery
            ? 'Expect a delivery'
            : 'Expect a visitor'}
      </DialogTitle>
      <DialogContent dividers>
        <Grid container spacing={2}>
          {!entry ? (
            <Grid size={12}>
              <ToggleButtonGroup
                exclusive
                value={f.kind}
                onChange={(_, v) => v && setF((x) => ({ ...x, kind: v }))}
                size="small"
                aria-label="What is expected"
              >
                <ToggleButton value="visitor">A visitor</ToggleButton>
                <ToggleButton value="delivery">A delivery (boxes only)</ToggleButton>
              </ToggleButtonGroup>
            </Grid>
          ) : null}

          {delivery ? (
            <>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="From (supplier or courier)"
                  required
                  value={f.company}
                  onChange={set('company')}
                  error={err('company')}
                  placeholder="e.g. Transasia, Blue Dart"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField label="Driver / courier name (if known)" value={f.name} onChange={set('name')} />
              </Grid>
            </>
          ) : (
            <>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField label="Visitor name" required value={f.name} onChange={set('name')} error={err('name')} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField label="Company / coming from" value={f.company} onChange={set('company')} />
              </Grid>
            </>
          )}
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              label="Mobile number"
              value={f.phone}
              onChange={(e) => setF((x) => ({ ...x, phone: e.target.value.replace(/[^\d+]/g, '').slice(0, 14) }))}
              helperText="Helps security find them at check-in."
              slotProps={{ htmlInput: { inputMode: 'tel', style: { fontFamily: fonts.mono } } }}
            />
          </Grid>
          {!delivery ? (
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="No. of persons"
                type="number"
                value={f.persons}
                onChange={set('persons')}
                slotProps={{ htmlInput: { min: 1, max: 50 } }}
              />
            </Grid>
          ) : (
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField label="Vehicle number" value={f.vehicle} onChange={set('vehicle')} />
            </Grid>
          )}

          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField
              label="Date"
              type="date"
              required
              value={f.date}
              onChange={set('date')}
              error={err('date')}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Grid>
          <Grid size={{ xs: 6, sm: 4 }}>
            <TextField
              label="From"
              type="time"
              required
              value={f.from}
              onChange={set('from')}
              error={err('date')}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Grid>
          <Grid size={{ xs: 6, sm: 4 }}>
            <TextField
              label="To (optional)"
              type="time"
              value={f.to}
              onChange={set('to')}
              error={err('to')}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Grid>

          {!delivery ? (
            <Grid size={12}>
              <Typography
                variant="body2"
                sx={{ fontWeight: 600, fontSize: '0.8rem', color: 'text.secondary', mb: 0.75 }}
              >
                Purpose
              </Typography>
              <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }} role="radiogroup" aria-label="Purpose">
                {purposes.map((p) => {
                  const on = f.purpose === p;
                  return (
                    <Chip
                      key={p}
                      role="radio"
                      aria-checked={on}
                      label={p}
                      clickable
                      onClick={() => setF((x) => ({ ...x, purpose: on ? '' : p }))}
                      variant={on ? 'filled' : 'outlined'}
                      color={on ? 'secondary' : 'default'}
                    />
                  );
                })}
              </Stack>
            </Grid>
          ) : null}

          <Grid size={{ xs: 12, sm: 6 }}>
            <RecipientField
              wording={delivery ? RECEIVER_WORDING : HOST_WORDING}
              recipient={f.host}
              text={f.hostText}
              error={err('host')}
              onPick={(h) => {
                setF((x) => ({ ...x, host: h, hostText: h ? h.name : x.hostText }));
                if (invalid.has('host')) setInvalid(new Set([...invalid].filter((i) => i !== 'host')));
              }}
              onText={(t) => setF((x) => ({ ...x, hostText: t, host: null }))}
            />
          </Grid>
          {!delivery ? (
            <Grid size={{ xs: 12, sm: 6 }}>
              <RecipientField
                wording={CONTACT_WORDING}
                recipient={f.contact}
                text={f.contactText}
                error={err('contact')}
                onPick={(h) => setF((x) => ({ ...x, contact: h, contactText: h ? h.name : x.contactText }))}
                onText={(t) => setF((x) => ({ ...x, contactText: t, contact: null }))}
              />
            </Grid>
          ) : null}
          {!delivery ? (
            <Grid size={12}>
              <EmployeesField
                label="Also meeting (optional)"
                value={f.also}
                onChange={(also) => setF((x) => ({ ...x, also }))}
                exclude={[f.host?.id, f.contact?.id].filter(Boolean)}
              />
            </Grid>
          ) : null}

          <Grid size={12}>
            <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8rem', color: 'text.secondary', mb: 0.75 }}>
              {delivery ? 'Boxes coming *' : 'Bringing boxes (optional)'}
            </Typography>
            <Grid container spacing={1.5}>
              <Grid size={{ xs: 4, sm: 2 }}>
                <TextField
                  label="Boxes"
                  type="number"
                  value={f.boxes}
                  onChange={set('boxes')}
                  error={err('boxes')}
                  slotProps={{ htmlInput: { min: 0, max: 9999 } }}
                />
              </Grid>
              <Grid size={{ xs: 8, sm: 5 }}>
                <Autocomplete
                  freeSolo
                  options={CHALLANS}
                  inputValue={f.challanType}
                  onInputChange={(_, v) => setF((x) => ({ ...x, challanType: v }))}
                  renderInput={(params) => <TextField {...params} label="Challan" />}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 5 }}>
                <TextField label="Challan number" value={f.challanNo} onChange={set('challanNo')} />
              </Grid>
            </Grid>
          </Grid>

          {!delivery ? (
            <>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Anything else they are bringing"
                  value={f.items}
                  onChange={set('items')}
                  placeholder="Laptop, tool kit…"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField label="Vehicle number" value={f.vehicle} onChange={set('vehicle')} />
              </Grid>
            </>
          ) : null}
          <Grid size={12}>
            <TextField
              label="Note for security"
              value={f.notes}
              onChange={set('notes')}
              placeholder="e.g. Machine engineer for the haematology analyser, send to the lab"
            />
          </Grid>
          {!delivery ? (
            <Grid size={12}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={f.preapproved}
                    onChange={(e) => setF((x) => ({ ...x, preapproved: e.target.checked }))}
                  />
                }
                label={
                  <Box>
                    <b>Pre-approved: send them in when they arrive</b>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                      The employee is told they have arrived instead of being asked to accept.
                    </Typography>
                  </Box>
                }
              />
            </Grid>
          ) : null}
          {error ? (
            <Grid size={12}>
              <Alert severity="error">{error}</Alert>
            </Grid>
          ) : null}
        </Grid>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={busy}>
          Close
        </Button>
        <Button variant="contained" color="primary" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : entry ? 'Save changes' : 'Save and notify security'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
