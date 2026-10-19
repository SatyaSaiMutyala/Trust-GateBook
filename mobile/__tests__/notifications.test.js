/* global Response */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Provider } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { makeStore } from '../src/store';
import { api } from '../src/store/api';
import { loggedIn } from '../src/store/authSlice';
import {
  NotificationBell,
  badgeLabel,
} from '../src/components/NotificationBell';
import { NotificationsScreen } from '../src/screens/NotificationsScreen';
import {
  notificationNewEvent,
  notificationReadEvent,
} from '../src/realtime/events';
import { pushOpened, routePendingOpen } from '../src/push/push';
import { resetNotices } from '../src/push/dedupe';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate, setOptions: jest.fn() }),
}));

const json = body =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );

const NOTES = [
  {
    id: 'n1',
    event: 'mail_logged',
    title: '📬 Courier for you',
    body: 'From Transasia · collect it at the gate',
    data: { type: 'mail', id: 'ML-1' },
    readAt: null,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'n2',
    event: 'mail_reminder',
    title: '⏰ Reminder: Letter waiting',
    body: 'From HDFC · still at the gate',
    data: { type: 'mail', id: 'ML-2' },
    readAt: '2026-10-13T10:00:00.000Z',
    createdAt: '2026-10-13T09:00:00.000Z',
  },
];

let unread = 1;
let calls = [];
function installFetch() {
  calls = [];
  global.fetch = jest.fn(req => {
    const url = new URL(req.url);
    calls.push({
      method: req.method,
      path: url.pathname,
      params: url.searchParams,
    });
    if (url.pathname === '/api/notifications/unread-count')
      return json({ count: unread });
    if (url.pathname === '/api/notifications/read-all') {
      unread = 0;
      return json({ updated: 1, unreadCount: 0 });
    }
    const m = url.pathname.match(/^\/api\/notifications\/([^/]+)\/read$/);
    if (m) {
      unread = Math.max(0, unread - 1);
      return json({
        notification: { id: m[1], readAt: new Date().toISOString() },
        unreadCount: unread,
      });
    }
    if (url.pathname === '/api/notifications') {
      const onlyUnread = url.searchParams.get('unread') === 'true';
      const data = onlyUnread ? NOTES.filter(n => !n.readAt) : NOTES;
      return json({
        data,
        unreadCount: unread,
        pagination: {
          page: 1,
          limit: 20,
          total: data.length,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: false,
        },
      });
    }
    return json({ ok: true });
  });
}

function signedInStore(role = 'host') {
  const store = makeStore();
  store.dispatch(
    loggedIn({ token: 'jwt', user: { id: 'u1', name: 'Priya', role } }),
  );
  return store;
}

async function render(store, element) {
  let tree;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <Provider store={store}>
        <SafeAreaProvider>{element}</SafeAreaProvider>
      </Provider>,
    );
  });
  await ReactTestRenderer.act(async () => {
    await new Promise(r => setImmediate(r));
  });
  return tree;
}

const texts = tree =>
  tree.root
    .findAll(n => typeof n.props.children === 'string')
    .map(n => n.props.children);

beforeEach(() => {
  unread = 1;
  mockNavigate.mockClear();
  resetNotices();
  installFetch();
});

afterEach(() => {
  global.fetch = undefined;
});

test('bell shows the unread count with a 99+ cap and opens Notifications', async () => {
  expect(badgeLabel(7)).toBe('7');
  expect(badgeLabel(120)).toBe('99+');
  unread = 120;
  const store = signedInStore();
  const tree = await render(store, <NotificationBell />);
  expect(texts(tree)).toContain('99+');
  const bell = tree.root.findByProps({ testID: 'notification-bell' });
  expect(bell.props.accessibilityLabel).toBe('Notifications, 120 unread');
  await ReactTestRenderer.act(async () => bell.props.onPress());
  expect(mockNavigate).toHaveBeenCalledWith('Notifications');
  await ReactTestRenderer.act(async () => tree.unmount());
});

