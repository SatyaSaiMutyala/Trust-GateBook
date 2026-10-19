import { PermissionsAndroid, Platform } from 'react-native';
import { stripEmoji } from '../utils/format';
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
import { claimNotice, routeNoticeKey } from './dedupe';
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
export const unregisterPush =
  ({ skipServer = false } = {}) =>
  async (dispatch, getState) => {
    const token = getState().push.token;
    try {
      if (!skipServer && token && getState().auth.token) {
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
export const signOut =
  ({ skipServer = false } = {}) =>
  async dispatch => {
    await dispatch(unregisterPush({ skipServer }));
    dispatch(loggedOut());
  };

/**
 * After DELETE /api/auth/me succeeded: the server already removed this account's devices, so only the
 * local FCM token is dropped (no DELETE /api/devices), then the session is cleared.
 */
export const signOutDeletedAccount = () => signOut({ skipServer: true });

/** Routing data from an FCM message (`data: { type, id }`), or null. */
export function routeOf(message) {
  const data = message?.data;
  if (
    !data ||
    !data.id ||
    ![
      'mail',
      'user',
      'visit',
      'expected',
      'material',
      'incident',
      'key',
      'patrol',
      'gen',
    ].includes(data.type)
  )
    return null;
  const route = { type: data.type, id: String(data.id) };
  if (data.notificationId) route.notificationId = String(data.notificationId);
  return route;
}

/** Opens the Expected list searched for `code`. */
export function openExpected(navigation, gate, code) {
  if (gate) navigation.navigate('Expected', { q: code });
  else navigation.navigate('Main', { screen: 'Expected', params: { q: code } });
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
    ? routeNoticeKey(route)
    : `push:${message?.messageId ?? Date.now()}`;
  if (!claimNotice(key)) return;
  const title = message?.notification?.title;
  const body = message?.notification?.body;
  // In-app toast uses the app font, which has no emoji glyphs: drop them (the OS notification keeps them).
  const text = stripEmoji([title, body].filter(Boolean).join(' · '));
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
  if (pending.type === 'user') {
    // 🙋 sign-up request (admins): Account → Pending requests.
    navigation.navigate('Main', {
      screen: 'Account',
      params: { section: 'pending' },
    });
    if (pending.notificationId) {
      dispatch(
        api.endpoints.markNotificationRead.initiate(pending.notificationId),
      );
    }
    return true;
  }
  if (pending.type === 'visit') {
    // 🚪 / ✅ / ⏰ host approval: gate users land on Inside now → visit; hosts on My visitors → visit.
    const gate = selectIsGateUser(state);
    navigation.navigate('Main', { screen: gate ? 'Inside' : 'MyVisitors' });
    navigation.navigate('VisitDetails', { id: pending.id });
    if (pending.notificationId) {
      dispatch(
        api.endpoints.markNotificationRead.initiate(pending.notificationId),
      );
    }
    return true;
  }
  if (pending.type === 'material') {
    // 📦 gate pass: open it (gate: from Material passes; employees: from Gate passes).
    navigation.navigate('MaterialDetails', { id: pending.id });
    if (pending.notificationId) {
      dispatch(
        api.endpoints.markNotificationRead.initiate(pending.notificationId),
      );
    }
    return true;
  }
  if (pending.type === 'patrol' || pending.type === 'gen') {
    // 🛡️ late / missed round, ⛽ diesel: the Patrols / Generator screen (gate users).
    navigation.navigate(pending.type === 'patrol' ? 'Patrol' : 'Generator');
    if (pending.notificationId) {
      dispatch(
        api.endpoints.markNotificationRead.initiate(pending.notificationId),
      );
    }
    return true;
  }
  if (pending.type === 'incident' || pending.type === 'key') {
    // ⚠️ incident: open it. 🔑 key: gate users see the key board; others just the inbox.
    if (pending.type === 'incident') {
      navigation.navigate('IncidentDetails', { id: pending.id });
    } else if (selectIsGateUser(state)) {
      navigation.navigate('Keys');
    } else {
      navigation.navigate('Notifications');
    }
    if (pending.notificationId) {
      dispatch(
        api.endpoints.markNotificationRead.initiate(pending.notificationId),
      );
    }
    return true;
  }
  if (pending.type === 'expected') {
    // 📅 pre-registration: the Expected list searched for its code (gate: a stack screen; employees: a tab).
    openExpected(navigation, selectIsGateUser(state), pending.id);
    if (pending.notificationId) {
      dispatch(
        api.endpoints.markNotificationRead.initiate(pending.notificationId),
      );
    }
    return true;
  }
  const list = selectIsGateUser(state) ? 'Post' : 'MyPost';
  navigation.navigate('Main', { screen: list });
  navigation.navigate('MailDetails', { id: pending.id });
  // Opening a push marks its stored inbox notification read (optimistic; best-effort).
  if (pending.notificationId) {
    dispatch(
      api.endpoints.markNotificationRead.initiate(pending.notificationId),
    );
  }
  return true;
};
