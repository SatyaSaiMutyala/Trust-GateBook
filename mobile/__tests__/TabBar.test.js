/* global Response */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { StyleSheet } from 'react-native';
import { Provider } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { makeStore } from '../src/store';
import { loggedIn } from '../src/store/authSlice';
import { TabBar } from '../src/components/TabBar';
import { light } from '../src/theme/tokens';

beforeEach(() => {
  global.fetch = jest.fn(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          data: [],
          pagination: {
            page: 1,
            limit: 1,
            total: 0,
            totalPages: 0,
            hasNextPage: false,
            hasPrevPage: false,
          },
          counts: { lodged: 0, handed: 0, disputed: 0 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    ),
  );
});

test('active tab: tinted pill + dark label; inactive tabs: lighter grey', async () => {
  const store = makeStore();
  store.dispatch(
    loggedIn({ token: 't', user: { id: 'u', name: 'G', role: 'security' } }),
  );
  const routes = ['Inside', 'Post', 'CheckIn', 'Log', 'Account'].map(name => ({
    key: name,
    name,
  }));
  const navigation = {
    emit: () => ({ defaultPrevented: false }),
    navigate: jest.fn(),
  };
  let tree;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <Provider store={store}>
        <SafeAreaProvider>
          <TabBar state={{ index: 1, routes }} navigation={navigation} />
        </SafeAreaProvider>
      </Provider>,
    );
  });
  const label = text => {
    const node = tree.root.find(
      n => n.type === 'Text' && n.props.children === text,
    );
    return StyleSheet.flatten(node.props.style);
  };
  expect(label('Post').color).toBe(light.ink);
  for (const t of ['Inside', 'Log', 'Account', 'Check in'])
    expect(label(t).color).toBe(light.faint);

  const tabs = tree.root.findAll(
    n => n.props.accessibilityRole === 'tab' && n.props.onPress,
  );
  const selected = tabs.filter(t => t.props.accessibilityState?.selected);
  expect(selected).toHaveLength(1);
  const pills = tree.root.findAll(
    n =>
      n.type === 'View' &&
      StyleSheet.flatten(n.props.style)?.backgroundColor === light.accentSoft,
  );
  expect(pills.length).toBeGreaterThanOrEqual(1);
  await ReactTestRenderer.act(async () => tree.unmount());
});

/** Render the bar for these routes with route `focus` open. */
async function renderBar(names, focus) {
  const store = makeStore();
  store.dispatch(
    loggedIn({ token: 't', user: { id: 'u', name: 'G', role: 'security' } }),
  );
  const routes = names.map(name => ({ key: name, name }));
  const navigation = {
    emit: () => ({ defaultPrevented: false }),
    navigate: jest.fn(),
  };
  let tree;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <Provider store={store}>
        <SafeAreaProvider>
          <TabBar
            state={{ index: names.indexOf(focus), routes }}
            navigation={navigation}
          />
        </SafeAreaProvider>
      </Provider>,
    );
  });
  const tabs = tree.root.findAll(
    n => n.props.accessibilityRole === 'tab' && n.props.onPress,
  );
  return { tree, tabs, navigation };
}

const GATE = ['Track', 'Inside', 'CheckIn', 'Post', 'More', 'Log', 'Account'];

test('with More: five tabs, Check in in the centre, Log and Account left off the bar', async () => {
  const { tree, tabs } = await renderBar(GATE, 'CheckIn');
  expect(tabs.map(t => t.props.accessibilityLabel)).toEqual([
    'Track',
    'Inside',
    'Check in a visitor',
    'Post',
    'More',
  ]);
  await ReactTestRenderer.act(async () => tree.unmount());
});

test('More stays highlighted on Log / Account, and tapping it goes back to the More list', async () => {
  const { tree, tabs, navigation } = await renderBar(GATE, 'Log');
  const more = tabs.find(t => t.props.accessibilityLabel === 'More');
  expect(more.props.accessibilityState.selected).toBe(true);
  expect(tabs.filter(t => t.props.accessibilityState?.selected)).toHaveLength(
    1,
  );
  await ReactTestRenderer.act(async () => more.props.onPress());
  expect(navigation.navigate).toHaveBeenCalledWith('More', undefined);
  await ReactTestRenderer.act(async () => tree.unmount());
});