test('list renders rows; Unread tab requests unread=true; header gets "Mark all read"', async () => {
  const store = signedInStore();
  const navigation = { navigate: mockNavigate, setOptions: jest.fn() };
  const tree = await render(
    store,
    <NotificationsScreen navigation={navigation} />,
  );
  expect(texts(tree)).toEqual(
    expect.arrayContaining([
      // Emoji stripped (the app font has none); the icon is drawn per event instead.
      'Courier for you',
      'Reminder: Letter waiting',
      'All',
      'Unread',
    ]),
  );
  const lastOptions = navigation.setOptions.mock.calls.at(-1)[0];
  expect(lastOptions.headerActions).not.toBeNull(); // unread > 0 → Mark all read

  const unreadTab = tree.root.findAll(
    n =>
      n.props.accessibilityRole === 'tab' &&
      n.props.accessibilityLabel === 'Unread, 1',
  )[0];
  await ReactTestRenderer.act(async () => unreadTab.props.onPress());
  await ReactTestRenderer.act(async () => {
    await new Promise(r => setImmediate(r));
  });
  expect(
    calls.some(
      c => c.path === '/api/notifications' && c.params.get('unread') === 'true',
    ),
  ).toBe(true);
  expect(texts(tree)).not.toContain('Reminder: Letter waiting');
  await ReactTestRenderer.act(async () => tree.unmount());
});

test('tapping a row marks it read (optimistic badge) and opens MailDetails', async () => {
  const store = signedInStore();
  const navigation = { navigate: mockNavigate, setOptions: jest.fn() };
  const tree = await render(
    store,
    <NotificationsScreen navigation={navigation} />,
  );
  expect(api.endpoints.unreadCount.select()(store.getState()).data).toBe(1);
  const row = tree.root.findByProps({ testID: 'notification-n1' });
  await ReactTestRenderer.act(async () => row.props.onPress());
  expect(mockNavigate).toHaveBeenCalledWith('MailDetails', { id: 'ML-1' });
  expect(
    calls.some(
      c => c.method === 'POST' && c.path === '/api/notifications/n1/read',
    ),
  ).toBe(true);
  await ReactTestRenderer.act(async () => {
    await new Promise(r => setImmediate(r));
  });
  expect(api.endpoints.unreadCount.select()(store.getState()).data).toBe(0);
  await ReactTestRenderer.act(async () => tree.unmount());
});

test('mark all read marks every cached row read and zeroes the badge', async () => {
  const store = signedInStore();
  const arg = {};
  const sub = store.dispatch(api.endpoints.listNotifications.initiate(arg));
  await sub;
  await store.dispatch(api.endpoints.unreadCount.initiate());
  await store.dispatch(api.endpoints.markAllNotificationsRead.initiate());
  expect(
    calls.some(
      c => c.method === 'POST' && c.path === '/api/notifications/read-all',
    ),
  ).toBe(true);
  const pages = api.endpoints.listNotifications.select(arg)(store.getState())
    .data.pages;
  expect(pages[0].data.every(n => n.readAt)).toBe(true);
  expect(api.endpoints.unreadCount.select()(store.getState()).data).toBe(0);
  sub.unsubscribe();
});

test('socket notification:new bumps the badge and toasts once per post item; notification:read syncs it', async () => {
  const store = signedInStore();
  await store.dispatch(api.endpoints.unreadCount.initiate()); // the bell's subscription
  const notification = { ...NOTES[0], id: 'n7' };
  store.dispatch(notificationNewEvent({ notification, unreadCount: 4 }));
  expect(api.endpoints.unreadCount.select()(store.getState()).data).toBe(4);
  const first = store.getState().ui.toast;
  expect(first.message).toBe(
    'Courier for you · From Transasia · collect it at the gate',
  );
  store.dispatch(
    notificationNewEvent({
      notification: { ...notification, id: 'n8' },
      unreadCount: 5,
    }),
  );
  expect(store.getState().ui.toast.id).toBe(first.id); // same mail id within 5 s → no second toast
  expect(api.endpoints.unreadCount.select()(store.getState()).data).toBe(5);
  store.dispatch(notificationReadEvent({ ids: 'all', unreadCount: 0 }));
  expect(api.endpoints.unreadCount.select()(store.getState()).data).toBe(0);
});

test('opening a push with notificationId marks that notification read', async () => {
  const store = signedInStore('security');
  store.dispatch(
    pushOpened({ data: { type: 'mail', id: 'ML-1', notificationId: 'n9' } }),
  );
  const nav = { isReady: () => true, navigate: jest.fn() };
  expect(store.dispatch(routePendingOpen(nav))).toBe(true);
  expect(nav.navigate).toHaveBeenLastCalledWith('MailDetails', { id: 'ML-1' });
  await new Promise(r => setImmediate(r));
  expect(
    calls.some(
      c => c.method === 'POST' && c.path === '/api/notifications/n9/read',
    ),
  ).toBe(true);
});
