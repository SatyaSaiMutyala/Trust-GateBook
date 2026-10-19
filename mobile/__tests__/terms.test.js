/* global Response */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Provider } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { makeStore } from '../src/store';
import { api } from '../src/store/api';
import { loggedIn } from '../src/store/authSlice';
import { settingsReceived } from '../src/store/settingsSlice';
import { AgreementButton, TermsDoc } from '../src/components/Terms';
import { CheckInScreen } from '../src/screens/CheckInScreen';
import { termsSections } from '../src/utils/terms';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ setOptions: jest.fn(), navigate: jest.fn() }),
}));

const json = (body, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );

const TERMS = {
  required: true,
  company: 'TrustLab Diagnostics Private Limited',
  title: 'Visitor Terms & Confidentiality Agreement',
  body: '1. Confidentiality\nI will keep it confidential.\n\nBy checking in I agree.',
  version: 3,
};

beforeEach(() => {
  global.fetch = jest.fn(req => {
    const url = typeof req === 'string' ? req : req.url;
    if (url.includes('/api/settings'))
      return json({ settings: { terms: TERMS } });
    return json({
      data: [],
      pagination: { page: 1, limit: 20, total: 0, hasNextPage: false },
    });
  });
});

function storeAs(role = 'security') {
  const store = makeStore();
  store.dispatch(
    loggedIn({ token: 't', user: { id: 'u1', name: 'Suresh', role } }),
  );
  store.dispatch(settingsReceived({ terms: TERMS }));
  return store;
}

async function render(store, ui) {
  let tree;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <Provider store={store}>
        <SafeAreaProvider>{ui}</SafeAreaProvider>
      </Provider>,
    );
  });
  const texts = tree.root
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
  const buttons = tree.root
    .findAll(
      n => n.props.accessibilityRole === 'button' && n.props.accessibilityLabel,
    )
    .map(n => n.props.accessibilityLabel);
  await ReactTestRenderer.act(async () => tree.unmount());
  // Pressable and its host view both carry the label: count each button once.
  return { texts: texts.join(' | '), buttons: [...new Set(buttons)] };
}

test('terms text splits into numbered sections and plain paragraphs', () => {
  expect(termsSections(TERMS.body)).toEqual([
    { heading: '1. Confidentiality', text: 'I will keep it confidential.' },
    { heading: '', text: 'By checking in I agree.' },
  ]);
  expect(termsSections('')).toEqual([]);
});

test('the terms document shows headings and text', async () => {
  const { texts } = await render(storeAs(), <TermsDoc body={TERMS.body} />);
  expect(texts).toContain('1. Confidentiality');
  expect(texts).toContain('By checking in I agree.');
});

test('check-in asks for agreement when the terms are required', async () => {
  const { texts, buttons } = await render(storeAs(), <CheckInScreen />);
  expect(texts).toContain(
    'Visitor agrees to the terms, including confidentiality',
  );
  expect(buttons).toContain('Read the terms & conditions');
});

test('check-in sends termsAccepted; it is left out when not given', async () => {
  const bodies = [];
  global.fetch = jest.fn(async req => {
    bodies.push(await req.formData());
    return json({ visit: { id: 'GB-1' } }, 201);
  });
  const store = storeAs();
  const common = {
    badge: '7',
    phone: '9000000001',
    name: 'Anil',
    purpose: 'Meeting',
    host: 'Front Office',
    photoUri: 'file:///p.jpg',
  };
  await store.dispatch(
    api.endpoints.checkIn.initiate({ ...common, termsAccepted: true }),
  );
  await store.dispatch(api.endpoints.checkIn.initiate(common));
  expect(bodies[0].get('termsAccepted')).toBe('true');
  expect(bodies[1].get('termsAccepted')).toBeNull();
});

test('agreement button: open it, create it (security), or nothing', async () => {
  const visit = {
    id: 'GB-1',
    termsAt: '2026-10-19T05:00:00.000Z',
    termsVersion: 3,
  };
  const opened = await render(
    storeAs(),
    <AgreementButton
      visit={{ ...visit, agreementUrl: '/api/files/x.pdf?exp=1&sig=a' }}
    />,
  );
  expect(opened.buttons).toEqual(['Agreement PDF']);
  const create = await render(
    storeAs('security'),
    <AgreementButton visit={{ ...visit, agreementUrl: null }} />,
  );
  expect(create.buttons).toEqual(['Create agreement PDF']);
  const viewer = await render(
    storeAs('viewer'),
    <AgreementButton visit={{ ...visit, agreementUrl: null }} />,
  );
  expect(viewer.buttons).toEqual([]);
  const none = await render(
    storeAs(),
    <AgreementButton visit={{ id: 'GB-2', termsAt: null }} />,
  );
  expect(none.buttons).toEqual([]);
});

test('make agreement posts to the visit and returns it', async () => {
  global.fetch = jest.fn(() =>
    json({ visit: { id: 'GB-1', agreementUrl: '/api/files/a.pdf' } }),
  );
  const store = storeAs();
  const r = await store.dispatch(api.endpoints.makeAgreement.initiate('GB-1'));
  expect(r.data.agreementUrl).toBe('/api/files/a.pdf');
  const req = global.fetch.mock.calls[0][0];
  expect([req.method, new URL(req.url).pathname]).toEqual([
    'POST',
    '/api/visits/GB-1/agreement',
  ]);
});
