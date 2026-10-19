import { createSlice } from '@reduxjs/toolkit';

/**
 * Session state. `status`: 'restoring' until the Keychain has been read at launch, then 'ready'.
 * The token is also persisted in the Keychain by the auth listeners (see listeners.js).
 */
const initialState = { status: 'restoring', token: null, user: null };

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    sessionRestored(state, action) {
      state.status = 'ready';
      state.token = action.payload?.token ?? null;
      state.user = action.payload?.user ?? null;
    },
    loggedIn(state, action) {
      state.status = 'ready';
      state.token = action.payload.token;
      state.user = action.payload.user;
    },
    userUpdated(state, action) {
      if (state.token) state.user = action.payload;
    },
    loggedOut(state) {
      state.status = 'ready';
      state.token = null;
      state.user = null;
    },
  },
});

export const { sessionRestored, loggedIn, userUpdated, loggedOut } =
  authSlice.actions;
export default authSlice.reducer;

// ---- selectors ----
export const selectAuthReady = s => s.auth.status === 'ready';
export const selectToken = s => s.auth.token;
export const selectUser = s => s.auth.user;
export const selectRole = s => s.auth.user?.role ?? null;
export const selectIsSignedIn = s => !!s.auth.token && !!s.auth.user;
export const selectIsAdmin = s => selectRole(s) === 'admin';
/** Security / admin may check visitors in, record exits, log/hand over/resolve post. */
export const selectCanCheckIn = s =>
  selectRole(s) === 'admin' || selectRole(s) === 'security';
export const selectCanHandleMail = selectCanCheckIn;
/** "Gate" users see visitor screens and the post room; employees (role `host`) do not. */
export const selectIsGateUser = s =>
  ['admin', 'security', 'viewer'].includes(selectRole(s));
export const selectIsEmployee = s => selectRole(s) === 'host';
/** Can receive post: employees, or any user flagged `isHost`. */
export const selectIsRecipient = s =>
  selectRole(s) === 'host' || !!s.auth.user?.isHost;

/**
 * Module access (docs/API.md "Module access"): admins have every module; others what is ticked for them. A user
 * from a server without modules (no `modules`) keeps everything.
 * @param {{ role?: string, modules?: string[] } | null | undefined} u
 * @param {'track' | 'visitors' | 'expected' | 'post'} key
 */
export const userHasModule = (u, key) =>
  !!u &&
  (u.role === 'admin' || !Array.isArray(u.modules) || u.modules.includes(key));
/** @param {'track' | 'visitors' | 'expected' | 'post'} key */
export const selectHasModule = key => s => userHasModule(s.auth.user, key);

export const ROLE_LABELS = {
  admin: 'Admin',
  security: 'Security',
  viewer: 'Viewer',
  host: 'Employee',
};
