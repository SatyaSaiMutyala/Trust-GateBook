import AsyncStorage from '@react-native-async-storage/async-storage';
import { createSlice } from '@reduxjs/toolkit';
// api.js imports this file too (selectSite); `api` is only used inside chooseSite, after both have loaded.
import { api } from './api';
import { selectIsGateUser } from './authSlice';
import { selectSettings } from './settingsSlice';

const KEY = 'gb.site';

/**
 * The gate this phone works at (gate users, several gates). The guard picks it on the device; their account's gate
 * is the default; otherwise the first gate. Gate-desk lists and new records use it (store/api.js).
 */
const siteSlice = createSlice({
  name: 'site',
  initialState: { chosen: '' },
  reducers: {
    siteChosen(state, action) {
      state.chosen = action.payload ?? '';
    },
  },
});

export const { siteChosen } = siteSlice.actions;
export default siteSlice.reducer;

/** The gate in use ('' with one gate, or for employees). */
export function selectSite(state) {
  const sites = selectSettings(state)?.sites ?? [];
  if (!selectIsGateUser(state) || sites.length < 2) return '';
  const chosen = state.site?.chosen ?? '';
  if (sites.includes(chosen)) return chosen;
  const own = state.auth.user?.site;
  return sites.includes(own) ? own : sites[0];
}

/** Several gates to choose from (gate users). */
export const selectMultiGate = state =>
  selectIsGateUser(state) && (selectSettings(state)?.sites?.length ?? 0) > 1;

/** Reads the saved choice at start-up. */
export const loadSite = () => async dispatch => {
  try {
    const saved = await AsyncStorage.getItem(KEY);
    if (saved) dispatch(siteChosen(saved));
  } catch {
    /* no storage: first gate */
  }
};

/** Switch gate: saved on the phone; every list reloads for the new gate. */
export const chooseSite = site => async dispatch => {
  dispatch(siteChosen(site));
  try {
    await AsyncStorage.setItem(KEY, site);
  } catch {
    /* ignore */
  }
  dispatch(api.util.resetApiState());
};
