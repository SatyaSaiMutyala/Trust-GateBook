import { useCallback, useMemo, useState } from 'react';
import { ApiError, errorMessage } from '../api/client';
import { mailApi, normalizeMail } from '../api/endpoints';
import { MailDetailsDrawer } from '../components/mail/MailDetailsDrawer';
import { HandoverSheet, ResolveSheet } from '../components/mail/MailSheets';
import { useLocalEmit, useRealtimeEvent } from '../realtime/context';
import { MailUiContext, useToast } from './context';

/**
 * Hosts the post item details drawer and the Handover / Resolve sheets, plus the one-tap actions
 * (remind, confirm / dispute) so every post screen shares them.
 */
export function MailUiProvider({ children }) {
  const toast = useToast();
  const emit = useLocalEmit();
  const [details, setDetails] = useState({ item: null, open: false });
  const [handover, setHandover] = useState({ item: null, open: false });
  const [resolve, setResolve] = useState({ item: null, open: false });

  const changed = useCallback(
    (item) => {
      emit('mail:updated', { item });
      setDetails((d) => (d.item && d.item.id === item.id ? { ...d, item } : d));
    },
    [emit],
  );

  useRealtimeEvent('mail:updated', ({ item }) => {
    setDetails((d) => (d.item && d.item.id === item.id ? { ...d, item } : d));
  });

  const openDetails = useCallback((item) => setDetails({ item, open: true }), []);
  const openHandover = useCallback((item) => setHandover({ item, open: true }), []);
  const openResolve = useCallback((item) => setResolve({ item, open: true }), []);

  const remind = useCallback(
    async (item) => {
      try {
        const updated = await mailApi.remind(item.id);
        toast(`Reminder sent to ${updated.recipientName}`);
        changed(updated);
      } catch (err) {
        toast(errorMessage(err));
      }
    },
    [toast, changed],
  );

  /** Receiver answers: ok → confirmed; !ok → disputed with the note. Returns true on success. */
  const confirm = useCallback(
    async (item, ok, note) => {
      try {
        const updated = await mailApi.confirm(item.id, { ok, note: note?.trim() || undefined });
        toast(ok ? 'Thank you. Collection confirmed.' : 'Security has been told and will contact you.');
        changed(updated);
        return true;
      } catch (err) {
        toast(errorMessage(err));
        // Conflict carries the current item: show its real state.
        if (err instanceof ApiError && err.details?.item) changed(normalizeMail(err.details.item));
        return false;
      }
    },
    [toast, changed],
  );

  const value = useMemo(
    () => ({ openDetails, openHandover, openResolve, remind, confirm }),
    [openDetails, openHandover, openResolve, remind, confirm],
  );
  return (
    <MailUiContext.Provider value={value}>
      {children}
      <MailDetailsDrawer
        item={details.item}
        open={details.open}
        onClose={() => setDetails((d) => ({ ...d, open: false }))}
      />
      <HandoverSheet
        item={handover.item}
        open={handover.open}
        onClose={() => setHandover((h) => ({ ...h, open: false }))}
        onDone={(item) => {
          setHandover((h) => ({ ...h, open: false }));
          changed(item);
        }}
      />
      <ResolveSheet
        item={resolve.item}
        open={resolve.open}
        onClose={() => setResolve((r) => ({ ...r, open: false }))}
        onDone={(item) => {
          setResolve((r) => ({ ...r, open: false }));
          changed(item);
        }}
      />
    </MailUiContext.Provider>
  );
}
