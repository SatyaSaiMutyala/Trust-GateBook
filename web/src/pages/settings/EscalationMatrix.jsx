import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import Alert from '@mui/material/Alert';
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
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { errorMessage } from '../../api/client';
import { Panel } from '../../components/bits';
import { useSettings, useToast } from '../../state/context';
import { fonts } from '../../theme/tokens';
import { LEVELS, MATRICES, UNIT_MIN, fmtAfter, fmtEvery, splitMinutes, targetLabel } from '../../utils/escalation';

/** @typedef {import('../../types').EscStep} EscStep */
/** @typedef {import('../../types').OrgUser} OrgUser */

/**
 * Who a step reaches right now, for the fixed groups (person-based levels depend on the item).
 * @param {string} to @param {OrgUser[]} org
 * @returns {string | null} names, '' = nobody (goes to admins), null = depends on the item
 */
function reachNow(to, org) {
  const active = org.filter((u) => u.active);
  const managers = new Set(active.map((u) => u.reportsTo).filter(Boolean));
  /** @param {OrgUser[]} list */
  const names = (list) => list.map((u) => u.name).join(', ');
  if (to === 'guards') {
    const sec = active.filter((u) => u.role === 'security');
    const duty = sec.filter((u) => !u.isSupervisor && !managers.has(u.id));
    return names(duty.length ? duty : sec);
  }
  if (to === 'supervisors') return names(active.filter((u) => u.isSupervisor && u.role !== 'host'));
  if (to === 'admins') return names(active.filter((u) => u.role === 'admin'));
  if (to.startsWith('user:')) return names(active.filter((u) => u.id === to.slice(5)));
  return null;
}

