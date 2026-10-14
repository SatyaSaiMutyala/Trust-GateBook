import { createSlice } from '@reduxjs/toolkit';
import { loggedOut } from './authSlice';

/**
 * Push notification state.
 * - `permission`: 'unknown' | 'granted' | 'denied' (denied → hint in Account).
 * - `token`: the FCM token registered with the backend for the signed-in user (null when not registered).
 * - `pendingOpen`: a tapped notification's routing data `{ type, id }`, consumed once the user is signed in
 *   and the navigator is ready.
 * - `navReady`: NavigationContainer has finished mounting.
 */
const initialState = {
  permission: 'unknown',
  token: null,
  pendingOpen: null,
  navReady: false,
};

const pushSlice = createSlice({
  name: 'push',
  initialState,
  reducers: {
    permissionResolved(state, action) {
      state.permission = action.payload;
    },
    deviceRegistered(state, action) {
      state.token = action.payload;
    },
    deviceUnregistered(state) {
      state.token = null;
    },
    notificationOpened(state, action) {
      state.pendingOpen = action.payload;
    },
    pendingOpenHandled(state) {
      state.pendingOpen = null;
    },
    navigationReady(state, action) {
      state.navReady = action.payload !== false;
    },
  },
  extraReducers: builder => {
    builder.addCase(loggedOut, state => {
      state.token = null;
    });
  },
});

export const {
  permissionResolved,
  deviceRegistered,
  deviceUnregistered,
  notificationOpened,
  pendingOpenHandled,
  navigationReady,
} = pushSlice.actions;
export default pushSlice.reducer;

export const selectPushPermission = s => s.push.permission;
export const selectPushToken = s => s.push.token;
export const selectPendingOpen = s => s.push.pendingOpen;
export const selectNavReady = s => s.push.navReady;
