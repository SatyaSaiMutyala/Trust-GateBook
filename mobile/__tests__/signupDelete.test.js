/* global Response */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Provider } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { makeStore } from '../src/store';
import { loggedIn } from '../src/store/authSlice';
import { LoginScreen } from '../src/auth/LoginScreen';
import {
  CreateAccountScreen,
  validateSignup,
} from '../src/auth/CreateAccountScreen';
import { DeleteAccount } from '../src/auth/DeleteAccount';
import { PendingRequests } from '../src/screens/account/PendingRequests';
import { NotificationsScreen } from '../src/screens/NotificationsScreen';
import { pushOpened, routePendingOpen } from '../src/push/push';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({
    navigate: jest.fn(),
    setOptions: jest.fn(),
    setParams: jest.fn(),
  }),
}));

const reply = (status, body) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
const page = data => ({
  data,
  pagination: {
    page: 1,
    limit: 20,
    total: data.length,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  },
});

let features = { signup: true, accountDeletion: true };
let routes = {};
let calls = [];
function installFetch() {
  calls = [];
  global.fetch = jest.fn(async req => {
    const url = new URL(req.url);
    const text = req.method === 'GET' ? '' : await req.text();
    calls.push({
      method: req.method,
      path: url.pathname,
      params: url.searchParams,
      body: text ? JSON.parse(text) : null,
    });
    if (url.pathname === '/api/config') return reply(200, { features });
    const handler = routes[`${req.method} ${url.pathname}`];
    if (handler) return handler(url);
    if (url.pathname === '/api/notifications/unread-count')
      return reply(200, { count: 0 });
    return reply(200, page([]));
  });
}

beforeEach(() => {
  features = { signup: true, accountDeletion: true };
  routes = {};
  installFetch();
});
afterEach(() => {
  global.fetch = undefined;
});

const flush = () =>
  ReactTestRenderer.act(async () => {
    await new Promise(r => setImmediate(r));
  });

async function render(store, element) {
  let tree;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <Provider store={store}>
        <SafeAreaProvider>{element}</SafeAreaProvider>
      </Provider>,
    );
  });
  await flush();
  await flush();
  return tree;
}
const texts = tree =>
  tree.root
    .findAll(n => typeof n.props.children === 'string')
    .map(n => n.props.children);
const byLabel = (tree, label) =>
  tree.root.findAll(
    n =>
      n.props.accessibilityLabel === label &&
      typeof n.props.onPress === 'function',
  )[0];
const input = (tree, label) =>
  tree.root.findAll(
    n =>
      n.props.accessibilityLabel === label &&
      typeof n.props.onChangeText === 'function',
  )[0];
async function type(tree, label, value) {
  await ReactTestRenderer.act(async () =>
    input(tree, label).props.onChangeText(value),
  );
}
async function press(tree, label) {
  await ReactTestRenderer.act(async () => byLabel(tree, label).props.onPress());
  await flush();
}
function signedIn(role = 'admin') {
  const store = makeStore();
  store.dispatch(
    loggedIn({ token: 'jwt', user: { id: 'me', name: 'Admin', role } }),
  );
  return store;
}

describe('feature switches', () => {
  test('Login shows "Create an account" only when signup is on', async () => {
    const nav = { navigate: jest.fn() };
    let tree = await render(makeStore(), <LoginScreen navigation={nav} />);
    expect(
      tree.root.findAllByProps({ testID: 'create-account-link' }).length,
    ).toBeGreaterThan(0);
    await press(tree, 'New here? Create an account');
    expect(nav.navigate).toHaveBeenCalledWith('CreateAccount');
    await ReactTestRenderer.act(async () => tree.unmount());

    features = { signup: false, accountDeletion: false };
    tree = await render(makeStore(), <LoginScreen navigation={nav} />);
    expect(
      tree.root.findAllByProps({ testID: 'create-account-link' }),
    ).toHaveLength(0);
    await ReactTestRenderer.act(async () => tree.unmount());
  });

  test('Delete account button follows the accountDeletion switch', async () => {
    let tree = await render(signedIn('host'), <DeleteAccount />);
    expect(byLabel(tree, 'Delete my account')).toBeTruthy();
    await ReactTestRenderer.act(async () => tree.unmount());
    features = { signup: false, accountDeletion: false };
    tree = await render(signedIn('host'), <DeleteAccount />);
    expect(byLabel(tree, 'Delete my account')).toBeUndefined();
    await ReactTestRenderer.act(async () => tree.unmount());
  });

  test('a pending account sees the server message on Login', async () => {
    routes['POST /api/auth/login'] = () =>
      reply(403, {
        error: {
          code: 'forbidden',
          message: 'Your account is waiting for admin approval.',
        },
      });
    const tree = await render(
      makeStore(),
      <LoginScreen navigation={{ navigate: jest.fn() }} />,
    );
    await type(tree, 'Email', 'new@x.in');
    await type(tree, 'Password', 'secret123');
    await press(tree, 'Sign in');
    expect(texts(tree)).toContain(
      'Your account is waiting for admin approval.',
    );
  });
});

