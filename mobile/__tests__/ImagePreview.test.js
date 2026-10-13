import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ImagePreview } from '../src/components/ImagePreview';

async function render(ui) {
  let tree;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(<SafeAreaProvider>{ui}</SafeAreaProvider>);
  });
  return tree;
}
// Text content, including texts built from several children (e.g. the "2 / 2" counter).
const texts = tree =>
  tree.root
    .findAll(
      n =>
        typeof n.props.children === 'string' ||
        (Array.isArray(n.props.children) &&
          n.props.children.every(
            ch => typeof ch === 'string' || typeof ch === 'number',
          )),
    )
    .map(n => [].concat(n.props.children).join(''));

test('opens on the tapped photo with caption and counter; missing photos are skipped; ✕ closes', async () => {
  const onClose = jest.fn();
  const tree = await render(
    <ImagePreview
      visible
      index={1}
      onClose={onClose}
      images={[
        { url: '/api/files/a.jpg', label: 'Visitor · Ravi' },
        { url: null, label: 'Missing' },
        { url: '/api/files/b.jpg', label: 'ID proof · PAN' },
      ]}
    />,
  );
  const t = texts(tree).join(' | ');
  expect(t).toContain('ID proof · PAN');
  expect(t).not.toContain('Missing');
  expect(t).toMatch(/2\s*\/\s*2/);
  const close = tree.root.find(
    n =>
      n.props.accessibilityLabel === 'Close photo' &&
      typeof n.props.onPress === 'function',
  );
  await ReactTestRenderer.act(async () => close.props.onPress());
  expect(onClose).toHaveBeenCalled();
});

test('renders nothing when closed', async () => {
  const tree = await render(
    <ImagePreview
      visible={false}
      images={[{ url: '/x.jpg', label: 'X' }]}
      onClose={() => {}}
    />,
  );
  expect(texts(tree)).toHaveLength(0);
});
