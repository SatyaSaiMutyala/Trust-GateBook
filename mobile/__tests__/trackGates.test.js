/* global Response */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Provider } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { makeStore } from '../src/store';
import { withSite } from '../src/store/api';
import { loggedIn } from '../src/store/authSlice';
import { settingsReceived } from '../src/store/settingsSlice';
import { selectSite, siteChosen } from '../src/store/siteSlice';
import { TrackScreen } from '../src/screens/TrackScreen';

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

const track = {
  items: [
    {
      id: 'visit_go:GB-1',
      cat: 'visitors',
      kind: 'visit_go',
      tone: 'go',
      title: 'Send Anil Rao in · pass 7',
      body: 'Ravi Kumar accepted at 10:05 am',
      at: '2026-10-19T04:35:00.000Z',
      ref: { type: 'visit', id: 'GB-1' },
      extra: { visitId: 'GB-1', name: 'Anil Rao' },
    },
    {
      id: 'patrol_late:r1@1',
      cat: 'patrol',
      kind: 'patrol_late',
      tone: 'alarm',
      title: 'LATE: Night round 23:00 not started',
      body: '0 of 4 scanned · 15 min after start time',
      at: '2026-10-19T04:35:00.000Z',
      ref: { type: 'patrol', id: 'r1@1' },
      extra: { slotKey: 'r1@1' },
    },
  ],
  counts: { total: 2, urgent: 2, byCat: { visitors: 1, patrol: 1 } },
  cats: [
    { key: 'visitors', label: 'Visitors at the gate' },
    { key: 'patrol', label: 'Patrols' },
  ],
  expectedSoon: [],
  materialInProgress: 0,
};

function storeAs(user, sites = ['Main Gate']) {
  const store = makeStore();
  store.dispatch(loggedIn({ token: 't', user }));
  store.dispatch(settingsReceived({ sites }));
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
  await ReactTestRenderer.act(async () => {
    await new Promise(r => setTimeout(r, 30));
  });
  const texts = tree.root
    .findAll(
      n =>
        typeof n.props.children === 'string' || Array.isArray(n.props.children),
    )
    .map(n =>
      []
        .concat(n.props.children)
        .filter(x => typeof x === 'string' || typeof x === 'number')
        .join(''),
    )
    .join(' | ');
  const buttons = [
    ...new Set(
      tree.root
        .findAll(
          n =>
            n.props.accessibilityRole === 'button' &&
            n.props.accessibilityLabel,
        )
        .map(n => n.props.accessibilityLabel),
    ),
  ];
  await ReactTestRenderer.act(async () => tree.unmount());
  return { texts, buttons };
}

describe('gates', () => {
  const guard = {
    id: 's1',
    name: 'Suresh',
    role: 'security',
    site: 'Guntur Lab',
  };

  test('one gate: no gate; several: the chosen one, else the account’s, else the first', () => {
    expect(selectSite(storeAs(guard).getState())).toBe('');
    const store = storeAs(guard, ['Main Gate', 'Guntur Lab']);
    expect(selectSite(store.getState())).toBe('Guntur Lab');
    store.dispatch(siteChosen('Main Gate'));
    expect(selectSite(store.getState())).toBe('Main Gate');
    store.dispatch(siteChosen('Gone'));
    expect(selectSite(store.getState())).toBe('Guntur Lab');
    const roamer = storeAs({ ...guard, site: '' }, ['Main Gate', 'Guntur Lab']);
    expect(selectSite(roamer.getState())).toBe('Main Gate');
    const host = storeAs({ id: 'h1', name: 'Ravi', role: 'host' }, [
      'Main Gate',
      'Guntur Lab',
    ]);
    expect(selectSite(host.getState())).toBe('');
  });

  test('gate-desk lists and new entries carry the gate; others and “My post” do not', () => {
    expect(withSite('/api/track', 'Main Gate')).toEqual({
      url: '/api/track',
      params: { site: 'Main Gate' },
    });
    expect(
      withSite({ url: '/api/mail', params: { recipient: 'me' } }, 'Main Gate'),
    ).toEqual({ url: '/api/mail', params: { recipient: 'me' } });
    expect(withSite('/api/visits/lookup', 'Main Gate')).toEqual({
      url: '/api/visits/lookup',
    });
    expect(withSite('/api/track', '')).toBe('/api/track');
    const body = new FormData();
    body.append('name', 'Anil');
    withSite({ url: '/api/visits', method: 'POST', body }, 'Guntur Lab');
    expect(body._parts ?? [...body.entries()]).toEqual(
      expect.arrayContaining([['site', 'Guntur Lab']]),
    );
  });
});

describe('TRACK screen', () => {
  beforeEach(() => {
    global.fetch = jest.fn(req => {
      const url = typeof req === 'string' ? req : req.url;
      if (url.includes('/api/track')) return json(track);
      if (url.includes('/api/settings')) return json({ settings: {} });
      return json({});
    });
  });

  test('items by category with their actions; the count', async () => {
    const { texts, buttons } = await render(
      storeAs({ id: 's1', name: 'Suresh', role: 'security' }),
      <TrackScreen navigation={{ navigate: jest.fn() }} />,
    );
    expect(texts).toContain('2 items need action');
    expect(texts).toContain('Send Anil Rao in · pass 7');
    expect(texts).toContain('LATE: Night round 23:00 not started');
    expect(buttons).toEqual(
      expect.arrayContaining(['Allowed in', 'Silence 5 min', 'Scan now']),
    );
  });

  test('all clear', async () => {
    global.fetch = jest.fn(() =>
      json({ ...track, items: [], counts: { total: 0, urgent: 0, byCat: {} } }),
    );
    const { texts } = await render(
      storeAs({ id: 's1', name: 'Suresh', role: 'security' }),
      <TrackScreen navigation={{ navigate: jest.fn() }} />,
    );
    expect(texts).toContain('All clear');
    expect(texts).toContain('Nothing needs action right now.');
  });
});
