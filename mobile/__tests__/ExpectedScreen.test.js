/* global Response */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Provider } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { makeStore } from '../src/store';
import { loggedIn } from '../src/store/authSlice';
import { checkInPatched } from '../src/store/draftsSlice';
import { checkInPatchFrom } from '../src/utils/expected';
import { CheckInScreen } from '../src/screens/CheckInScreen';
import { ExpectedFormScreen } from '../src/screens/ExpectedFormScreen';
import { ExpectedScreen } from '../src/screens/ExpectedScreen';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ setOptions: jest.fn(), navigate: mockNavigate }),
}));

const json = body =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );

const entry = {
  id: 'EX-261019-AAAA',
  code: 'EX-261019-AAAA',
  kind: 'visitor',
  name: 'Anil Rao',
  phone: '9000000001',
  company: 'Sysmex',
  purpose: '',
  persons: 1,
  host: { id: 'h1', name: 'Dr Meera' },
  contact: null,
  also: [],
  expectedAt: new Date(Date.now() + 3600000).toISOString(),
  untilAt: null,
  vehicle: '',
  items: '',
  notes: 'Send to the lab',
  preapproved: true,
  boxes: 0,
  challanType: '',
  challanNo: '',
  status: 'expected',
  state: 'expected',
  createdBy: { id: 'h1', name: 'Dr Meera' },
};
const delivery = {
  ...entry,
  id: 'EX-261019-BBBB',
  code: 'EX-261019-BBBB',
  kind: 'delivery',
  name: '',
  company: 'Reagent Co',
  boxes: 3,
  preapproved: false,
};

beforeEach(() => {
  mockNavigate.mockClear();
  global.fetch = jest.fn(req => {
    const url = typeof req === 'string' ? req : req.url;
    if (url.includes('/api/settings')) return json({ settings: {} });
    if (url.includes('/api/expected/match')) return json({ expected: null });
    if (url.includes('/api/expected'))
      return json({
        data: [entry, delivery],
        pagination: { page: 1, limit: 20, total: 2, hasNextPage: false },
        counts: { today: 2 },
      });
    return json({
      data: [],
      pagination: { page: 1, limit: 20, total: 0, hasNextPage: false },
    });
  });
});

async function render(user, element, prep) {
  const store = makeStore();
  store.dispatch(loggedIn({ token: 't', user }));
  if (prep) prep(store);
  let tree;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <Provider store={store}>
        <SafeAreaProvider>{element}</SafeAreaProvider>
      </Provider>,
    );
  });
  // Let the list requests resolve.
  await ReactTestRenderer.act(async () => {
    await new Promise(r => setTimeout(r, 50));
  });
  const texts = tree.root
    .findAll(
      n =>
        typeof n.props.children === 'string' ||
        (Array.isArray(n.props.children) &&
          n.props.children.every(x => typeof x === 'string')),
    )
    .map(n => [].concat(n.props.children).join(''));
  const buttons = tree.root
    .findAll(
      n => n.props.accessibilityRole === 'button' && n.props.accessibilityLabel,
    )
    .map(n => n.props.accessibilityLabel);
  await ReactTestRenderer.act(async () => tree.unmount());
  return { texts, buttons };
}

const nav = { setOptions: jest.fn(), navigate: jest.fn(), goBack: jest.fn() };

test('security sees today’s visitors and deliveries with Check in / Received', async () => {
  const { texts, buttons } = await render(
    { id: 's1', name: 'Suresh', role: 'security' },
    <ExpectedScreen navigation={nav} route={{ params: {} }} />,
  );
  expect(texts).toEqual(
    expect.arrayContaining(['Today', 'Upcoming', 'Earlier']),
  );
  expect(texts.join(' ')).toContain('Anil Rao');
  expect(texts.join(' ')).toContain('Delivery from Reagent Co');
  expect(buttons).toEqual(expect.arrayContaining(['Check in', 'Received']));
});

test('an employee without the right sees the list but is told they cannot pre-register', async () => {
  const { texts, buttons } = await render(
    { id: 'h9', name: 'Kiran', role: 'host', canPreRegister: false },
    <ExpectedScreen navigation={nav} route={{ params: {} }} />,
  );
  expect(texts).not.toContain('Today');
  expect(texts.join(' ')).toContain('not been given the right to pre-register');
  expect(buttons).not.toContain('Check in');
  expect(buttons).not.toContain('Edit');
});

test('the form opens for a new visitor with me as the host', async () => {
  const { texts } = await render(
    { id: 'h1', name: 'Dr Meera', role: 'host' },
    <ExpectedFormScreen
      navigation={nav}
      route={{ params: { kind: 'visitor' } }}
    />,
  );
  expect(texts).toEqual(
    expect.arrayContaining(['Visitor', 'Delivery', 'Dr Meera']),
  );
  expect(texts.join(' ')).toContain('Pre-approved');
});

test('check-in shows the expected banner when filled from a pre-registration', async () => {
  const { texts } = await render(
    { id: 's1', name: 'Suresh', role: 'security' },
    <CheckInScreen />,
    store => store.dispatch(checkInPatched(checkInPatchFrom(entry, []))),
  );
  const all = texts.join(' ');
  expect(all).toContain('Expected visitor.');
  expect(all).toContain(entry.code);
});
