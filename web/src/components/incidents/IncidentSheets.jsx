import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Grid from '@mui/material/Grid';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import { errorMessage, gate } from '../../api/client';
import { incidentsApi } from '../../api/endpoints';
import { useUser } from '../../auth/context';
import { canOperate } from '../../auth/roles';
import { useSettings } from '../../state/context';
import { fmtDateTime, toLocalInput } from '../../utils/format';
import {
  SEVERITIES,
  SEVERITY_HINT,
  SEVERITY_LABEL,
  SEVERITY_TONE,
  STATUS_LABEL,
  incidentRights,
} from '../../utils/incidents';
import { FillThumb, TimelineItem } from '../bits';
import { PhotoList } from '../material/PhotoList';
import { Sheet } from '../Sheet';

/** Severity pill. */
export function SeverityChip({ severity, size = 'small' }) {
  const t = SEVERITY_TONE[severity] ?? SEVERITY_TONE.low;
  return (
    <Chip
      size={size}
      label={SEVERITY_LABEL[severity] ?? severity}
      sx={{ bgcolor: t.bg, color: t.fg, fontWeight: 700, border: 'none' }}
    />
  );
}

/** Status pill. */
export function StatusPill({ status }) {
  const variant = status === 'closed' ? 'exited' : status === 'in_progress' ? 'pending' : 'issue';
  return <Chip size="small" variant={variant} label={STATUS_LABEL[status] ?? status} />;
}

function Title({ eyebrow, title }) {
  return (
    <DialogTitle component="div">
      <Typography variant="overline" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.3 }}>
        {eyebrow}
      </Typography>
      <Typography variant="h3" component="h2">
        {title}
      </Typography>
    </DialogTitle>
  );
}

