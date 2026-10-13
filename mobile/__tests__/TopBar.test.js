import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { HeaderButton, TopBar } from '../src/components/TopBar';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

async function render(ui) {
  let tree;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>,
    );
  });
  return tree;
}
const texts = tree =>
  tree.root
    .findAll(n => typeof n.props.children === 'string')
    .map(n => n.props.children);

test('shows the screen title on the left and the screen actions on the right', async () => {
  const onExport = jest.fn();
  const tree = await render(
    <TopBar
      title="Visitor log"
      subtitle="Monday, 13 October"
      right={<HeaderButton title="Export" onPress={onExport} />}
    />,
  );
  expect(texts(tree)).toEqual(
    expect.arrayContaining(['Visitor log', 'Monday, 13 October', 'Export']),
  );
  const header = tree.root.find(n => n.props.accessibilityRole === 'header');
  expect(header.props.children).toBe('Visitor log');
  const exportBtn = tree.root.find(
    n =>
      n.props.accessibilityLabel === 'Export' &&
      typeof n.props.onPress === 'function',
  );
  await ReactTestRenderer.act(async () => exportBtn.props.onPress());
  expect(onExport).toHaveBeenCalled();
});

test('pushed screens get a back button instead of the mark', async () => {
  const onBack = jest.fn();
  const tree = await render(
    <TopBar title="Today at the gate" onBack={onBack} />,
  );
  const back = tree.root.find(
    n =>
      n.props.accessibilityLabel === 'Back' &&
      typeof n.props.onPress === 'function',
  );
  await ReactTestRenderer.act(async () => back.props.onPress());
  expect(onBack).toHaveBeenCalled();
  expect(
    tree.root.findAll(n => n.props.accessibilityLabel === 'Gatebook'),
  ).toHaveLength(0);
});