describe('create account', () => {
  async function fill(tree) {
    await type(tree, 'Full name', 'Priya Nair');
    await type(tree, 'Email', 'priya@acme.in');
    await type(tree, 'Mobile number', '9876543210');
    await type(tree, 'Password', 'longpass1');
    await type(tree, 'Confirm password', 'longpass1');
  }

  test('client validation', () => {
    const e = validateSignup({
      name: '',
      email: 'bad',
      phone: '12',
      dept: '',
      password: 'short',
      confirm: 'x',
    });
    expect(Object.keys(e).sort()).toEqual([
      'confirm',
      'email',
      'name',
      'password',
      'phone',
    ]);
    expect(
      validateSignup({
        name: 'A',
        email: 'a@b.in',
        phone: '9876543210',
        dept: '',
        password: '12345678',
        confirm: '12345678',
      }),
    ).toEqual({});
  });

  test('success → "Account requested" dialog → back to Login with the email', async () => {
    routes['POST /api/auth/signup'] = () =>
      reply(201, {
        message:
          "Account requested. An admin will approve it — you can sign in once it's approved.",
      });
    const nav = { navigate: jest.fn(), goBack: jest.fn() };
    const tree = await render(
      makeStore(),
      <CreateAccountScreen navigation={nav} />,
    );
    await fill(tree);
    await press(tree, 'Create account');
    const sent = calls.find(c => c.path === '/api/auth/signup');
    expect(sent.body).toEqual({
      name: 'Priya Nair',
      email: 'priya@acme.in',
      phone: '9876543210',
      password: 'longpass1',
    });
    expect(texts(tree)).toEqual(
      expect.arrayContaining([
        'Account requested',
        "Account requested. An admin will approve it — you can sign in once it's approved.",
      ]),
    );
    await press(tree, 'OK');
    expect(nav.navigate).toHaveBeenCalledWith('Login', {
      email: 'priya@acme.in',
    });
  });

  test('409 shows under Email; 429 shows as a form error', async () => {
    routes['POST /api/auth/signup'] = () =>
      reply(409, {
        error: {
          code: 'conflict',
          message: 'An account with this email already exists.',
        },
      });
    const tree = await render(
      makeStore(),
      <CreateAccountScreen
        navigation={{ navigate: jest.fn(), goBack: jest.fn() }}
      />,
    );
    await fill(tree);
    await press(tree, 'Create account');
    expect(texts(tree)).toContain('An account with this email already exists.');

    routes['POST /api/auth/signup'] = () =>
      reply(429, {
        error: {
          code: 'rate_limited',
          message: 'Too many sign-ups from this network. Try again later.',
        },
      });
    await press(tree, 'Create account');
    expect(texts(tree)).toContain(
      'Too many sign-ups from this network. Try again later.',
    );
  });
});