/** Timeline of a matrix's steps with an "Edit matrix" button (admins). */
export function EscalationMatrix({ matrixKey, org, editable }) {
  const { settings } = useSettings();
  const [open, setOpen] = useState(false);
  const meta = MATRICES[matrixKey];
  const steps = settings?.esc?.[matrixKey] ?? [];
  return (
    <Panel
      title={`${meta.title}: escalation matrix`}
      action={
        editable ? (
          <Button size="small" variant="outlined" onClick={() => setOpen(true)}>
            Edit matrix
          </Button>
        ) : null
      }
    >
      <Typography variant="body2" sx={{ color: 'text.secondary', mt: -0.5, mb: 1.5 }}>
        Clock starts when {meta.start}. {meta.hint}
      </Typography>
      {steps.length === 0 ? (
        <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
          No steps. Nobody is alerted.
        </Typography>
      ) : (
        <Stack spacing={1}>
          {steps.map((s, i) => {
            const now = reachNow(s.to, org);
            return (
              <Stack key={i} direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
                <Typography
                  sx={{ fontFamily: fonts.mono, fontWeight: 600, fontSize: 13, width: 72, flexShrink: 0, pt: 0.25 }}
                >
                  {s.end ? 'END' : fmtAfter(s.after)}
                </Typography>
                <Box sx={{ minWidth: 0 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                    <Typography sx={{ fontWeight: 600 }}>{targetLabel(s.to, meta.person, org)}</Typography>
                    {s.alarm ? <Chip size="small" variant="issue" label="Alarm" /> : null}
                  </Stack>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    {[s.label, s.repeat ? `repeats ${fmtEvery(s.repeat)}` : ''].filter(Boolean).join(' · ') || '—'}
                  </Typography>
                  {now === null ? null : now ? (
                    <Typography variant="body2">Now: {now}</Typography>
                  ) : (
                    <Typography variant="body2" sx={{ color: 'error.main' }}>
                      Nobody set up: goes to admin
                    </Typography>
                  )}
                </Box>
              </Stack>
            );
          })}
        </Stack>
      )}
      {open ? <MatrixDialog matrixKey={matrixKey} steps={steps} org={org} onClose={() => setOpen(false)} /> : null}
    </Panel>
  );
}

/** Minutes field: number + unit. */
function MinutesField({ label, value, onChange, allowZeroLabel }) {
  // The unit is kept here so it can be chosen before a number is typed.
  const [unit, setUnit] = useState(() => splitMinutes(value)[1]);
  const n = Math.round((value / UNIT_MIN[unit]) * 100) / 100;
  return (
    <Stack direction="row" spacing={1}>
      <TextField
        label={label}
        type="number"
        value={value === 0 ? '' : n}
        placeholder={allowZeroLabel}
        onChange={(e) => onChange(Math.round(Math.max(0, Math.min(720, Number(e.target.value) || 0)) * UNIT_MIN[unit]))}
        slotProps={{ htmlInput: { min: 0, max: 720 } }}
        sx={{ width: 110 }}
      />
      <TextField
        select
        value={unit}
        onChange={(e) => {
          const u = /** @type {'min' | 'h' | 'd'} */ (e.target.value);
          setUnit(u);
          onChange(Math.round(n * UNIT_MIN[u]));
        }}
        sx={{ width: 100 }}
        aria-label={`${label} unit`}
      >
        <MenuItem value="min">min</MenuItem>
        <MenuItem value="h">hours</MenuItem>
        <MenuItem value="d">days</MenuItem>
      </TextField>
    </Stack>
  );
}

function MatrixDialog({ matrixKey, steps: initial, org, onClose }) {
  const { settings, save } = useSettings();
  const toast = useToast();
  const meta = MATRICES[matrixKey];
  const [steps, setSteps] = useState(() => initial.map((s) => ({ ...s })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  /** @param {number} i @param {Partial<EscStep>} patch */
  const set = (i, patch) => setSteps((list) => list.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const people = org.filter((u) => u.active).sort((a, b) => a.name.localeCompare(b.name));

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const sorted = [...steps].sort((a, b) => (a.end ? Infinity : a.after) - (b.end ? Infinity : b.after));
      await save({ ...settings, esc: { ...settings.esc, [matrixKey]: sorted } });
      toast('Escalation matrix saved');
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>
        <Typography variant="overline" sx={{ display: 'block', color: 'text.secondary', lineHeight: 1.2 }}>
          Settings · escalation matrix
        </Typography>
        {meta.title}
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
          The clock starts when {meta.start}. Each step goes out once (or repeats) while the item is still open. “Level
          1” is the {meta.person.toLowerCase()}’s manager as set in Accounts &amp; hierarchy, “Level 2” the manager’s
          manager. If nobody is set at a level, the step goes to admin so nothing is missed. Alarm steps ring longer.
        </Typography>
        <Stack spacing={2}>
          {steps.map((s, i) => (
            <Box key={i} sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: '10px' }}>
              <Grid container spacing={1.5} sx={{ alignItems: 'center' }}>
                {meta.end ? (
                  <Grid size={{ xs: 12, md: 'auto' }}>
                    <TextField
                      select
                      label="When"
                      value={s.end ? 'end' : 'after'}
                      onChange={(e) => set(i, e.target.value === 'end' ? { end: true, after: 0 } : { end: undefined })}
                      sx={{ width: 190 }}
                    >
                      <MenuItem value="after">After the start</MenuItem>
                      <MenuItem value="end">When time runs out</MenuItem>
                    </TextField>
                  </Grid>
                ) : null}
                {s.end ? null : (
                  <Grid size={{ xs: 12, md: 'auto' }}>
                    <MinutesField
                      label="After"
                      value={s.after}
                      onChange={(v) => set(i, { after: v })}
                      allowZeroLabel="at once"
                    />
                  </Grid>
                )}
                <Grid size={{ xs: 12, md: 'grow' }}>
                  <TextField select label="Notify" value={s.to} onChange={(e) => set(i, { to: e.target.value })}>
                    {LEVELS.filter(([k]) => !(meta.personGuards && k === 'person')).map(([k, label]) => (
                      <MenuItem key={k} value={k}>
                        {k === 'person' ? `${meta.person} (the person concerned)` : label}
                      </MenuItem>
                    ))}
                    {people.map((p) => (
                      <MenuItem key={p.id} value={`user:${p.id}`}>
                        {p.name}
                        {p.designation ? ` · ${p.designation}` : ''}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid size={{ xs: 12, md: 'auto' }}>
                  <MinutesField
                    label="Repeat every"
                    value={s.repeat}
                    onChange={(v) => set(i, { repeat: v })}
                    allowZeroLabel="once"
                  />
                </Grid>
                <Grid size={{ xs: 'grow', md: 7 }}>
                  <TextField
                    label="Message"
                    value={s.label}
                    onChange={(e) => set(i, { label: e.target.value })}
                    placeholder="e.g. Escalate to supervisor"
                    slotProps={{ htmlInput: { maxLength: 120 } }}
                  />
                </Grid>
                <Grid size="auto">
                  <FormControlLabel
                    control={<Checkbox checked={s.alarm} onChange={(e) => set(i, { alarm: e.target.checked })} />}
                    label="Alarm"
                  />
                </Grid>
                <Grid size="auto">
                  <IconButton
                    aria-label={`Remove step ${i + 1}`}
                    onClick={() => setSteps((list) => list.filter((_, j) => j !== i))}
                  >
                    <DeleteOutlineIcon />
                  </IconButton>
                </Grid>
              </Grid>
            </Box>
          ))}
          {steps.length === 0 ? (
            <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
              No steps. Nobody is alerted.
            </Typography>
          ) : null}
          {matrixKey === 'visitor' && !steps.some((s) => s.to === 'guards') ? (
            <Alert severity="warning">Without a step to guards, the gate never sees “No reply: call host”.</Alert>
          ) : null}
        </Stack>
        <Button
          startIcon={<AddIcon />}
          sx={{ mt: 2 }}
          disabled={steps.length >= 10}
          onClick={() =>
            setSteps((list) => [
              ...list,
              {
                after: (list.filter((x) => !x.end).at(-1)?.after ?? 0) + 30,
                to: 'l1',
                repeat: 0,
                alarm: false,
                label: '',
              },
            ])
          }
        >
          Add step
        </Button>
        {error ? (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" color="primary" onClick={submit} disabled={busy}>
          Save matrix
        </Button>
      </DialogActions>
    </Dialog>
  );
}
