import { useCallback, useMemo, useState } from 'react';
import { ApiError, errorMessage } from '../api/client';
import { normalizeVisit, visitsApi } from '../api/endpoints';
import { ExitDialog } from '../components/ExitDialog';
import { VisitorDetailsDrawer } from '../components/VisitorDetailsDrawer';
import { useLocalEmit, useRealtimeEvent } from '../realtime/context';
import { useToast, VisitUiContext } from './context';

/**
 * Hosts the Visitor details drawer and the Exit sheet so any screen can open them, plus the one-tap host-approval
 * actions: `allow(visit, viaPhone)` for security and `respond(visit, status, note)` for the visited host.
 * Both return the updated visit, or null when it failed (a toast says why).
 */
export function VisitUiProvider({ children }) {
  const [details, setDetails] = useState({ visit: null, open: false });
  const [exit, setExit] = useState({ visit: null, open: false });
  const toast = useToast();

  const openDetails = useCallback((visit) => setDetails({ visit, open: true }), []);
  const openExit = useCallback((visit) => setExit({ visit, open: true }), []);
  const emit = useLocalEmit();

  // Keep the open drawer in sync with live changes.
  useRealtimeEvent('visit:updated', ({ visit }) => {
    setDetails((d) => (d.visit && d.visit.id === visit.id ? { ...d, visit } : d));
  });

  /** Broadcast a change we made (lists update even if the socket is down) and refresh the open drawer. */
  const changed = useCallback(
    (visit) => {
      emit('visit:updated', { visit });
      setDetails((d) => (d.visit && d.visit.id === visit.id ? { ...d, visit } : d));
    },
    [emit],
  );

  /** On a conflict the server sends the current visit: show it instead of the stale one. */
  const failed = useCallback(
    (err) => {
      if (err instanceof ApiError && err.details?.visit) changed(normalizeVisit(err.details.visit));
      toast(errorMessage(err));
      return null;
    },
    [changed, toast],
  );

  const allow = useCallback(
    async (visit, viaPhone = false) => {
      try {
        const updated = await visitsApi.allow(visit.id, { viaPhone });
        changed(updated);
        toast(`${updated.name} allowed in`);
        return updated;
      } catch (err) {
        return failed(err);
      }
    },
    [changed, failed, toast],
  );

  const respond = useCallback(
    async (visit, status, note = '') => {
      try {
        const updated = await visitsApi.respond(visit.id, { status, note: note.trim() || undefined });
        changed(updated);
        toast(
          status === 'accepted'
            ? `Accepted. Security will send ${updated.name} in.`
            : 'Declined. Security has been told.',
        );
        return updated;
      } catch (err) {
        return failed(err);
      }
    },
    [changed, failed, toast],
  );

  const value = useMemo(() => ({ openDetails, openExit, allow, respond }), [openDetails, openExit, allow, respond]);
  return (
    <VisitUiContext.Provider value={value}>
      {children}
      <VisitorDetailsDrawer
        visit={details.visit}
        open={details.open}
        onClose={() => setDetails((d) => ({ ...d, open: false }))}
        onExit={openExit}
      />
      <ExitDialog
        visit={exit.visit}
        open={exit.open}
        onClose={() => setExit((e) => ({ ...e, open: false }))}
        onDone={(updated) => {
          setExit((e) => ({ ...e, open: false }));
          emit('visit:updated', { visit: updated });
          setDetails((d) => (d.visit && d.visit.id === updated.id ? { ...d, visit: updated } : d));
        }}
      />
    </VisitUiContext.Provider>
  );
}
