import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useRef, useState } from 'react';
import { errorMessage } from '../../api/client';
import { mailApi } from '../../api/endpoints';
import { useToast } from '../../state/context';
import { fonts } from '../../theme/tokens';
import { fmtTime } from '../../utils/format';
import { firstWord, hasRecipientUser } from '../../utils/mail';
import { VisitorThumb } from '../bits';
import { Sheet } from '../Sheet';

function SheetHead({ item: m, title }) {
  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 2.5 }}>
      <VisitorThumb src={m.coverPhotoUrl} name={m.kind || 'Post'} size={56} />
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="eyebrow" sx={{ color: 'text.secondary' }}>
          {title}
        </Typography>
        <Typography variant="h3" sx={{ wordBreak: 'break-word' }}>
          {m.kind} for {m.recipientName}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {m.sender ? `From ${m.sender}` : ''}
          {m.refNo ? (
            <Box component="span" sx={{ fontFamily: fonts.mono }}>
              {' '}
              · {m.refNo}
            </Box>
          ) : null}
        </Typography>
      </Box>
    </Stack>
  );
}

// ---- Handover -----------------------------------------------------------------

export function HandoverSheet({ item, open, onClose, onDone }) {
  return (
    <Sheet open={open && !!item} onClose={onClose}>
      {item ? <HandoverForm key={item.id} item={item} onClose={onClose} onDone={onDone} /> : null}
    </Sheet>
  );
}

function HandoverForm({ item: m, onClose, onDone }) {
  const toast = useToast();
  const [collectedBy, setCollectedBy] = useState(m.recipientName ?? '');
  const [mode, setMode] = useState('self');
  const [note, setNote] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const user = hasRecipientUser(m);

  const submit = async (e) => {
    e.preventDefault();
    if (!collectedBy.trim()) {
      setError('Write who collected it.');
      inputRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await mailApi.handover(m.id, { collectedBy: collectedBy.trim(), note: note.trim() || undefined });
      toast(user ? `Handed over · ${m.recipientName} asked to confirm` : `Handed over · ${m.recipientName}`);
      onDone(updated);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box component="form" onSubmit={submit} sx={{ p: { xs: 2, md: 3 } }}>
      <SheetHead item={m} title="Hand over" />
      <Stack spacing={2}>
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
          <Chip
            clickable
            label={`${firstWord(m.recipientName) || 'Receiver'} in person`}
            variant={mode === 'self' ? 'filled' : 'outlined'}
            color={mode === 'self' ? 'secondary' : 'default'}
            onClick={() => {
              setMode('self');
              setCollectedBy(m.recipientName ?? '');
            }}
          />
          <Chip
            clickable
            label="Someone on their behalf"
            variant={mode === 'other' ? 'filled' : 'outlined'}
            color={mode === 'other' ? 'secondary' : 'default'}
            onClick={() => {
              setMode('other');
              setCollectedBy('');
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
          />
        </Stack>
        <TextField
          label="Collected by"
          required
          value={collectedBy}
          onChange={(e) => setCollectedBy(e.target.value)}
          inputRef={inputRef}
          error={!!error && !collectedBy.trim()}
        />
        <TextField
          label="Remarks"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Signed in register, ID seen"
          multiline
          minRows={2}
        />
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {user
            ? `${m.recipientName} will be asked to confirm on their phone that they received it.`
            : m.recipient
              ? `${m.recipientName} can't sign in to TruSentinel, so there is no confirmation step.`
              : `${m.recipientName} is not on TruSentinel, so there is no confirmation step.`}
        </Typography>
        {error ? <Alert severity="error">{error}</Alert> : null}
        <Stack direction="row" spacing={1.5} sx={{ justifyContent: 'flex-end' }}>
          <Button variant="outlined" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            color="success"
            disabled={busy}
            sx={{ flex: { xs: 1, md: 'none' } }}
          >
            {busy ? 'Saving…' : 'Confirm handover'}
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}

// ---- Resolve ------------------------------------------------------------------

export function ResolveSheet({ item, open, onClose, onDone }) {
  return (
    <Sheet open={open && !!item} onClose={onClose}>
      {item ? <ResolveForm key={item.id} item={item} onClose={onClose} onDone={onDone} /> : null}
    </Sheet>
  );
}

function ResolveForm({ item: m, onClose, onDone }) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!note.trim()) {
      setError('Write what was found or done.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await mailApi.resolve(m.id, { note: note.trim() });
      toast(`Resolved · ${m.kind} for ${m.recipientName}`);
      onDone(updated);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box component="form" onSubmit={submit} sx={{ p: { xs: 2, md: 3 } }}>
      <SheetHead item={m} title="Resolve issue" />
      <Stack spacing={2}>
        <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: 'gb.badSoft' }}>
          <Typography variant="body2">
            Handed to {m.collectedBy || '—'}
            {m.handedAt ? ` at ${fmtTime(m.handedAt)}` : ''} · “{m.disputeNote || 'Receiver says it was not collected'}”
          </Typography>
        </Box>
        <TextField
          label="What was found or done"
          required
          autoFocus
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            setError(null);
          }}
          error={!!error}
          multiline
          minRows={3}
        />
        {error ? <Alert severity="error">{error}</Alert> : null}
        <Stack direction="row" spacing={1.5} sx={{ justifyContent: 'flex-end' }}>
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
            {busy ? 'Saving…' : 'Mark resolved'}
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
