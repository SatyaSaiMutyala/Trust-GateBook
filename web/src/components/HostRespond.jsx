import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useState } from 'react';
import { useVisitUi } from '../state/context';

const ACCEPT_REPLIES = [
  'Send to my office',
  "I'll come to the gate",
  'Ask them to wait 10 minutes',
  'Send to the meeting room',
];
const DECLINE_REPLIES = ['Not available today', 'Not expecting this visitor', 'Please reschedule'];

/**
 * The visited host answers a waiting visitor: optional message to security (quick replies fill it), then
 * Decline / Accept. `note` / `onNote` let a list keep typed notes across live refreshes.
 */
export function HostRespond({ visit, note, onNote, onDone, size = 'large' }) {
  const { respond } = useVisitUi();
  const [busy, setBusy] = useState(false);
  const [ownNote, setOwnNote] = useState('');
  const value = note ?? ownNote;
  const setValue = onNote ?? setOwnNote;

  const answer = async (status) => {
    setBusy(true);
    const updated = await respond(visit, status, value);
    setBusy(false);
    if (updated) onDone?.(updated);
  };

  return (
    <Stack spacing={1.5}>
      <TextField
        label="Message to security (optional)"
        value={value}
        onChange={(e) => setValue(e.target.value.slice(0, 200))}
        placeholder="e.g. Send to 2nd floor cabin"
      />
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }} aria-label="Quick replies">
        {[...ACCEPT_REPLIES, ...DECLINE_REPLIES].map((r) => (
          <Chip key={r} label={r} clickable variant={value === r ? 'filled' : 'outlined'} onClick={() => setValue(r)} />
        ))}
      </Stack>
      <Stack direction="row" spacing={1.5}>
        <Button
          variant="outlined"
          color="error"
          size={size}
          startIcon={<CloseIcon />}
          disabled={busy}
          onClick={() => answer('declined')}
          sx={{ flex: 1 }}
        >
          Decline
        </Button>
        <Button
          variant="contained"
          color="success"
          size={size}
          startIcon={<CheckIcon />}
          disabled={busy}
          onClick={() => answer('accepted')}
          sx={{ flex: 2 }}
        >
          Accept, let them in
        </Button>
      </Stack>
    </Stack>
  );
}
