import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '../../api/client';
import { patrolApi } from '../../api/endpoints';
import { fmtTime } from '../../utils/format';
import { codeFrom, hhmm } from '../../utils/ops';
import { PhotoList } from '../material/PhotoList';
import { Sheet } from '../Sheet';

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

/** Camera QR reader (BarcodeDetector where the browser has it) plus the typed 6-letter code. */
function ScannerBody({ onCode, onClose }) {
  const video = useRef(/** @type {HTMLVideoElement | null} */ (null));
  const [msg, setMsg] = useState(() =>
    'BarcodeDetector' in window && navigator.mediaDevices?.getUserMedia
      ? 'Starting camera…'
      : "Camera isn't available here. Type the code under the QR instead.",
  );
  const [typed, setTyped] = useState('');
  const [error, setError] = useState(null);
  const done = useRef(false);
  const onCodeRef = useRef(onCode);
  useEffect(() => {
    onCodeRef.current = onCode;
  });

  useEffect(() => {
    if (!('BarcodeDetector' in window) || !navigator.mediaDevices?.getUserMedia) return undefined;
    let stream = null;
    let timer = null;
    let stopped = false;
    const detector = new BarcodeDetector({ formats: ['qr_code'] });
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((s) => {
        if (stopped) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          video.current.play().catch(() => {});
        }
        setMsg('Point the camera at the QR code');
        timer = setInterval(async () => {
          if (done.current || !video.current || video.current.readyState < 2) return;
          try {
            const found = await detector.detect(video.current);
            if (!found.length) return;
            const code = codeFrom(found[0].rawValue);
            if (!code) {
              setMsg('That QR is not a TruSentinel checkpoint');
              return;
            }
            done.current = true;
            onCodeRef.current(code, false);
          } catch {
            /* frame not ready */
          }
        }, 300);
      })
      .catch(() => setMsg('Camera blocked or not available. Allow camera access, or type the code under the QR.'));
    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const submitTyped = () => {
    const code = codeFrom(typed);
    if (!code) {
      setError('Enter the 6-letter code printed under the QR');
      return;
    }
    done.current = true;
    onCode(code, true);
  };

  return (
    <>
      <Title eyebrow="Patrol" title="Scan checkpoint QR" />
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          <Box
            sx={{
              position: 'relative',
              borderRadius: '12px',
              overflow: 'hidden',
              bgcolor: '#000',
              aspectRatio: '4 / 3',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <Box
              component="video"
              ref={video}
              muted
              playsInline
              sx={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }}
            />
            <Typography
              sx={{
                position: 'relative',
                color: '#fff',
                bgcolor: 'rgba(0,0,0,0.5)',
                px: 1.5,
                py: 0.5,
                borderRadius: 1,
              }}
            >
              {msg}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <TextField
              label="Or type the 6-letter code"
              value={typed}
              onChange={(e) =>
                setTyped(
                  e.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, '')
                    .slice(0, 6),
                )
              }
              onKeyDown={(e) => e.key === 'Enter' && submitTyped()}
              slotProps={{ htmlInput: { autoCapitalize: 'characters', style: { letterSpacing: 4, fontWeight: 700 } } }}
            />
            <Button variant="contained" onClick={submitTyped}>
              Continue
            </Button>
          </Stack>
          {error ? <Alert severity="error">{error}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </>
  );
}

/** Which checkpoint, which round it counts for; condition, note, photo. */
function ConfirmBody({ code, manual, onClose, onDone }) {
  const [look, setLook] = useState(null);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('ok');
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const ctrl = new AbortController();
    patrolApi
      .lookup(code, ctrl.signal)
      .then(setLook)
      .catch((err) => !ctrl.signal.aborted && setError(errorMessage(err)));
    return () => ctrl.abort();
  }, [code]);
  const cp = look?.checkpoint;
  const save = async () => {
    if (status === 'issue' && !note.trim()) return setError('Describe the issue in the note');
    if (cp?.photoRequired && !photos.length) return setError('Take a photo at this checkpoint');
    setBusy(true);
    setError(null);
    try {
      onDone(await patrolApi.scan({ code, status, note: note.trim(), manual }, photos[0]?.blob ?? null));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
    return undefined;
  };
  return (
    <>
      <Title
        eyebrow={`Checkpoint · ${code}`}
        title={cp ? cp.name : look === null && !error ? 'Checking…' : 'Checkpoint'}
      />
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          {cp ? (
            <>
              {cp.location ? <Typography sx={{ color: 'text.secondary' }}>{cp.location}</Typography> : null}
              <Alert severity={look.slot ? 'info' : 'warning'}>
                {look.slot
                  ? `Counts for ${look.round.name} ${hhmm(look.slot.at)} · ${look.done} of ${look.total} done so far`
                  : 'No round is due at this checkpoint right now. It will be saved as an extra scan.'}
              </Alert>
              <Box>
                <Typography
                  variant="eyebrow"
                  sx={{ color: 'text.secondary', fontSize: '0.78rem', mb: 0.75, display: 'block' }}
                >
                  Condition
                </Typography>
                <ToggleButtonGroup exclusive value={status} onChange={(_, v) => v && setStatus(v)}>
                  <ToggleButton value="ok" color="success">
                    All OK
                  </ToggleButton>
                  <ToggleButton value="issue" color="error">
                    Issue found
                  </ToggleButton>
                </ToggleButtonGroup>
              </Box>
              <TextField
                label={status === 'issue' ? 'Note (describe the issue)' : 'Note (optional)'}
                placeholder="e.g. Door locked, lights off"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                multiline
                minRows={2}
              />
              <PhotoList
                title={cp.photoRequired ? 'Photo (required here)' : 'Photo'}
                label="Photo"
                value={photos}
                onChange={setPhotos}
                max={1}
                required={cp.photoRequired}
                maxEdge={1100}
              />
            </>
          ) : null}
          {error ? <Alert severity="error">{error}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Back</Button>
        <Button variant="contained" onClick={save} disabled={!cp || busy}>
          {busy ? 'Saving…' : 'Save scan'}
        </Button>
      </DialogActions>
    </>
  );
}

/** After a scan: progress, report as incident (issues), scan next. */
function DoneBody({ result: r, onClose, onNext, onIncident }) {
  const issue = r.scan.status === 'issue';
  return (
    <>
      <Title eyebrow={`${fmtTime(r.scan.at)}${issue ? ' · issue noted' : ''}`} title={`${r.checkpoint.name} scanned`} />
      <DialogContent>
        <Typography>
          {r.slot
            ? r.done === r.total
              ? `${r.round.name} complete. All ${r.total} checkpoints scanned.`
              : `${r.done} of ${r.total} done in ${r.round.name}. Still to scan: ${r.missing.join(', ')}.`
            : 'Saved as an extra scan (no round due).'}
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, flexWrap: 'wrap', gap: 1 }}>
        {issue ? (
          <Button color="error" variant="outlined" onClick={onIncident}>
            Report as incident
          </Button>
        ) : null}
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose}>Done</Button>
        <Button variant="contained" onClick={onNext}>
          Scan next
        </Button>
      </DialogActions>
    </>
  );
}

