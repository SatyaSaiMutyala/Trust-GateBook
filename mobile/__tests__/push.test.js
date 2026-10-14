/* global Response */
import { PermissionsAndroid, Platform } from 'react-native';
import * as messaging from '@react-native-firebase/messaging';
import { makeStore } from '../src/store';
import { loggedIn } from '../src/store/authSlice';
import { toastShown } from '../src/store/uiSlice';
import { claimNotice, mailNoticeKey, resetNotices } from '../src/push/dedupe';
import {
  foregroundMessage,
  pushOpened,
  registerPush,
  routePendingOpen,
  signOut,
} from '../src/push/push';
import { mailEvent } from '../src/realtime/events';

jest.useFakeTimers();

const json = (status, body) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );

function signedInStore(role = 'security') {
  const store = makeStore();
  store.dispatch(
    loggedIn({ token: 'jwt', user: { id: 'u1', name: 'Ravi', role } }),
  );
  return store;
}

beforeEach(() => {
  resetNotices();
  jest.clearAllMocks();
  global.fetch = jest.fn(() => json(200, { ok: true }));
});

afterEach(() => {
  global.fetch = undefined;
  jest.clearAllTimers();
});

test('after login: asks permission, gets the FCM token and POSTs it to /api/devices', async () => {
  Platform.OS = 'ios';
  const store = signedInStore();
  const ok = await store.dispatch(registerPush());
  expect(ok).toBe(true);
  expect(messaging.requestPermission).toHaveBeenCalled();
  const req = global.fetch.mock.calls[0][0];
  expect(new URL(req.url).pathname).toBe('/api/devices');
  expect(req.method).toBe('POST');
  expect(req.headers.get('Authorization')).toBe('Bearer jwt');
  expect(JSON.parse(await req.text())).toEqual({
    token: 'fcm-token-1',
    platform: 'ios',
  });
  expect(store.getState().push).toMatchObject({
    permission: 'granted',
    token: 'fcm-token-1',
  });
});

test('Android 13 denied permission: no token, no request, hint state set, no crash', async () => {
  Platform.OS = 'android';
  const oldVersion = Platform.Version;
  Object.defineProperty(Platform, 'Version', {
    get: () => 34,
    configurable: true,
  });
  const spy = jest
    .spyOn(PermissionsAndroid, 'request')
    .mockResolvedValue(PermissionsAndroid.RESULTS.DENIED);
  const store = signedInStore();
  expect(await store.dispatch(registerPush())).toBe(false);
  expect(spy).toHaveBeenCalledWith(
    PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
  );
  expect(messaging.getToken).not.toHaveBeenCalled();
  expect(global.fetch).not.toHaveBeenCalled();
  expect(store.getState().push.permission).toBe('denied');
  spy.mockRestore();
  Object.defineProperty(Platform, 'Version', {
    get: () => oldVersion,
    configurable: true,
  });
  Platform.OS = 'ios';
});

test('sign-out: DELETE /api/devices/:token with the auth token, then deleteToken, then logout', async () => {
  Platform.OS = 'ios';
  const store = signedInStore();
  await store.dispatch(registerPush());
  global.fetch.mockClear();
  await store.dispatch(signOut());
  const req = global.fetch.mock.calls[0][0];
  expect(req.method).toBe('DELETE');
  expect(new URL(req.url).pathname).toBe('/api/devices/fcm-token-1');
  expect(req.headers.get('Authorization')).toBe('Bearer jwt'); // still signed in when unregistering
  expect(messaging.deleteToken).toHaveBeenCalled();
  expect(store.getState().auth.token).toBeNull();
  expect(store.getState().push.token).toBeNull();
});

test('tapping a mail notification navigates to the item once signed in and ready', async () => {
  const store = signedInStore('security');
  store.dispatch(pushOpened({ data: { type: 'mail', id: 'ML-261014-ABCD' } }));
  const nav = { isReady: jest.fn(() => true), navigate: jest.fn() };
  expect(store.dispatch(routePendingOpen(nav))).toBe(true);
  expect(nav.navigate).toHaveBeenNthCalledWith(1, 'Main', { screen: 'Post' });
  expect(nav.navigate).toHaveBeenNthCalledWith(2, 'MailDetails', {
    id: 'ML-261014-ABCD',
  });
  expect(store.getState().push.pendingOpen).toBeNull();

  const emp = signedInStore('host');
  emp.dispatch(pushOpened({ data: { type: 'mail', id: 'ML-2' } }));
  const notReady = { isReady: () => false, navigate: jest.fn() };
  expect(emp.dispatch(routePendingOpen(notReady))).toBe(false); // waits for the navigator
  expect(emp.getState().push.pendingOpen).toEqual({ type: 'mail', id: 'ML-2' });
  const ready = { isReady: () => true, navigate: jest.fn() };
  emp.dispatch(routePendingOpen(ready));
  expect(ready.navigate).toHaveBeenNthCalledWith(1, 'Main', {
    screen: 'MyPost',
  });
  expect(ready.navigate).toHaveBeenNthCalledWith(2, 'MailDetails', {
    id: 'ML-2',
  });
});

test('a tap while signed out is kept until sign-in', () => {
  const store = makeStore();
  store.dispatch(pushOpened({ data: { type: 'mail', id: 'ML-9' } }));
  const nav = { isReady: () => true, navigate: jest.fn() };
  expect(store.dispatch(routePendingOpen(nav))).toBe(false);
  expect(nav.navigate).not.toHaveBeenCalled();
  expect(store.getState().push.pendingOpen).toEqual({
    type: 'mail',
    id: 'ML-9',
  });
});

test('foreground push and socket event for the same item toast only once within 5 s', () => {
  const store = signedInStore('host');
  const toasts = () => store.getState().ui.toast;
  const item = {
    id: 'ML-1',
    kind: 'Courier',
    sender: 'Transasia',
    recipient: { id: 'u1', name: 'Ravi' },
    recipientName: 'Ravi',
    status: 'lodged',
  };
  store.dispatch(mailEvent('created', item));
  const first = toasts();
  expect(first.message).toBe('Courier for you from Transasia');
  store.dispatch(
    foregroundMessage({
      data: { type: 'mail', id: 'ML-1' },
      notification: {
        title: '📬 Courier for you',
        body: 'From Transasia · collect it at the gate',
      },
    }),
  );
  expect(toasts().id).toBe(first.id); // no second toast

  // A different item still toasts, and after the window the same item may toast again.
  store.dispatch(toastShown('reset'));
  store.dispatch(
    foregroundMessage({
      data: { type: 'mail', id: 'ML-2' },
      notification: { title: 'Hi', body: 'There' },
    }),
  );
  expect(toasts().message).toBe('Hi · There');
  expect(claimNotice(mailNoticeKey('ML-1'), Date.now() + 6000)).toBe(true);
});
