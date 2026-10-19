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
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useCallback, useEffect, useState } from 'react';
import { errorMessage, gate } from '../../api/client';
import { genApi } from '../../api/endpoints';
import { Panel } from '../../components/bits';
import { Sheet } from '../../components/Sheet';
import { useGenChanges } from '../../realtime/context';
import { useSettings, useToast } from '../../state/context';
import { EscalationMatrix } from './EscalationMatrix';

function GenBody({ gen, sites, onClose, onDone }) {
  const [f, setF] = useState(() => ({
    name: gen?.name ?? '',
    site: gen?.site ?? (gate.site || sites[0]) ?? '',
    kva: gen?.kva ?? '',
    tankL: gen ? String(gen.tankL) : '',
    rateLph: gen ? String(gen.rateLph) : '',
    lowPct: String(gen?.lowPct ?? 30),
    active: gen?.active ?? true,
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const n = (k) => (e) => set({ [k]: e.target.value.replace(/[^\d.]/g, '') });
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = {
        name: f.name.trim(),
        site: f.site,
        kva: f.kva.trim(),
        tankL: f.tankL ? Number(f.tankL) : undefined,
        rateLph: Number(f.rateLph) || 0,
        lowPct: Math.round(Number(f.lowPct) || 30),
        ...(gen ? { active: f.active } : {}),
      };
      await (gen ? genApi.updateGenerator(gen.id, body) : genApi.createGenerator(body));
      onDone(gen ? 'Saved' : 'Generator added');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <DialogTitle component="div">
        <Typography variant="overline" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.3 }}>
          Generator
        </Typography>
        <Typography variant="h3" component="h2">
          {gen ? `Edit ${gen.name}` : 'Add generator'}
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          <Grid container spacing={1.5}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Name"
                placeholder="DG-1"
                value={f.name}
                onChange={(e) => set({ name: e.target.value })}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              {sites.length > 1 ? (
                <TextField select label="Gate / site" value={f.site} onChange={(e) => set({ site: e.target.value })}>
                  {sites.map((s) => (
                    <MenuItem key={s} value={s}>
                      {s}
                    </MenuItem>
                  ))}
                </TextField>
              ) : (
                <TextField
                  label="Capacity (kVA)"
                  placeholder="125"
                  value={f.kva}
                  onChange={(e) => set({ kva: e.target.value })}
                />
              )}
            </Grid>
            {sites.length > 1 ? (
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Capacity (kVA)"
                  placeholder="125"
                  value={f.kva}
                  onChange={(e) => set({ kva: e.target.value })}
                />
              </Grid>
            ) : null}
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField label="Diesel tank capacity (litres)" required value={f.tankL} onChange={n('tankL')} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Rated diesel use (litres per hour)"
                value={f.rateLph}
                onChange={n('rateLph')}
                helperText="From the DG manual at your usual load."
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Alert when diesel falls below (%)"
                value={f.lowPct}
                onChange={n('lowPct')}
                helperText="5 to 90"
              />
            </Grid>
          </Grid>
          {gen ? (
            <FormControlLabel
              control={<Switch checked={f.active} onChange={(e) => set({ active: e.target.checked })} />}
              label="Active"
            />
          ) : null}
          {error ? <Alert severity="error">{error}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Back</Button>
        <Button variant="contained" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </>
  );
}

/** "Check the tank level every N days, due at H o'clock". */
function CheckOptions() {
  const { settings, save } = useSettings();
  const toast = useToast();
  const [days, setDays] = useState(String(settings?.genCheckDays ?? 7));
  const [hour, setHour] = useState(String(settings?.genCheckHour ?? 9));
  const [error, setError] = useState(null);
  const submit = async () => {
    setError(null);
    try {
      await save({ ...settings, genCheckDays: Number(days), genCheckHour: Number(hour) });
      toast('Diesel check saved');
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  return (
    <Panel title="Diesel level check">
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1.5 }}>
        <Typography>Check the tank level every</Typography>
        <TextField
          size="small"
          value={days}
          onChange={(e) => setDays(e.target.value.replace(/\D/g, '').slice(0, 2))}
          sx={{ width: 70 }}
        />
        <Typography>days, due at</Typography>
        <TextField
          size="small"
          value={hour}
          onChange={(e) => setHour(e.target.value.replace(/\D/g, '').slice(0, 2))}
          sx={{ width: 70 }}
        />
        <Typography>o’clock (0–23)</Typography>
        <Button variant="outlined" size="small" onClick={submit}>
          Save
        </Button>
      </Stack>
      <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
        Security photographs the gauge and records the level.
      </Typography>
      {error ? (
        <Alert severity="error" sx={{ mt: 1 }}>
          {error}
        </Alert>
      ) : null}
    </Panel>
  );
}

/** Settings → Generator (admin). */
export function GenSetup({ org }) {
  const { settings } = useSettings();
  const toast = useToast();
  const sites = settings?.sites ?? [];
  const [gens, setGens] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => {
    genApi
      .status()
      .then((d) => setGens(d.generators))
      .catch((err) => setError(errorMessage(err)));
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useGenChanges(load);
  return (
    <Grid container spacing={2}>
      <Grid size={12}>
        <Panel
          title="Generators"
          action={
            <Button size="small" variant="contained" onClick={() => setSheet({})}>
              Add generator
            </Button>
          }
        >
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: -0.5, mb: 1.5 }}>
            The rated consumption is used to estimate diesel between weekly readings.
          </Typography>
          {error ? <Alert severity="error">{error}</Alert> : null}
          {gens === null ? (
            <Typography variant="body2">Loading generators…</Typography>
          ) : gens.length ? (
            <Table size="small">
              <TableHead>
                <TableRow>
                  {['Name', 'kVA', 'Tank', 'Rated use', 'Low alert', 'Status', ''].map((h) => (
                    <TableCell key={h}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {gens.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell>
                      {g.name}
                      {sites.length > 1 ? ` · ${g.site}` : ''}
                    </TableCell>
                    <TableCell>{g.kva}</TableCell>
                    <TableCell>{g.tankL} L</TableCell>
                    <TableCell>{g.rateLph} L/h</TableCell>
                    <TableCell>{g.lowPct}%</TableCell>
                    <TableCell>
                      <Chip size="small" variant={g.active ? 'inside' : 'exited'} label={g.active ? 'Active' : 'Off'} />
                    </TableCell>
                    <TableCell align="right">
                      <Button size="small" onClick={() => setSheet({ gen: g })}>
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
              No generators yet.
            </Typography>
          )}
        </Panel>
      </Grid>
      <Grid size={{ xs: 12, lg: 6 }}>
        <CheckOptions key={`${settings?.genCheckDays}-${settings?.genCheckHour}`} />
      </Grid>
      <Grid size={{ xs: 12, lg: 6 }} />
      {['gencheck', 'genlow'].map((k) => (
        <Grid key={k} size={{ xs: 12, lg: 6 }}>
          <EscalationMatrix matrixKey={k} org={org} editable />
        </Grid>
      ))}
      <Sheet open={!!sheet} onClose={() => setSheet(null)} maxWidth="sm">
        {sheet ? (
          <GenBody
            gen={sheet.gen ?? null}
            sites={sites}
            onClose={() => setSheet(null)}
            onDone={(text) => {
              setSheet(null);
              toast(text);
              load();
            }}
          />
        ) : null}
      </Sheet>
    </Grid>
  );
}
