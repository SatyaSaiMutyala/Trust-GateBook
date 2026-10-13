import { useCallback, useMemo, useState } from 'react';
import { ExitDialog } from '../components/ExitDialog';
import { VisitorDetailsDrawer } from '../components/VisitorDetailsDrawer';
import { useLocalEmit, useRealtimeEvent } from '../realtime/context';
import { VisitUiContext } from './context';

/** Hosts the Visitor details drawer and the Exit sheet so any screen can open them. */
export function VisitUiProvider({ children }) {
  const [details, setDetails] = useState({ visit: null, open: false });
  const [exit, setExit] = useState({ visit: null, open: false });

  const openDetails = useCallback((visit) => setDetails({ visit, open: true }), []);
  const openExit = useCallback((visit) => setExit({ visit, open: true }), []);
  const emit = useLocalEmit();

  // Keep the open drawer in sync with live changes.
  useRealtimeEvent('visit:updated', ({ visit }) => {
    setDetails((d) => (d.visit && d.visit.id === visit.id ? { ...d, visit } : d));
  });

  const value = useMemo(() => ({ openDetails, openExit }), [openDetails, openExit]);
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
