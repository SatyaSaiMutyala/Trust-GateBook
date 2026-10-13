/* global Response */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Provider } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { makeStore } from '../src/store';
import { loggedIn } from '../src/store/authSlice';
import { AccountScreen } from '../src/screens/AccountScreen';

const mockSetOptions = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ setOptions: mockSetOptions, navigate: jest.fn() }),
}));

const json = body =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );

beforeEach(() => {
  mockSetOptions.mockClear();
  global.fetch = jest.fn(req => {
    const url = typeof req === 'string' ? req : req.url;
    if (url.includes('/api/settings')) return json({ settings: {} });
    return json({
      data: [],
      pagination: {
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPrevPage: false,
      },
    });
  });
});

async function renderAs(user) {
  const store = makeStore();
  store.dispatch(loggedIn({ token: 't', user }));
  let tree;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <Provider store={store}>
        <SafeAreaProvider>
          <AccountScreen />
        </SafeAreaProvider>
      </Provider>,
    );
  });
  const texts = tree.root
    .findAll(n => typeof n.props.children === 'string')
    .map(n => n.props.children);
  await ReactTestRenderer.act(async () => tree.unmount());
  return texts;
}

test('a watchman sees a profile: name, role, own details and sign out — no admin settings', async () => {
  const texts = await renderAs({
    id: 'u1',
    name: 'Suresh Reddy',
    email: 'security@gatebook.local',
    role: 'security',
    phone: '9876500009',
    createdAt: '2026-10-12T05:00:00.000Z',
  });
  expect(texts).toEqual(
    expect.arrayContaining([
      'SR',
      'Suresh Reddy',
      'security@gatebook.local',
      'Details',
      'Mobile',
      '9876500009',
      'Gate',
      'Main entrance',
      'Sign out',
    ]),
  );
  for (const adminOnly of ['Departments', 'Purposes', 'Types of post', 'Users'])
    expect(texts).not.toContain(adminOnly);
  expect(mockSetOptions).toHaveBeenCalledWith({ headerSubtitle: undefined });
});

test('an admin still gets the settings screen', async () => {
  const texts = await renderAs({
    id: 'a1',
    name: 'Administrator',
    email: 'admin@gatebook.local',
    role: 'admin',
  });
  expect(texts).toEqual(
    expect.arrayContaining([
      'Departments',
      'Purposes',
      'Types of post',
      'Users',
    ]),
  );
});
