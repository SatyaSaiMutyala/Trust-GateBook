import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';
import { makeStore } from '../src/store';

jest.useFakeTimers();

test('renders the login screen when there is no saved session', async () => {
  const store = makeStore();
  let tree;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(<App store={store} />);
  });
  await ReactTestRenderer.act(async () => {
    await Promise.resolve();
  });
  expect(store.getState().auth.status).toBe('ready');
  const texts = tree.root
    .findAll(n => typeof n.props.children === 'string')
    .map(n => n.props.children);
  expect(texts).toEqual(expect.arrayContaining(['TruSentinel', 'Sign in']));
  await ReactTestRenderer.act(async () => {
    tree.unmount();
  });
});
