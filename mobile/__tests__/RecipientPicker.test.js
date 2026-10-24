/* global Response */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { TextInput } from 'react-native';
import { Provider } from 'react-redux';
import { makeStore } from '../src/store';
import { loggedIn } from '../src/store/authSlice';
import { RecipientPicker } from '../src/components/RecipientPicker';

const page = data =>
  Promise.resolve(
    new Response(
      JSON.stringify({
        data,
        pagination: {
          page: 1,
          limit: 8,
          total: data.length,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: false,
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ),
  );

async function setup({ hosts, recipient = null, onPick = jest.fn() }) {
  global.fetch = jest.fn(() => page(hosts));
  const store = makeStore();
  store.dispatch(loggedIn({ token: 't', user: { id: 'g', role: 'security' } }));
  let tree;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <Provider store={store}>
        <RecipientPicker
          text=""
          recipient={recipient}
          onText={() => {}}
          onPick={onPick}
          onClear={() => {}}
        />
      </Provider>,
    );
  });
  return tree;
}
const texts = tree =>
  tree.root
    .findAll(
      n =>
        typeof n.props.children === 'string' || Array.isArray(n.props.children),
    )
    .map(n =>
      []
        .concat(n.props.children)
        .filter(x => typeof x === 'string')
        .join(''),
    );
async function focus(tree) {
  const input = tree.root.findByType(TextInput);
  await ReactTestRenderer.act(async () => input.props.onFocus());
  // let the debounced query + fetch settle
  await ReactTestRenderer.act(async () => new Promise(r => setTimeout(r, 450)));
}

test('explains when no one can receive post yet', async () => {
  const tree = await setup({ hosts: [] });
  await focus(tree);
  expect(texts(tree).join(' ')).toContain(
    'No one can receive post on TruSentinel yet',
  );
});

test('lists employees as soon as the field is focused, and picking one calls onPick', async () => {
  const onPick = jest.fn();
  const ravi = {
    id: 'r1',
    name: 'Ravi Kumar',
    dept: 'Accounts',
    location: '2nd floor',
  };
  const tree = await setup({ hosts: [ravi], onPick });
  await focus(tree);
  expect(texts(tree)).toEqual(
    expect.arrayContaining(['Ravi Kumar', 'Accounts · 2nd floor']),
  );
  const row = tree.root.find(
    n =>
      typeof n.props.onPress === 'function' &&
      /^Ravi Kumar/.test(n.props.accessibilityLabel ?? ''),
  );
  await ReactTestRenderer.act(async () => row.props.onPress());
  expect(onPick).toHaveBeenCalledWith(ravi);
});

test('a picked receiver shows as a card with Change', async () => {
  const tree = await setup({
    hosts: [],
    recipient: {
      id: 'r1',
      name: 'Ravi Kumar',
      dept: 'Accounts',
      location: '2nd floor',
    },
  });
  const t = texts(tree);
  expect(t).toEqual(
    expect.arrayContaining(['Ravi Kumar', 'Accounts · 2nd floor', 'Change']),
  );
  expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
});
