import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '../api/client';
import { pushApi } from '../api/endpoints';
import { useUser } from '../auth/context';
import { isEmployee, isGateUser } from '../auth/roles';
import { useToast, useTrack } from '../state/context';
import { readStored, writeStored } from '../utils/storage';
import {
  currentSubscription,
  disablePush,
  enablePush,
  isIOS,
  isStandalone,
  pushSupported,
  refreshSubscription,
} from '../utils/webpush';
import { Panel } from './bits';

const DISMISS_KEY = 'gb.enable-dismiss';

/** Is this browser getting alerts? `refresh()` re-checks. */
function usePushState() {
  const [on, setOn] = useState(null);
  const refresh = useCallback(() => {
    currentSubscription()
      .then((s) => setOn(!!s))
      .catch(() => setOn(false));
  }, []);
  useEffect(() => {
    // Re-send the subscription after sign-in, then show the state.
    refreshSubscription()
      .then(setOn)
      .catch(() => setOn(false));
  }, []);
  return { on, refresh };
}

/** Banner under the top bar until alerts are on (or dismissed for a day). */
export function PushBanner() {
  const user = useUser();
  const toast = useToast();
  const { on, refresh } = usePushState();
  const [dismissed, setDismissed] = useState(() => Number(readStored(DISMISS_KEY) ?? 0) > Date.now());
  const [busy, setBusy] = useState(false);
  if (on !== false || dismissed) return null;
  const who = isEmployee(user)
    ? 'when a visitor or post arrives for you'
    : 'when a host accepts, declines or does not reply, a round is late, or post is disputed';
  const later = () => {
    writeStored(DISMISS_KEY, String(Date.now() + 24 * 3_600_000));
    setDismissed(true);
  };
  const turnOn = async () => {
    setBusy(true);
    try {
      toast(await enablePush());
      void pushApi.test().catch(() => {});
    } catch (err) {
      toast(err instanceof Error ? err.message : errorMessage(err));
    } finally {
      setBusy(false);
      refresh();
    }
  };
  const ios = isIOS() && !isStandalone();
  return (
    <Alert
      severity="info"
      sx={{ mb: 2 }}
      action={
        <Stack direction="row" spacing={1}>
          {!ios && pushSupported() ? (
            <Button size="small" variant="contained" onClick={turnOn} disabled={busy}>
              Turn on alerts
            </Button>
          ) : null}
          <Button size="small" onClick={later}>
            Later
          </Button>
        </Stack>
      }
    >
      {ios ? (
        <>
          <b>Install TruSentinel to get alerts {who}.</b> Tap the Share button in Safari, choose “Add to Home Screen”, then
          open TruSentinel from the Home Screen and sign in.
        </>
      ) : !pushSupported() ? (
        <>
          <b>This browser can't show TruSentinel alerts.</b> Use Chrome, Edge or Firefox, or the Trust Gatebook app on your
          phone.
        </>
      ) : (
        <>
          <b>Turn on alerts on this device.</b> Get a notification {who}, even when TruSentinel is closed.
        </>
      )}
    </Alert>
  );
}

/** My account → "Alerts on this device": on / off, test, the devices that get alerts, in-app sound. */
export function AlertsPanel() {
  const user = useUser();
  const toast = useToast();
  const track = useTrack();
  const { on, refresh } = usePushState();
  const [devices, setDevices] = useState([]);
  const [busy, setBusy] = useState(false);
  const loadDevices = useCallback(() => {
    pushApi
      .devices()
      .then(setDevices)
      .catch(() => {});
  }, []);
  useEffect(() => {
    loadDevices();
  }, [loadDevices, on]);
  const run = async (fn) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      toast(err instanceof Error ? err.message : errorMessage(err));
    } finally {
      setBusy(false);
      refresh();
      loadDevices();
    }
  };
  return (
    <Panel title="Alerts on this device">
      <Typography variant="body2" sx={{ mb: 1.5 }}>
        {on ? 'On. This device gets TruSentinel notifications even when the app is closed.' : 'Off on this device.'}
      </Typography>
      <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
        {on ? (
          <>
            <Button
              variant="outlined"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const r = await pushApi.test();
                  toast(r.sent ? 'Test alert sent' : 'No device is registered for alerts yet');
                })
              }
            >
              Send test alert
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await disablePush();
                  toast('Alerts are off on this device');
                })
              }
            >
              Turn off on this device
            </Button>
          </>
        ) : (
          <Button
            variant="contained"
            disabled={busy || on === null}
            onClick={() =>
              run(async () => {
                toast(await enablePush());
                void pushApi.test().catch(() => {});
              })
            }
          >
            Turn on alerts
          </Button>
        )}
      </Stack>
      {devices.length ? (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Alerts go to {devices.length} device{devices.length === 1 ? '' : 's'}: {devices.map((d) => d.name).join(', ')}
        </Typography>
      ) : null}
      {track && isGateUser(user) ? (
        <FormControlLabel
          sx={{ mt: 1 }}
          control={<Switch checked={track.sound} onChange={(e) => track.setSound(e.target.checked)} />}
          label={`In-app sound ${track.sound ? 'on' : 'off'}`}
        />
      ) : null}
    </Panel>
  );
}
