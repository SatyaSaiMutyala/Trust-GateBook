import { Fragment, useCallback, useMemo, useState } from 'react';
import { gate } from '../api/client';
import { useUser } from '../auth/context';
import { isGateUser } from '../auth/roles';
import { readStored, writeStored } from '../utils/storage';
import { SiteContext, useSettings } from './context';

const KEY = 'gb.site';

/** Points the API layer at a gate (gate-desk lists and new records use it). @param {string} site */
function pointApiAt(site) {
  gate.site = site;
}

/**
 * The gate this device works at (several gates only). Guards pick theirs on their device; their account's gate is the
 * default; otherwise the first gate. Changing it reloads the screens for that gate. Employees: no gate.
 */
export function SiteProvider({ children }) {
  const { settings, error } = useSettings();
  const user = useUser();
  const sites = useMemo(() => settings?.sites ?? [], [settings]);
  const [chosen, setChosen] = useState(() => readStored(KEY) ?? '');
  const gateUser = isGateUser(user);
  const multi = gateUser && sites.length > 1;
  let site = '';
  if (multi) site = sites.includes(chosen) ? chosen : sites.includes(user.site) ? user.site : sites[0];
  pointApiAt(site);
  const setSite = useCallback((s) => {
    writeStored(KEY, s);
    setChosen(s);
  }, []);
  const value = useMemo(() => ({ site, sites, multi, setSite }), [site, sites, multi, setSite]);
  // Wait for the gate list (unless it failed to load) so screens do not load twice.
  if (!settings && !error) return null;
  return (
    <SiteContext.Provider value={value}>
      <Fragment key={site}>{children}</Fragment>
    </SiteContext.Provider>
  );
}
