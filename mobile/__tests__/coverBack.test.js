/* global Response */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Provider } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { makeStore } from '../src/store';
import { mailFormData } from '../src/store/api';
import { loggedIn } from '../src/store/authSlice';
import { logMailPatched } from '../src/store/draftsSlice';
import { LogMailScreen, missingPhotos } from '../src/screens/LogMailScreen';
import {
  MailDetailsScreen,
  mailPhotos,
  photoIndex,
} from '../src/screens/MailDetailsScreen';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({
    navigate: jest.fn(),
    setOptions: jest.fn(),
    goBack: jest.fn(),
  }),
}));

const reply = body =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );

const ITEM = {
  id: 'ML-261015-ABCD',
  kind: 'Courier',
  refNo: 'BD123',
  sender: 'Transasia',
  carrier: 'Blue Dart',
  broughtBy: 'Ramesh',
  broughtPhone: '9876500000',
  recipient: null,
  recipientName: 'Priya',
  dept: 'Accounts',
  pieces: 1,
  notes: '',
  site: 'Main Gate',
  receivedAt: new Date().toISOString(),
  receivedBy: { id: 'g1', name: 'Guard' },
  coverPhotoUrl: '/api/files/front.jpg?exp=1&sig=a',
  coverBackPhotoUrl: '/api/files/back.jpg?exp=1&sig=b',
  personPhotoUrl: '/api/files/person.jpg?exp=1&sig=c',
  status: 'lodged',
  notifiedAt: null,
  remindedAt: null,
  handedAt: null,
  handedBy: null,
  collectedBy: '',
  handedNote: '',
  confirmedAt: null,
  disputeNote: '',
  resolvedAt: null,
  resolvedBy: null,
  resolveNote: '',
};

