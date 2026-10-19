import CheckIcon from '@mui/icons-material/Check';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import Button from '@mui/material/Button';
import { useState } from 'react';
import { useUser } from '../auth/context';
import { canOperate } from '../auth/roles';
import { useVisitUi } from '../state/context';
import { hostStage } from '../utils/visit';

/** `tel:` link for a phone number as typed ("98765 00001" → "tel:9876500001"). */
const telHref = (phone) => `tel:${String(phone).replace(/[^\d+]/g, '')}`;

/**
 * The gate's next step for an open visit that hasn't been let in yet:
 * host accepted → "Allowed in"; not on Gatebook / no reply → "Call host" + "Confirmed by phone".
 * Renders nothing for viewers, let-in or declined visits (declined → the Exit button does the rest).
 */
export function HostActions({ visit, size = 'small', fullWidth = false }) {
  const user = useUser();
  const { allow } = useVisitUi();
  const [busy, setBusy] = useState(false);
  const stage = hostStage(visit);
  if (!canOperate(user) || !stage || stage.key === 'declined') return null;

  const run = (viaPhone) => async (e) => {
    e.stopPropagation();
    setBusy(true);
    await allow(visit, viaPhone);
    setBusy(false);
  };
  const stop = (e) => e.stopPropagation();

  if (stage.key === 'accepted') {
    return (
      <Button
        variant="contained"
        color="success"
        size={size}
        fullWidth={fullWidth}
        startIcon={<CheckIcon />}
        disabled={busy}
        onClick={run(false)}
      >
        Allowed in
      </Button>
    );
  }
  const showCall = stage.key === 'noreply' || stage.key === 'manual';
  return (
    <>
      {showCall && visit.hostPhone ? (
        <Button
          component="a"
          href={telHref(visit.hostPhone)}
          onClick={stop}
          variant="outlined"
          size={size}
          fullWidth={fullWidth}
          startIcon={<PhoneOutlinedIcon />}
        >
          Call host
        </Button>
      ) : null}
      <Button
        variant="outlined"
        size={size}
        fullWidth={fullWidth}
        startIcon={<CheckIcon />}
        disabled={busy}
        onClick={run(true)}
      >
        Confirmed by phone
      </Button>
    </>
  );
}
