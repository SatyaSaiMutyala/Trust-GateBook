/* global Response */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Provider } from 'react-redux';
import { makeStore } from '../src/store';
import { loggedIn } from '../src/store/authSlice';
import { MoreScreen } from '../src/screens/MoreScreen';

beforeEach(() => {
  global.fetch = jest.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify({ count: 3 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
});

async function render(user) {
  const store = makeStore();
  store.dispatch(loggedIn({ token: 't', user }));
  const navigation = { navigate: jest.fn(), setOptions: jest.fn() };
  let tree;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <Provider store={store}>
        <MoreScreen navigation={navigation} />
      </Provider>,
    );
  });
  const rows = tree.root.findAll(
    n => n.props.accessibilityRole === 'button' && n.props.onPress,
  );
  const labels = rows.map(r => r.props.accessibilityLabel.split(',')[0]);
  return { tree, rows, labels, navigation };
}

test('lists the modules the person has, plus Notifications and Account', async () => {
  const { tree, labels } = await render({
    id: 'u',
    name: 'Gate Guard',
    role: 'security',
    modules: ['visitors', 'keys', 'incidents'],
  });
  expect(labels).toEqual(
    expect.arrayContaining([
      'Visitor log',
      'Today at the gate',
      'Key register',
      'Incidents',
      'Notifications',
      'Account & settings',
    ]),
  );
  for (const hidden of ['Patrols', 'Generator & diesel', 'Material passes'])
    expect(labels).not.toContain(hidden);
  await ReactTestRenderer.act(async () => tree.unmount());
});

test('rows open their screens', async () => {
  const { tree, rows, navigation } = await render({
    id: 'u',
    name: 'Gate Guard',
    role: 'security',
    modules: ['visitors'],
  });
  const tap = async label =>
    ReactTestRenderer.act(async () =>
      rows
        .find(r => r.props.accessibilityLabel.startsWith(label))
        .props.onPress(),
    );
  await tap('Visitor log');
  await tap('Account & settings');
  await tap('Notifications');
  expect(navigation.navigate.mock.calls.map(c => c[0])).toEqual([
    'Log',
    'Account',
    'Notifications',
  ]);
  await ReactTestRenderer.act(async () => tree.unmount());
});

test('Sign out sits on the right of the app bar and asks first', async () => {
  const { tree, navigation } = await render({
    id: 'u',
    name: 'Gate Guard',
    role: 'security',
    modules: ['visitors'],
  });
  const { headerActions } = navigation.setOptions.mock.calls.at(-1)[0];
  expect(headerActions.props.title).toBe('Sign out');
  const dialog = () =>
    tree.root.findAll(
      n => n.props.title === 'Sign out?' && 'visible' in n.props,
    )[0];
  expect(dialog().props.visible).toBe(false);
  await ReactTestRenderer.act(async () => headerActions.props.onPress());
  expect(dialog().props.visible).toBe(true);
  await ReactTestRenderer.act(async () => tree.unmount());
});