afterEach(() => {
  global.fetch = undefined;
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
  await ReactTestRenderer.act(async () => {
    await new Promise(r => setImmediate(r));
  });
  return tree;
}
const texts = tree =>
  tree.root
    .findAll(n => typeof n.props.children === 'string')
    .map(n => n.props.children);
const security = () => {
  const store = makeStore();
  store.dispatch(
    loggedIn({
      token: 'jwt',
      user: { id: 'g1', name: 'Guard', role: 'security' },
    }),
  );
  return store;
};

test('all three photos are required', () => {
  expect(missingPhotos({})).toEqual({
    cover: true,
    coverBack: true,
    person: true,
  });
  expect(missingPhotos({ coverUri: 'a', personUri: 'c' })).toEqual({
    coverBack: true,
  });
  expect(
    missingPhotos({ coverUri: 'a', coverBackUri: 'b', personUri: 'c' }),
  ).toEqual({});
});

test('the multipart body carries cover, coverBack and person', () => {
  // Node's FormData stringifies React Native's { uri, name, type } file parts, so record appends instead.
  const RealFormData = global.FormData;
  global.FormData = class {
    constructor() {
      this.appended = [];
    }
    append(key, value) {
      this.appended.push([key, value]);
    }
  };
  const form = mailFormData({
    kind: 'Courier',
    sender: 'Transasia',
    broughtBy: 'Ramesh',
    pieces: 1,
    recipientName: 'Priya',
    coverUri: 'file:///front.jpg',
    coverBackUri: 'file:///back.jpg',
    personUri: 'file:///person.jpg',
  });
  global.FormData = RealFormData;
  const files = form.appended
    .filter(([, v]) => v && typeof v === 'object')
    .map(([k, v]) => [k, v.uri, v.type]);
  expect(files).toEqual([
    ['cover', 'file:///front.jpg', 'image/jpeg'],
    ['coverBack', 'file:///back.jpg', 'image/jpeg'],
    ['person', 'file:///person.jpg', 'image/jpeg'],
  ]);
});

test('logging without the back photo: "Take all three photos." and only that tile is red', async () => {
  global.fetch = jest.fn(() =>
    reply({
      data: [],
      pagination: {
        page: 1,
        limit: 8,
        total: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPrevPage: false,
      },
    }),
  );
  const store = security();
  store.dispatch(
    logMailPatched({
      form: {
        kind: 'Courier',
        sender: 'Transasia',
        broughtBy: 'Ramesh',
        recipientText: 'Priya',
      },
      coverUri: 'file:///front.jpg',
      personUri: 'file:///person.jpg',
    }),
  );
  const tree = await render(
    store,
    <LogMailScreen
      navigation={{ setOptions: jest.fn(), navigate: jest.fn() }}
    />,
  );
  const submit = tree.root.findAll(
    n =>
      n.props.accessibilityLabel === 'Log & notify receiver' && n.props.onPress,
  )[0];
  await ReactTestRenderer.act(async () => submit.props.onPress());
  expect(texts(tree)).toContain('Take all three photos.');
  const tile = label =>
    tree.root.findAll(n => n.props.label === label && 'error' in n.props)[0];
  expect(tile('Cover — back').props.error).toBe(true);
  expect(tile('Cover — front').props.error).toBeFalsy();
  expect(tile('Delivery person').props.error).toBeFalsy();
  // Layout: front over back in the left column (4:3), person filling the right column.
  expect(tile('Cover — front').parent).toBe(tile('Cover — back').parent);
  expect(tile('Delivery person').parent).not.toBe(tile('Cover — front').parent);
  expect(tile('Cover — front').props.aspect).toBeCloseTo(4 / 3);
  expect(tile('Cover — back').props.aspect).toBeCloseTo(4 / 3);
  expect(tile('Delivery person').props.fill).toBe(true);
  expect(global.fetch.mock.calls.some(([req]) => req.method === 'POST')).toBe(
    false,
  );
  // The back photo is kept in the draft like the others.
  store.dispatch(logMailPatched({ coverBackUri: 'file:///back.jpg' }));
  expect(store.getState().drafts.logMail.coverBackUri).toBe('file:///back.jpg');
});

test('details show the back cover, or a neutral placeholder for older items', async () => {
  let item = ITEM;
  global.fetch = jest.fn(() => reply({ item }));
  const nav = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true };
  let tree = await render(
    security(),
    <MailDetailsScreen navigation={nav} route={{ params: { id: ITEM.id } }} />,
  );
  const buttons = tree.root
    .findAll(n => n.props.accessibilityRole === 'imagebutton')
    .map(n => n.props.accessibilityLabel);
  expect(buttons).toEqual(
    expect.arrayContaining(['Front', 'Back', 'Delivery person']),
  );
  expect(
    tree.root.findAll(n => n.props.testID === 'no-back-photo'),
  ).toHaveLength(0);
  await ReactTestRenderer.act(async () => tree.unmount());

  item = { ...ITEM, coverBackPhotoUrl: null };
  tree = await render(
    security(),
    <MailDetailsScreen navigation={nav} route={{ params: { id: ITEM.id } }} />,
  );
  const buttons2 = tree.root
    .findAll(n => n.props.accessibilityRole === 'imagebutton')
    .map(n => n.props.accessibilityLabel);
  expect(buttons2).not.toContain('Back');
  expect(
    tree.root.findAll(n => n.props.testID === 'no-back-photo').length,
  ).toBeGreaterThan(0);
  expect(texts(tree)).toContain('No back photo');
  await ReactTestRenderer.act(async () => tree.unmount());
});

test('preview order is Front · Back · Delivery person, skipping a missing back', () => {
  expect(mailPhotos(ITEM).map(p => p.key)).toEqual(['front', 'back', 'person']);
  expect(photoIndex(ITEM, 'back')).toBe(1);
  expect(photoIndex(ITEM, 'person')).toBe(2);
  const old = { ...ITEM, coverBackPhotoUrl: null };
  expect(mailPhotos(old).map(p => p.key)).toEqual(['front', 'person']);
  expect(photoIndex(old, 'person')).toBe(1);
});
