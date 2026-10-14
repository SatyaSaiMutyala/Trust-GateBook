import { PermissionsAndroid, Platform } from 'react-native';
import { api } from '../store/api';
import { loggedOut, selectIsGateUser } from '../store/authSlice';
import {
  deviceRegistered,
  deviceUnregistered,
  notificationOpened,
  pendingOpenHandled,
  permissionResolved,
} from '../store/pushSlice';
import { toastShown } from '../store/uiSlice';
import { claimNotice, mailNoticeKey } from './dedupe';
import { fcm } from './messaging';

const platform = () => (Platform.OS === 'ios' ? 'ios' : 'android');

/** Ask for permission to show notifications. Android < 13 needs no runtime prompt. */
export async function requestNotificationPermission() {
  if (Platform.OS === 'ios') return fcm.requestIosPermission();
  if (Platform.OS === 'android' && Platform.Version >= 33) {
    const res = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    return res === PermissionsAndroid.RESULTS.GRANTED;
  }
  return true;
}

/** Sends `token` to POST /api/devices and remembers it. */
export const registerToken = token => async dispatch => {
  if (!token) return false;
  const res = await dispatch(
    api.endpoints.registerDevice.initiate({ token, platform: platform() }),
  );
  if (res.error) return false;
  dispatch(deviceRegistered(token));
  return true;
};

/**
 * After sign-in: ask permission, get the FCM token and register it. Never throws — a missing Firebase
 * config, a denied prompt or an offline backend must not break the app.
 */
export const registerPush = () => async (dispatch, getState) => {
  try {
    const granted = await requestNotificationPermission();
    dispatch(permissionResolved(granted ? 'granted' : 'denied'));
    if (!granted || !getState().auth.token) return false;
    const token = await fcm.getToken();
    if (!getState().auth.token) return false; // signed out meanwhile
    return await dispatch(registerToken(token));
  } catch {
    return false;
  }
};

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise(resolve => setTimeout(resolve, ms)),
  ]);
}

/**
 * Before the auth token is cleared: DELETE /api/devices/:token, then drop the local FCM token.
 * Best-effort with a short timeout so sign-out never hangs offline.
 */
export const unregisterPush = () => async (dispatch, getState) => {
  const token = getState().push.token;
  try {
    if (token && getState().auth.token) {
      await withTimeout(
        dispatch(api.endpoints.unregisterDevice.initiate(token)),
        4000,
      );
    }
  } catch {
    // best-effort
  }
  try {
    if (token) await withTimeout(fcm.deleteToken(), 4000);
  } catch {
    // best-effort
  }
  dispatch(deviceUnregistered());
};

/** User-initiated sign-out: unregister this device for push first, then clear the session. */
export const signOut = () => async dispatch => {
  await dispatch(unregisterPush());
  dispatch(loggedOut());
};

/** Routing data from an FCM message (`data: { type, id }`), or null. */
export function routeOf(message) {
  const data = message?.data;
  if (!data || data.type !== 'mail' || !data.id) return null;
  return { type: 'mail', id: String(data.id) };
}

/** A notification was tapped (app in background or cold start). */
export const pushOpened = message => dispatch => {
  const route = routeOf(message);
  if (route) dispatch(notificationOpened(route));
};

/** Foreground message: in-app toast unless the socket already announced the same item. */
export const foregroundMessage = message => dispatch => {
  const route = routeOf(message);
  const key = route
    ? mailNoticeKey(route.id)
    : `push:${message?.messageId ?? Date.now()}`;
  if (!claimNotice(key)) return;
  const title = message?.notification?.title;
  const body = message?.notification?.body;
  const text = [title, body].filter(Boolean).join(' · ');
  if (text) dispatch(toastShown(text));
};

/**
 * Navigates for a pending tap. Gate users land on Post room → item; employees on My post → item,
 * so Back returns to the list. Returns true when handled.
 */
export const routePendingOpen = navigation => (dispatch, getState) => {
  const state = getState();
  const pending = state.push.pendingOpen;
  if (!pending || !state.auth.token || !navigation?.isReady?.()) return false;
  dispatch(pendingOpenHandled());
  const list = selectIsGateUser(state) ? 'Post' : 'MyPost';
  navigation.navigate('Main', { screen: list });
  navigation.navigate('MailDetails', { id: pending.id });
  return true;
};