describe('delete account', () => {
  test('wrong password stays in the dialog (no sign-out); success signs out without DELETE /api/devices', async () => {
    const store = signedIn('host');
    let status = 401;
    routes['DELETE /api/auth/me'] = () =>
      status === 401
        ? reply(401, {
            error: { code: 'unauthorized', message: 'Wrong password.' },
          })
        : reply(200, { ok: true });
    const tree = await render(store, <DeleteAccount />);
    await press(tree, 'Delete my account');
    expect(texts(tree)).toContain('Delete your account?');
    await type(tree, 'Password', 'nope');
    await press(tree, 'Delete account');
    expect(texts(tree)).toContain('Wrong password.');
    expect(store.getState().auth.token).toBe('jwt');
    expect(
      calls.find(c => c.method === 'DELETE' && c.path === '/api/auth/me').body,
    ).toEqual({ password: 'nope' });

    status = 200;
    await type(tree, 'Password', 'right-one');
    await press(tree, 'Delete account');
    await flush();
    expect(store.getState().auth.token).toBeNull();
    expect(store.getState().ui.toast.message).toBe(
      'Your account has been deleted.',
    );
    expect(calls.some(c => c.path.startsWith('/api/devices'))).toBe(false);
  });
});

describe('admin pending requests', () => {
  test('Approve sends the role (default Employee); Reject asks first', async () => {
    const pending = {
      id: 'u9',
      name: 'Priya Nair',
      email: 'priya@acme.in',
      phone: '9876543210',
      dept: 'Accounts',
      role: 'host',
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    routes['GET /api/users'] = url =>
      reply(
        200,
        page(url.searchParams.get('status') === 'pending' ? [pending] : []),
      );
    routes['POST /api/users/u9/approve'] = () =>
      reply(200, { user: { ...pending, status: 'active', active: true } });
    routes['POST /api/users/u9/reject'] = () => reply(200, { ok: true });
    const tree = await render(signedIn('admin'), <PendingRequests />);
    expect(texts(tree)).toEqual(
      expect.arrayContaining([
        'Pending requests (1)',
        'Priya Nair',
        'priya@acme.in',
      ]),
    );
    expect(calls.find(c => c.path === '/api/users').params.get('status')).toBe(
      'pending',
    );

    await press(tree, 'Approve Priya Nair');
    expect(calls.find(c => c.path === '/api/users/u9/approve').body).toEqual({
      role: 'host',
    });

    await press(tree, 'Reject Priya Nair');
    expect(texts(tree)).toContain('Reject request?');
    expect(calls.some(c => c.path === '/api/users/u9/reject')).toBe(false);
    await press(tree, 'Reject');
    expect(
      calls.some(c => c.method === 'POST' && c.path === '/api/users/u9/reject'),
    ).toBe(true);
  });
});

describe('signup_request notifications', () => {
  test('tapping the 🙋 row opens Account → Pending; a push does the same and marks it read', async () => {
    routes['GET /api/notifications'] = () =>
      reply(200, {
        ...page([
          {
            id: 'n5',
            event: 'signup_request',
            title: '🙋 New account request',
            body: 'Priya Nair · priya@acme.in',
            data: { type: 'user', id: 'u9' },
            readAt: null,
            createdAt: new Date().toISOString(),
          },
        ]),
        unreadCount: 1,
      });
    const navigation = { navigate: jest.fn(), setOptions: jest.fn() };
    const tree = await render(
      signedIn('admin'),
      <NotificationsScreen navigation={navigation} />,
    );
    expect(texts(tree)).toContain('🙋');
    await ReactTestRenderer.act(async () =>
      tree.root.findByProps({ testID: 'notification-n5' }).props.onPress(),
    );
    expect(navigation.navigate).toHaveBeenCalledWith('Main', {
      screen: 'Account',
      params: { section: 'pending' },
    });
    expect(calls.some(c => c.path === '/api/notifications/n5/read')).toBe(true);

    const store = signedIn('admin');
    store.dispatch(
      pushOpened({ data: { type: 'user', id: 'u9', notificationId: 'n6' } }),
    );
    const nav = { isReady: () => true, navigate: jest.fn() };
    expect(store.dispatch(routePendingOpen(nav))).toBe(true);
    expect(nav.navigate).toHaveBeenCalledWith('Main', {
      screen: 'Account',
      params: { section: 'pending' },
    });
    await new Promise(r => setImmediate(r));
    expect(calls.some(c => c.path === '/api/notifications/n6/read')).toBe(true);
  });
});