/** Report an incident (everyone with the module, not viewers). */
function ReportBody({ initial, onClose, onDone }) {
  const { settings } = useSettings();
  const types = settings?.incidentTypes ?? [];
  const sites = settings?.sites ?? [];
  const [f, setF] = useState(() => ({
    type: '',
    severity: '',
    site: (gate.site || sites[0]) ?? '',
    location: initial?.location ?? '',
    occurredAt: toLocalInput(new Date()),
    description: initial?.description ?? '',
    people: '',
    actionTaken: '',
  }));
  const [photos, setPhotos] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const submit = async () => {
    if (!f.type) return setError('Pick the type of incident.');
    if (!f.severity) return setError('Pick how serious it is.');
    if (!f.description.trim()) return setError('Describe what happened.');
    setBusy(true);
    setError(null);
    try {
      const i = await incidentsApi.report(
        { ...f, source: initial?.source, occurredAt: f.occurredAt ? new Date(f.occurredAt).toISOString() : undefined },
        photos.map((p) => p.blob),
      );
      onDone(i);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Title eyebrow="Site safety" title="Report an incident" />
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          <Box>
            <Typography
              variant="eyebrow"
              sx={{ color: 'text.secondary', fontSize: '0.78rem', mb: 0.75, display: 'block' }}
            >
              What happened? *
            </Typography>
            <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap' }}>
              {types.map((t) => (
                <Chip
                  key={t}
                  label={t}
                  clickable
                  color={f.type === t ? 'primary' : 'default'}
                  variant={f.type === t ? 'filled' : 'outlined'}
                  onClick={() => set({ type: t })}
                />
              ))}
            </Stack>
          </Box>
          <Box>
            <Typography
              variant="eyebrow"
              sx={{ color: 'text.secondary', fontSize: '0.78rem', mb: 0.75, display: 'block' }}
            >
              How serious? *
            </Typography>
            <ToggleButtonGroup exclusive fullWidth value={f.severity} onChange={(_, v) => v && set({ severity: v })}>
              {SEVERITIES.map(([k, label]) => (
                <ToggleButton key={k} value={k} color={k === 'critical' || k === 'high' ? 'error' : 'primary'}>
                  {label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
              {SEVERITY_HINT}
            </Typography>
          </Box>
          <Grid container spacing={1.5}>
            {sites.length > 1 ? (
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField select label="Gate / site" value={f.site} onChange={(e) => set({ site: e.target.value })}>
                  {sites.map((s) => (
                    <MenuItem key={s} value={s}>
                      {s}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
            ) : null}
            <Grid size={{ xs: 12, sm: sites.length > 1 ? 4 : 7 }}>
              <TextField
                label="Where"
                placeholder="e.g. Lab 2, parking"
                value={f.location}
                onChange={(e) => set({ location: e.target.value })}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: sites.length > 1 ? 4 : 5 }}>
              <TextField
                type="datetime-local"
                label="When"
                value={f.occurredAt}
                onChange={(e) => set({ occurredAt: e.target.value })}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Grid>
          </Grid>
          <TextField
            label="What happened"
            required
            multiline
            minRows={3}
            value={f.description}
            onChange={(e) => set({ description: e.target.value })}
          />
          <TextField
            label="People involved (optional)"
            value={f.people}
            onChange={(e) => set({ people: e.target.value })}
          />
          <TextField
            label="Action taken (optional)"
            multiline
            minRows={2}
            value={f.actionTaken}
            onChange={(e) => set({ actionTaken: e.target.value })}
          />
          <PhotoList title="Photos" label="Photo" value={photos} onChange={setPhotos} max={3} maxEdge={1100} />
          {error ? <Alert severity="error">{error}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Back</Button>
        <Button variant="contained" onClick={submit} disabled={busy}>
          {busy ? 'Saving…' : 'Report incident'}
        </Button>
      </DialogActions>
    </>
  );
}

/** People an incident can be given to (security / admin). */
function useAssignees(enabled) {
  const [list, setList] = useState([]);
  useEffect(() => {
    if (!enabled) return;
    const ctrl = new AbortController();
    incidentsApi
      .assignees(ctrl.signal)
      .then(setList)
      .catch(() => {});
    return () => ctrl.abort();
  }, [enabled]);
  return list;
}

/** One incident: details, photos, timeline, update / close / reopen. */
function DetailBody({ incident: i, onClose, onChanged }) {
  const user = useUser();
  const rights = incidentRights(i, user);
  const assignees = useAssignees(rights.assign && canOperate(user));
  const [mode, setMode] = useState(null); // null | 'close' | 'reopen'
  const [text, setText] = useState('');
  const [status, setStatus] = useState('');
  const [assignTo, setAssignTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const save = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      onChanged(await fn());
      setText('');
      setStatus('');
      setAssignTo('');
      setMode(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const sendUpdate = () =>
    save(() =>
      incidentsApi.update(i.id, {
        text: text.trim(),
        status: status || undefined,
        assignTo: assignTo || undefined,
      }),
    );

  const facts = [
    ['Happened', fmtDateTime(i.occurredAt)],
    [
      'Reported',
      `${fmtDateTime(i.reportedAt)} by ${i.reportedBy?.name ?? ''}${i.source === 'patrol' ? ' · from a patrol scan' : ''}`,
    ],
    ['Where', [i.location, i.site].filter(Boolean).join(' · ')],
    ['People involved', i.people],
    ['Action taken', i.actionTaken],
    ['Given to', i.assignedTo?.name],
    ['Resolution', i.status === 'closed' ? `${i.resolution} (${i.closedBy?.name}, ${fmtDateTime(i.closedAt)})` : ''],
  ].filter(([, v]) => v);

  return (
    <>
      <Title eyebrow={`${i.id} · ${i.site}`} title={i.type} />
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          <Stack direction="row" spacing={1}>
            <SeverityChip severity={i.severity} />
            <StatusPill status={i.status} />
          </Stack>
          <Typography sx={{ whiteSpace: 'pre-wrap' }}>{i.description}</Typography>
          <Box
            component="dl"
            sx={{ m: 0, display: 'grid', gridTemplateColumns: 'max-content 1fr', columnGap: 2, rowGap: 0.5 }}
          >
            {facts.map(([k, v]) => (
              <Box key={k} sx={{ display: 'contents' }}>
                <Typography component="dt" variant="body2" sx={{ color: 'text.secondary' }}>
                  {k}
                </Typography>
                <Typography component="dd" variant="body2" sx={{ m: 0, whiteSpace: 'pre-wrap' }}>
                  {v}
                </Typography>
              </Box>
            ))}
          </Box>
          {i.photoUrls.length ? (
            <Stack direction="row" spacing={1}>
              {i.photoUrls.map((src, n) => (
                <Box key={src} sx={{ width: 110, height: 110 }}>
                  <FillThumb src={src} name={`Photo ${n + 1}`} onOpen={() => window.open(src, '_blank', 'noopener')} />
                </Box>
              ))}
            </Stack>
          ) : null}

          {i.updates.length ? (
            <Box>
              <Typography
                variant="eyebrow"
                sx={{ color: 'text.secondary', fontSize: '0.78rem', mb: 1, display: 'block' }}
              >
                Updates
              </Typography>
              {i.updates.map((u, n) => (
                <TimelineItem
                  key={`${u.at}-${n}`}
                  kind={u.status === 'closed' ? 'in' : u.status === 'open' ? 'bad' : 'pending'}
                  last={n === i.updates.length - 1}
                >
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {u.by?.name} · {fmtDateTime(u.at)}
                  </Typography>
                  {u.status || u.assignTo ? (
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                      {[u.status && `Status: ${STATUS_LABEL[u.status]}`, u.assignTo && `Given to ${u.assignTo.name}`]
                        .filter(Boolean)
                        .join(' · ')}
                    </Typography>
                  ) : null}
                  {u.text ? (
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                      {u.text}
                    </Typography>
                  ) : null}
                </TimelineItem>
              ))}
            </Box>
          ) : null}

          {mode === 'close' ? (
            <TextField
              label="How was it resolved?"
              required
              multiline
              minRows={2}
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          ) : mode === 'reopen' ? (
            <TextField
              label="Why reopen? (optional)"
              multiline
              minRows={2}
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          ) : rights.update ? (
            <Stack spacing={1.5}>
              <TextField
                label="Add an update"
                multiline
                minRows={2}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              {rights.status || rights.assign ? (
                <Grid container spacing={1.5}>
                  {rights.status ? (
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        select
                        label="Status"
                        value={status || i.status}
                        onChange={(e) => setStatus(e.target.value)}
                      >
                        <MenuItem value="open">Open</MenuItem>
                        <MenuItem value="in_progress">In progress</MenuItem>
                      </TextField>
                    </Grid>
                  ) : null}
                  {rights.assign ? (
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        select
                        label="Give to"
                        value={assignTo || i.assignedTo?.id || ''}
                        onChange={(e) => setAssignTo(e.target.value)}
                      >
                        <MenuItem value="" disabled>
                          Nobody yet
                        </MenuItem>
                        {assignees.map((a) => (
                          <MenuItem key={a.id} value={a.id}>
                            {a.name}
                            {a.designation ? ` · ${a.designation}` : ''}
                          </MenuItem>
                        ))}
                      </TextField>
                    </Grid>
                  ) : null}
                </Grid>
              ) : null}
            </Stack>
          ) : null}
          {error ? <Alert severity="error">{error}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, flexWrap: 'wrap', gap: 1 }}>
        {mode ? (
          <>
            <Button onClick={() => setMode(null)}>Back</Button>
            {mode === 'close' ? (
              <Button
                variant="contained"
                color="success"
                disabled={busy}
                onClick={() =>
                  text.trim()
                    ? save(() => incidentsApi.close(i.id, text.trim()))
                    : setError('Write how it was resolved.')
                }
              >
                {busy ? 'Saving…' : 'Close incident'}
              </Button>
            ) : (
              <Button
                variant="contained"
                disabled={busy}
                onClick={() => save(() => incidentsApi.reopen(i.id, text.trim()))}
              >
                {busy ? 'Saving…' : 'Reopen'}
              </Button>
            )}
          </>
        ) : (
          <>
            <Button onClick={onClose}>Done</Button>
            <Box sx={{ flex: 1 }} />
            {rights.reopen ? (
              <Button variant="outlined" onClick={() => setMode('reopen')}>
                Reopen
              </Button>
            ) : null}
            {rights.close ? (
              <Button variant="outlined" color="success" onClick={() => setMode('close')}>
                Close incident
              </Button>
            ) : null}
            {rights.update ? (
              <Button
                variant="contained"
                disabled={busy || (!text.trim() && !status && !assignTo)}
                onClick={sendUpdate}
              >
                {busy ? 'Saving…' : 'Save update'}
              </Button>
            ) : null}
          </>
        )}
      </DialogActions>
    </>
  );
}

/** `sheet` = { kind: 'report' } | { kind: 'detail', incident } | null. */
export function IncidentSheets({ sheet, onClose, onReported, onChanged }) {
  return (
    <Sheet open={!!sheet} onClose={onClose} maxWidth="sm">
      {sheet?.kind === 'report' ? (
        <ReportBody initial={sheet.initial} onClose={onClose} onDone={onReported} />
      ) : sheet?.kind === 'detail' ? (
        <DetailBody incident={sheet.incident} onClose={onClose} onChanged={onChanged} />
      ) : null}
    </Sheet>
  );
}
