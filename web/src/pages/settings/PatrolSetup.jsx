import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
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
import QRCode from 'qrcode';
import { useCallback, useEffect, useState } from 'react';
import { errorMessage, gate } from '../../api/client';
import { patrolApi } from '../../api/endpoints';
import { Panel } from '../../components/bits';
import { Sheet } from '../../components/Sheet';
import { usePatrolChanges } from '../../realtime/context';
import { useSettings, useToast } from '../../state/context';
import { fonts } from '../../theme/tokens';
import { checkpointQr, fillTimes } from '../../utils/ops';
import { EscalationMatrix } from './EscalationMatrix';

function Shell({ eyebrow, title, children, error, busy, onClose, onSave }) {
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
        <Button variant="contained" onClick={onSave} disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </>
  );
}

/** The QR as an image. */
function QrImage({ code, size = 140 }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(checkpointQr(code), { margin: 1, width: size * 2 }).then((u) => live && setSrc(u));
    return () => {
      live = false;
    };
  }, [code, size]);
  return src ? <Box component="img" src={src} alt={`QR for ${code}`} sx={{ width: size, height: size }} /> : null;
}

function CheckpointBody({ cp, sites, onClose, onDone }) {
  const toast = useToast();
  const [f, setF] = useState(() => ({
    site: cp?.site ?? (gate.site || sites[0]) ?? '',
    name: cp?.name ?? '',
    location: cp?.location ?? '',
    photoRequired: cp?.photoRequired ?? false,
    active: cp?.active ?? true,
  }));
  const [armed, setArmed] = useState(false);
  const [code, setCode] = useState(cp?.code ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = { ...f, name: f.name.trim(), location: f.location.trim() };
      await (cp ? patrolApi.updateCheckpoint(cp.id, body) : patrolApi.createCheckpoint(body));
      onDone(cp ? 'Saved' : 'Checkpoint added');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const newCode = async () => {
    if (!armed) return setArmed(true);
    try {
      const r = await patrolApi.updateCheckpoint(cp.id, { newCode: true });
      setCode(r.code);
      setArmed(false);
      toast('New code issued. Reprint this QR.');
    } catch (err) {
      setError(errorMessage(err));
    }
    return undefined;
  };
  return (
    <Shell
      eyebrow={cp ? `Edit checkpoint · ${cp.site}` : 'New checkpoint'}
      title={cp ? cp.name : 'Add checkpoint'}
      error={error}
      busy={busy}
      onClose={onClose}
      onSave={save}
    >
      {sites.length > 1 && !cp ? (
        <TextField select label="Gate / site" value={f.site} onChange={(e) => set({ site: e.target.value })}>
          {sites.map((s) => (
            <MenuItem key={s} value={s}>
              {s}
            </MenuItem>
          ))}
        </TextField>
      ) : null}
      <TextField
        label="Checkpoint name"
        placeholder="e.g. Server room door"
        value={f.name}
        onChange={(e) => set({ name: e.target.value })}
      />
      <TextField
        label="Floor / location"
        placeholder="e.g. 2nd floor, east wing"
        value={f.location}
        onChange={(e) => set({ location: e.target.value })}
      />
      <FormControlLabel
        control={<Checkbox checked={f.photoRequired} onChange={(e) => set({ photoRequired: e.target.checked })} />}
        label="Guard must take a photo when scanning here"
      />
      {cp ? (
        <>
          <FormControlLabel
            control={<Switch checked={f.active} onChange={(e) => set({ active: e.target.checked })} />}
            label="Active"
          />
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
            <QrImage code={code} />
            <Box>
              <Typography sx={{ fontFamily: fonts.mono, fontWeight: 700, fontSize: 22, letterSpacing: 3 }}>
                {code}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
                Printed under the QR. If a printed QR is lost, damaged or copied, issue a new code and reprint it.
              </Typography>
              <Button size="small" color={armed ? 'error' : 'primary'} variant="outlined" onClick={newCode}>
                {armed ? 'Tap again: old printed QR stops working' : 'Issue new code'}
              </Button>
            </Box>
          </Stack>
        </>
      ) : null}
    </Shell>
  );
}

function RoundBody({ round, sites, checkpoints, onClose, onDone }) {
  const [f, setF] = useState(() => ({
    site: round?.site ?? (gate.site || sites[0]) ?? '',
    name: round?.name ?? '',
    times: (round?.times ?? []).join(', '),
    onTimeMin: String(round?.onTimeMin ?? 10),
    windowMin: String(round?.windowMin ?? 45),
    checkpointIds:
      round?.checkpointIds ??
      checkpoints.filter((c) => c.active && c.site === ((gate.site || sites[0]) ?? '')).map((c) => c.id),
    active: round?.active ?? true,
  }));
  const [fill, setFill] = useState({ every: 120, from: '21:00', to: '05:00' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const here = checkpoints.filter((c) => c.site === f.site && (c.active || f.checkpointIds.includes(c.id)));
  const save = async () => {
    if (!f.name.trim()) return setError('Give the round a name');
    setBusy(true);
    setError(null);
    try {
      const body = {
        site: f.site,
        name: f.name.trim(),
        times: f.times,
        onTimeMin: Number(f.onTimeMin) || 0,
        windowMin: Number(f.windowMin) || 45,
        checkpointIds: f.checkpointIds.filter((id) => here.some((c) => c.id === id)),
        ...(round ? { active: f.active } : {}),
      };
      await (round ? patrolApi.updateRound(round.id, body) : patrolApi.createRound(body));
      onDone(round ? 'Saved' : 'Round added');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
    return undefined;
  };
  return (
    <Shell
      eyebrow={round ? `Edit round · ${round.site}` : 'New round'}
      title={round ? round.name : 'Add round'}
      error={error}
      busy={busy}
      onClose={onClose}
      onSave={save}
    >
      {sites.length > 1 && !round ? (
        <TextField
          select
          label="Gate / site"
          value={f.site}
          onChange={(e) => set({ site: e.target.value, checkpointIds: [] })}
        >
          {sites.map((s) => (
            <MenuItem key={s} value={s}>
              {s}
            </MenuItem>
          ))}
        </TextField>
      ) : null}
      <TextField
        label="Round name"
        placeholder="e.g. Night round"
        value={f.name}
        onChange={(e) => set({ name: e.target.value })}
      />
      <TextField
        label="Start times (24-hour)"
        placeholder="21:00, 23:00, 01:00, 03:00, 05:00"
        helperText="Separate with commas. Each time starts one round."
        value={f.times}
        onChange={(e) => set({ times: e.target.value })}
      />
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
        <Typography variant="body2">Or fill times: every</Typography>
        <TextField
          select
          size="small"
          value={fill.every}
          onChange={(e) => setFill((x) => ({ ...x, every: Number(e.target.value) }))}
          sx={{ width: 110 }}
        >
          {[30, 60, 90, 120, 180, 240].map((m) => (
            <MenuItem key={m} value={m}>
              {m} min
            </MenuItem>
          ))}
        </TextField>
        <Typography variant="body2">from</Typography>
        <TextField
          size="small"
          value={fill.from}
          onChange={(e) => setFill((x) => ({ ...x, from: e.target.value }))}
          sx={{ width: 90 }}
        />
        <Typography variant="body2">to</Typography>
        <TextField
          size="small"
          value={fill.to}
          onChange={(e) => setFill((x) => ({ ...x, to: e.target.value }))}
          sx={{ width: 90 }}
        />
        <Button
          size="small"
          variant="outlined"
          onClick={() => set({ times: fillTimes(fill.every, fill.from, fill.to).join(', ') })}
        >
          Fill
        </Button>
      </Stack>
      <Grid container spacing={1.5}>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            label="On time if started within (min)"
            value={f.onTimeMin}
            onChange={(e) => set({ onTimeMin: e.target.value.replace(/\D/g, '').slice(0, 3) })}
            helperText="After this the round counts as late and the alarm steps start."
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            label="Time allowed to finish (min)"
            value={f.windowMin}
            onChange={(e) => set({ windowMin: e.target.value.replace(/\D/g, '').slice(0, 3) })}
            helperText="If not finished by then, the round is logged as missed."
          />
        </Grid>
      </Grid>
      <Box>
        <Typography variant="eyebrow" sx={{ color: 'text.secondary', fontSize: '0.78rem', display: 'block' }}>
          Locations in this round
        </Typography>
        {here.map((c) => (
          <FormControlLabel
            key={c.id}
            sx={{ display: 'flex' }}
            control={
              <Checkbox
                checked={f.checkpointIds.includes(c.id)}
                onChange={(e) =>
                  set({
                    checkpointIds: e.target.checked
                      ? [...f.checkpointIds, c.id]
                      : f.checkpointIds.filter((x) => x !== c.id),
                  })
                }
              />
            }
            label={`${c.name}${c.location ? ` · ${c.location}` : ''}`}
          />
        ))}
      </Box>
      {round ? (
        <FormControlLabel
          control={<Switch checked={f.active} onChange={(e) => set({ active: e.target.checked })} />}
          label="Active"
        />
      ) : null}
    </Shell>
  );
}

/** A4 sheet of QR stickers, in a new window. */
async function printQrs(checkpoints, companyName) {
  const cards = await Promise.all(
    checkpoints.map(async (c) => {
      const src = await QRCode.toDataURL(checkpointQr(c.code), { margin: 1, width: 400 });
      const esc = (s) =>
        String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
      return `<div class="card"><div class="co">${esc(companyName || 'TruSentinel')} patrol checkpoint · ${esc(c.site)}</div><img src="${src}"/><div class="nm">${esc(c.name)}</div><div class="lo">${esc(c.location || '')}</div><div class="cd">${esc(c.code)}</div><div class="ft">Scan with TruSentinel on every round</div></div>`;
    }),
  );
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.write(
    `<!doctype html><title>Patrol QR codes</title><style>@page{size:A4;margin:12mm}body{font-family:system-ui,sans-serif;margin:0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8mm}.card{border:1px dashed #999;border-radius:4mm;padding:6mm;text-align:center;break-inside:avoid}.co{font-size:10pt;color:#555}img{width:60mm;height:60mm}.nm{font-size:16pt;font-weight:700}.lo{font-size:11pt;color:#444}.cd{font:700 16pt monospace;letter-spacing:3px;margin-top:2mm}.ft{font-size:9pt;color:#777;margin-top:2mm}</style><div class="grid">${cards.join('')}</div><script>onload=()=>print()</script>`,
  );
  w.document.close();
  return true;
}

/** Settings → Patrols (admin). */
export function PatrolSetup({ org }) {
  const { settings } = useSettings();
  const toast = useToast();
  const sites = settings?.sites ?? [];
  const [board, setBoard] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => {
    patrolApi
      .board()
      .then(setBoard)
      .catch((err) => setError(errorMessage(err)));
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  usePatrolChanges(load);
  const cps = board?.checkpoints ?? [];
  const rounds = board?.rounds ?? [];
  const active = cps.filter((c) => c.active);
  const name = (id) => cps.find((c) => c.id === id)?.name ?? '?';
  const done = (text) => {
    setSheet(null);
    toast(text);
    load();
  };
  const supervisors = org.filter((u) => u.active && u.isSupervisor).map((u) => u.name);
  return (
    <Grid container spacing={2}>
      {error ? (
        <Grid size={12}>
          <Alert severity="error">{error}</Alert>
        </Grid>
      ) : null}
      <Grid size={12}>
        <Panel
          title="1. Locations (checkpoints)"
          action={
            <Stack direction="row" spacing={1}>
              <Button
                size="small"
                variant="outlined"
                disabled={!active.length}
                onClick={async () => {
                  if (!(await printQrs(active, settings?.company?.name))) toast('Allow pop-ups to print the QR codes');
                }}
              >
                Print QR codes
              </Button>
              <Button size="small" variant="contained" onClick={() => setSheet({ kind: 'cp' })}>
                Add location
              </Button>
            </Stack>
          }
        >
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: -0.5, mb: 1.5 }}>
            One QR sticker per floor or spot guards must visit. Print and stick them in place.
          </Typography>
          {cps.length ? (
            <Table size="small">
              <TableHead>
                <TableRow>
                  {['Location', 'Floor / area', 'Code', 'Photo', 'Status', ''].map((h) => (
                    <TableCell key={h}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {cps.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.name}</TableCell>
                    <TableCell>{c.location}</TableCell>
                    <TableCell sx={{ fontFamily: fonts.mono }}>{c.code}</TableCell>
                    <TableCell>{c.photoRequired ? 'Required' : 'Optional'}</TableCell>
                    <TableCell>
                      <Chip size="small" variant={c.active ? 'inside' : 'exited'} label={c.active ? 'Active' : 'Off'} />
                    </TableCell>
                    <TableCell align="right">
                      <Button size="small" onClick={() => setSheet({ kind: 'cp', cp: c })}>
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
              No locations yet.
            </Typography>
          )}
        </Panel>
      </Grid>
      <Grid size={12}>
        <Panel
          title="2. Rounds and times"
          action={
            <Button
              size="small"
              variant="contained"
              disabled={!active.length}
              onClick={() => setSheet({ kind: 'round' })}
            >
              Add round
            </Button>
          }
        >
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: -0.5, mb: 1.5 }}>
            Which locations each round covers, the time of every round, how many minutes count as on time, and how long
            the guard has to finish.
          </Typography>
          {rounds.length ? (
            <Table size="small">
              <TableHead>
                <TableRow>
                  {['Round', 'Round times', 'On time if started within', 'Time allowed', 'Locations', 'Status', ''].map(
                    (h) => (
                      <TableCell key={h}>{h}</TableCell>
                    ),
                  )}
                </TableRow>
              </TableHead>
              <TableBody>
                {rounds.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.name}</TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: fonts.mono }}>
                        {r.times.join(', ')}
                      </Typography>
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        {r.times.length} rounds a day
                      </Typography>
                    </TableCell>
                    <TableCell>{r.onTimeMin} min</TableCell>
                    <TableCell>{r.windowMin} min</TableCell>
                    <TableCell>{r.checkpointIds.map(name).join(', ')}</TableCell>
                    <TableCell>
                      <Chip size="small" variant={r.active ? 'inside' : 'exited'} label={r.active ? 'Active' : 'Off'} />
                    </TableCell>
                    <TableCell align="right">
                      <Button size="small" onClick={() => setSheet({ kind: 'round', round: r })}>
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
              No rounds yet.
            </Typography>
          )}
        </Panel>
      </Grid>
      <Grid size={{ xs: 12, lg: 7 }}>
        <EscalationMatrix matrixKey="patrol" org={org} editable />
      </Grid>
      <Grid size={{ xs: 12, lg: 5 }}>
        <Panel title="4. Who receives the escalations">
          <Typography variant="body2">
            “Level 1” is the supervisor each guard reports to, “Level 2” the supervisor’s manager. Set this in Accounts
            &amp; hierarchy. Gate supervisors: {supervisors.length ? supervisors.join(', ') : 'none yet'}.
          </Typography>
        </Panel>
      </Grid>
      <Sheet open={!!sheet} onClose={() => setSheet(null)} maxWidth="sm">
        {sheet?.kind === 'cp' ? (
          <CheckpointBody cp={sheet.cp ?? null} sites={sites} onClose={() => setSheet(null)} onDone={done} />
        ) : sheet?.kind === 'round' ? (
          <RoundBody
            round={sheet.round ?? null}
            sites={sites}
            checkpoints={cps}
            onClose={() => setSheet(null)}
            onDone={done}
          />
        ) : null}
      </Sheet>
    </Grid>
  );
}
