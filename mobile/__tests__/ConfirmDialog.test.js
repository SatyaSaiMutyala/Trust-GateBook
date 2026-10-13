import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { ConfirmDialog } from '../src/components/ConfirmDialog';

test('themed sign-out dialog shows its text and wires Cancel / Sign out', async () => {
  const onCancel = jest.fn();
  const onConfirm = jest.fn();
  let tree;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <ConfirmDialog
        visible
        tone="danger"
        title="Sign out?"
        message="You will need your email and password to sign in again."
        confirmLabel="Sign out"
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );
  });
  const texts = tree.root
    .findAll(n => typeof n.props.children === 'string')
    .map(n => n.props.children);
  expect(texts).toEqual(
    expect.arrayContaining(['Sign out?', 'Cancel', 'Sign out']),
  );
  const press = label =>
    tree.root.find(
      n =>
        n.props.accessibilityRole === 'button' &&
        n.props.accessibilityLabel === label &&
        typeof n.props.onPress === 'function',
    );
  await ReactTestRenderer.act(async () => press('Cancel').props.onPress());
  expect(onCancel).toHaveBeenCalledTimes(1);
  await ReactTestRenderer.act(async () => press('Sign out').props.onPress());
  expect(onConfirm).toHaveBeenCalledTimes(1);
});
