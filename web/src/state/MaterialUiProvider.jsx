import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import { useCallback, useMemo, useState } from 'react';
import { errorMessage } from '../api/client';
import { materialApi } from '../api/endpoints';
import { useUser } from '../auth/context';
import { canOperate } from '../auth/roles';
import { MaterialDetail } from '../components/material/MaterialDetail';
import { MaterialForm } from '../components/material/MaterialForm';
import { MaterialActionSheet } from '../components/material/MaterialSheets';
import { useLocalEmit, useRealtimeEvent } from '../realtime/context';
import { boxesText } from '../utils/material';
import { MaterialUiContext, useToast } from './context';

/**
 * Hosts the material gate pass form, details and action sheets so any screen can open them:
 * `openNew({ direction?, visitId?, expected? })`, `openDetail(passOrId)`, `act(kind, pass)`, `remind(pass)`,
 * `cancel(pass)`, `openPdf(pass)`.
 */
export function MaterialUiProvider({ children }) {
  const user = useUser();
  const toast = useToast();
  const emit = useLocalEmit();
  const [form, setForm] = useState({ open: false, opts: null });
  const [detail, setDetail] = useState({ open: false, pass: null });
  const [action, setAction] = useState(null);
  const [confirm, setConfirm] = useState(null);

  useRealtimeEvent('material:changed', ({ pass }) => {
    setDetail((d) => (d.pass && d.pass.id === pass.id ? { ...d, pass } : d));
  });
  const changed = useCallback(
    (pass) => {
      emit('material:changed', { pass });
      setDetail((d) => (d.pass && d.pass.id === pass.id ? { ...d, pass } : d));
    },
    [emit],
  );

  const openNew = useCallback((opts = {}) => setForm({ open: true, opts }), []);
  const openDetail = useCallback(
    async (passOrId) => {
      if (typeof passOrId !== 'string') return setDetail({ open: true, pass: passOrId });
      try {
        setDetail({ open: true, pass: await materialApi.get(passOrId) });
      } catch (err) {
        toast(errorMessage(err));
      }
      return undefined;
    },
    [toast],
  );
  const act = useCallback((kind, pass) => setAction({ kind, pass }), []);
  const remind = useCallback(
    async (pass) => {
      try {
        await materialApi.remind(pass.id);
        toast('Reminder sent');
      } catch (err) {
        toast(errorMessage(err));
      }
    },
    [toast],
  );
  const cancel = useCallback((pass) => setConfirm(pass), []);
  const openPdf = useCallback(
    async (pass) => {
      try {
        const { blob } = await materialApi.pdf(pass.id);
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank', 'noopener');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } catch (err) {
        toast(errorMessage(err));
      }
    },
    [toast],
  );

  const saved = (pass) => {
    setForm({ open: false, opts: null });
    changed(pass);
    const name = pass.authorisedBy?.name ?? 'the employee';
    const gate = canOperate(user);
    const msg = {
      awaiting_receipt: `Saved. ${name} has been asked to accept ${boxesText(pass.boxes)}.`,
      awaiting_approval: `Sent to ${name} for approval`,
      ready: gate
        ? 'Saved. Count the boxes when the visitor leaves.'
        : 'Saved. Security will count the boxes when the visitor leaves.',
      awaiting_drop: 'Saved. Hand the boxes to security.',
    }[pass.status];
    toast(msg ?? `Gate pass ${pass.id} saved`);
    form.opts?.onSaved?.(pass);
    setDetail({ open: true, pass });
  };

  const value = useMemo(
    () => ({ openNew, openDetail, act, remind, cancel, openPdf }),
    [openNew, openDetail, act, remind, cancel, openPdf],
  );
  return (
    <MaterialUiContext.Provider value={value}>
      {children}
      <MaterialForm
        open={form.open}
        opts={form.opts}
        onClose={() => setForm({ open: false, opts: null })}
        onSaved={saved}
      />
      <MaterialDetail pass={detail.pass} open={detail.open} onClose={() => setDetail((d) => ({ ...d, open: false }))} />
      <MaterialActionSheet
        action={action}
        onClose={() => setAction(null)}
        onDone={(pass, text) => {
          setAction(null);
          changed(pass);
          if (text) toast(text);
        }}
      />
      <Dialog open={!!confirm} onClose={() => setConfirm(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Cancel this gate pass?</DialogTitle>
        <DialogContent>
          {confirm ? `${confirm.id} · ${boxesText(confirm.boxes)}. Nothing has moved yet.` : ''}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(null)}>Keep</Button>
          <Button
            color="error"
            variant="contained"
            onClick={async () => {
              const p = confirm;
              setConfirm(null);
              try {
                changed(await materialApi.cancel(p.id));
                toast('Gate pass cancelled');
              } catch (err) {
                toast(errorMessage(err));
              }
            }}
          >
            Cancel pass
          </Button>
        </DialogActions>
      </Dialog>
    </MaterialUiContext.Provider>
  );
}
