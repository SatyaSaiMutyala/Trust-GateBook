import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Provider } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { makeStore } from '../src/store';
import {
  FilterSelect,
  FilterTabs,
  SearchBar,
} from '../src/components/FilterBar';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

async function render(ui) {
  let tree;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <Provider store={makeStore()}>
        <SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>
      </Provider>,
    );
  });
  return tree;
}
const texts = tree =>
  tree.root
    .findAll(
      n =>
        typeof n.props.children === 'string' ||
        typeof n.props.children === 'number',
    )
    .map(n => String(n.props.children));

test('tabs show labels and counts, and report the tapped tab', async () => {
  const onChange = jest.fn();
  const tree = await render(
    <FilterTabs
      options={[
        { value: 'lodged', label: 'To collect', count: 3 },
        { value: 'disputed', label: 'Issues', count: 1, tone: 'bad' },
        { value: 'all', label: 'All items' },
      ]}
      value="lodged"
      onChange={onChange}
    />,
  );
  expect(texts(tree)).toEqual(
    expect.arrayContaining(['To collect', '3', 'Issues', '1', 'All items']),
  );
  const issues = tree.root.find(
    n =>
      n.props.accessibilityRole === 'tab' &&
      n.props.accessibilityLabel === 'Issues, 1',
  );
  await ReactTestRenderer.act(async () => issues.props.onPress());
  expect(onChange).toHaveBeenCalledWith('disputed');
});

test('search bar shows a clear button only when there is text', async () => {
  const onChangeText = jest.fn();
  let tree = await render(
    <SearchBar value="" onChangeText={onChangeText} placeholder="Search" />,
  );
  expect(
    tree.root.findAll(n => n.props.accessibilityLabel === 'Clear search'),
  ).toHaveLength(0);
  tree = await render(
    <SearchBar value="ravi" onChangeText={onChangeText} placeholder="Search" />,
  );
  const clear = tree.root.find(
    n =>
      n.props.accessibilityLabel === 'Clear search' &&
      typeof n.props.onPress === 'function',
  );
  await ReactTestRenderer.act(async () => clear.props.onPress());
  expect(onChangeText).toHaveBeenCalledWith('');
});

test('filter select shows its label at the default and the choice once changed', async () => {
  const options = [
    { value: 'all', label: 'All statuses', short: 'All' },
    { value: 'in', label: 'Inside' },
  ];
  let tree = await render(
    <FilterSelect
      label="Status"
      value="all"
      options={options}
      onChange={() => {}}
      defaultValue="all"
    />,
  );
  expect(texts(tree)).toContain('Status');
  tree = await render(
    <FilterSelect
      label="Status"
      value="in"
      options={options}
      onChange={() => {}}
      defaultValue="all"
    />,
  );
  expect(texts(tree)).toContain('Inside');
});
