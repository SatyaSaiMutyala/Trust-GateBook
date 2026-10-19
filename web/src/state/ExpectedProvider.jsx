import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { expectedApi } from '../api/endpoints';
import { ExpectedDialog } from '../components/ExpectedDialog';
import { useUser } from '../auth/context';
import { hasModule } from '../auth/roles';
import { useExpectedChanges } from '../realtime/context';
import { ExpectedContext, useCheckInDraft, useSettings, useToast } from './context';

/**
 * Hosts the "Expect a visitor / delivery" dialog, the nav count of entries still expected today, and
 * `checkInFrom(entry)`: opens Check in with the entry's details filled in (security takes the photo and the pass).
 */
export function ExpectedProvider({ children }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { settings } = useSettings();
  const { update, reset, setIssued } = useCheckInDraft();
  const [today, setToday] = useState(null);
  const [nonce, setNonce] = useState(0);
  const [dialog, setDialog] = useState({ open: false, entry: null, kind: 'visitor' });

  const user = useUser();
  const enabled = hasModule(user, 'expected');
  useEffect(() => {
    if (!enabled) return undefined;
    const ctrl = new AbortController();
    expectedApi
      .list({ when: 'today', limit: 1, page: 1 }, ctrl.signal)
      .then((r) => setToday(r.counts.today))
      .catch(() => {});
    return () => ctrl.abort();
  }, [nonce, enabled]);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  useExpectedChanges(refresh, 300);

  const openNew = useCallback((kind = 'visitor') => setDialog({ open: true, entry: null, kind }), []);
  const openEdit = useCallback((entry) => setDialog({ open: true, entry, kind: entry.kind }), []);

  const checkInFrom = useCallback(
    (e) => {
      // The person who meets them at the gate's location is the one asked to accept.
      const meet = e.contact ?? e.host;
      reset();
      setIssued(null);
      update({
        expected: e,
        name: e.name,
        phone: e.phone,
        company: e.company,
        persons: String(e.persons || 1),
        purpose: settings?.purposes?.includes(e.purpose) ? e.purpose : '',
        hostPick: { id: meet.id, name: meet.name, dept: '', location: '', phone: '' },
        host: meet.name,
        vehicle: e.vehicle,
        items: e.items,
      });
      navigate('/check-in');
      toast(`${e.name}'s details are filled in. Take the photo and give the pass.`);
    },
    [navigate, reset, setIssued, settings, toast, update],
  );

  const value = useMemo(
    () => ({ today, refresh, openNew, openEdit, checkInFrom }),
    [today, refresh, openNew, openEdit, checkInFrom],
  );
  return (
    <ExpectedContext.Provider value={value}>
      {children}
      <ExpectedDialog
        open={dialog.open}
        entry={dialog.entry}
        kind={dialog.kind}
        onClose={() => setDialog((d) => ({ ...d, open: false }))}
        onSaved={refresh}
      />
    </ExpectedContext.Provider>
  );
}