/**
 * The scan flow. `sheet` = { kind: 'scanner' } | { kind: 'confirm', code, manual } | { kind: 'done', result } | null.
 * `onIncident(prefill)` opens the incident report.
 */
export function ScanSheets({ sheet, setSheet, onScanned, onIncident }) {
  const close = () => setSheet(null);
  return (
    <Sheet open={!!sheet} onClose={close} maxWidth="sm">
      {sheet?.kind === 'scanner' ? (
        <ScannerBody onClose={close} onCode={(code, manual) => setSheet({ kind: 'confirm', code, manual })} />
      ) : sheet?.kind === 'confirm' ? (
        <ConfirmBody
          code={sheet.code}
          manual={sheet.manual}
          onClose={close}
          onDone={(result) => {
            onScanned?.(result);
            setSheet({ kind: 'done', result });
          }}
        />
      ) : sheet?.kind === 'done' ? (
        <DoneBody
          result={sheet.result}
          onClose={close}
          onNext={() => setSheet({ kind: 'scanner' })}
          onIncident={() => {
            const { checkpoint: cp, scan } = sheet.result;
            onIncident({
              location: cp.name + (cp.location ? `, ${cp.location}` : ''),
              description: scan.note,
              source: 'patrol',
            });
          }}
        />
      ) : null}
    </Sheet>
  );
}
