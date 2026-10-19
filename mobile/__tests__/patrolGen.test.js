/* global Response */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Provider } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { makeStore } from '../src/store';
import { api } from '../src/store/api';
import { loggedIn } from '../src/store/authSlice';
import { pushOpened, routeOf, routePendingOpen } from '../src/push/push';
import { resetNotices } from '../src/push/dedupe';
import { flushRealtimeBatch, opsEvent } from '../src/realtime/events';
import { codeFrom, dur, slotChip } from '../src/utils/ops';
import { PatrolScreen } from '../src/screens/PatrolScreen';
import { GeneratorScreen } from '../src/screens/GeneratorScreen';

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

const now = Date.now();
const iso = ms => new Date(ms).toISOString();
const slot = {
  key: 'r1@1',
  roundId: 'r1',
  roundName: 'Night round',
  site: 'Main Gate',
  at: iso(now - 15 * 60000),
  end: iso(now + 30 * 60000),
  onTimeTill: iso(now - 5 * 60000),
  status: 'open',
  logStatus: null,
  done: 1,
  total: 2,
  late: false,
  lateMin: 3,
  graceMin: 10,
  firstAt: iso(now - 12 * 60000),
  lastAt: iso(now - 12 * 60000),
  checkpoints: [
    {
      id: 'a',
      name: 'Main gate cabin',
      scannedAt: iso(now - 12 * 60000),
      by: 'Suresh',
      status: 'ok',
    },
    { id: 'b', name: 'Terrace door', scannedAt: null, by: null, status: null },
  ],
  missing: ['Terrace door'],
  guards: ['Suresh'],
  escalations: [],
};
const gen = {
  id: 'g1',
  name: 'DG-1',
  site: 'Main Gate',
  kva: '125',
  tankL: 250,
  rateLph: 12,
  lowPct: 30,
  active: true,
  running: null,
  estimate: {
    litres: 50,
    pct: 20,
    baseAt: iso(now),
    baseL: 50,
    fills: 0,
    hours: 0,
  },
  low: true,
  lastCheck: null,
  checkDueAt: iso(now - 86400000),
  checkOverdue: true,
  month: { hours: 4.2, starts: 2, filledL: 60 },
  lastHm: 1184.4,
};

function storeAs(user) {
  const store = makeStore();
  store.dispatch(loggedIn({ token: 't', user }));
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

beforeEach(() => {
  resetNotices();
  global.fetch = jest.fn(req => {
    const url = typeof req === 'string' ? req : req.url;
    if (url.includes('/api/patrol'))
      return json({
        checkpoints: [],
        rounds: [{ id: 'r1', name: 'Night round' }],
        slots: [slot],
        now: iso(now),
      });
    if (url.includes('/api/gen'))
      return json({ generators: [gen], reasons: [], genCheckDays: 7 });
    if (url.includes('/api/settings')) return json({ settings: {} });
    return json({
      data: [],
      pagination: { page: 1, limit: 20, total: 0, hasNextPage: false },
    });
  });
});

describe('helpers', () => {
  test('durations, slot chips and checkpoint codes', () => {
    expect(dur(65 * 60000)).toBe('1h 05m');
    expect(dur(12 * 60000)).toBe('12m');
    expect(slotChip(slot, now)).toEqual({
      label: '1/2 · 30m left',
      tone: 'wait',
    });
    expect(slotChip({ ...slot, late: true }, now).tone).toBe('bad');
    expect(slotChip({ ...slot, status: 'done', late: false }, now).label).toBe(
      'Complete on time',
    );
    expect(slotChip({ ...slot, status: 'partial' }, now).label).toBe(
      'Missed 1 of 2',
    );
    expect(codeFrom('k7q2md')).toBe('K7Q2MD');
    expect(codeFrom('https://gate.example.com/?cp=K7Q2MD')).toBe('K7Q2MD');
    expect(codeFrom('K7Q2')).toBeNull();
  });
});

describe('API, push and realtime', () => {
  test('scan, start, stop and fuel hit the right endpoints', async () => {
    const calls = [];
    global.fetch = jest.fn(async req => {
      calls.push([req.method, new URL(req.url).pathname]);
      return json({ scan: {}, run: {}, entry: {} });
    });
    const store = storeAs({ id: 's1', name: 'Suresh', role: 'security' });
    await store.dispatch(
      api.endpoints.patrolScan.initiate({
        fields: { code: 'K7Q2MD', status: 'ok' },
      }),
    );
    await store.dispatch(
      api.endpoints.genRun.initiate({ id: 'g1', action: 'start', body: {} }),
    );
    await store.dispatch(
      api.endpoints.genRun.initiate({ runId: 'r9', action: 'stop', body: {} }),
    );
    await store.dispatch(
      api.endpoints.genFuel.initiate({
        id: 'g1',
        fields: { kind: 'fill', litres: '60' },
      }),
    );
    expect(calls).toEqual([
      ['POST', '/api/patrol/scan'],
      ['POST', '/api/gen/g1/start'],
      ['POST', '/api/gen/runs/r9/stop'],
      ['POST', '/api/gen/g1/fuel'],
    ]);
  });

  test('patrol and diesel pushes open their screens; socket events refresh', () => {
    expect(routeOf({ data: { type: 'patrol', id: 'r1@1' } })).toEqual({
      type: 'patrol',
      id: 'r1@1',
    });
    const store = storeAs({ id: 's1', name: 'Suresh', role: 'security' });
    store.dispatch(pushOpened({ data: { type: 'gen', id: 'g1@1' } }));
    const nav = { isReady: () => true, navigate: jest.fn() };
    expect(store.dispatch(routePendingOpen(nav))).toBe(true);
    expect(nav.navigate).toHaveBeenCalledWith('Generator');
    store.dispatch(opsEvent('Patrol'));
    const actions = [];
    flushRealtimeBatch(a => {
      actions.push(a);
      return store.dispatch(a);
    });
    expect(actions.find(a => api.util.invalidateTags.match(a)).payload).toEqual(
      expect.arrayContaining(['Patrol']),
    );
  });
});

describe('screens', () => {
  const nav = { setOptions: jest.fn(), navigate: jest.fn(), goBack: jest.fn() };

  test('patrols: a round due now with its progress and Scan', async () => {
    const { texts, buttons } = await render(
      storeAs({ id: 's1', name: 'Suresh', role: 'security' }),
      <PatrolScreen navigation={nav} />,
    );
    expect(texts).toContain('Night round');
    expect(texts).toContain('1/2 · 30m left');
    expect(buttons).toEqual(
      expect.arrayContaining(['Scan checkpoint', 'Scan']),
    );
  });

  test('a viewer sees rounds without Scan', async () => {
    const { buttons } = await render(
      storeAs({ id: 'v1', name: 'Viewer', role: 'viewer' }),
      <PatrolScreen navigation={nav} />,
    );
    expect(buttons).not.toContain('Scan checkpoint');
  });

  test('generator: low diesel, overdue check, the actions', async () => {
    const { texts, buttons } = await render(
      storeAs({ id: 's1', name: 'Suresh', role: 'security' }),
      <GeneratorScreen />,
    );
    expect(texts).toContain('DG-1');
    expect(texts).toContain('Low: arrange refill');
    expect(texts).toContain('overdue since');
    expect(buttons).toEqual(
      expect.arrayContaining([
        'Start generator',
        'Log diesel fill',
        'Weekly level check',
      ]),
    );
  });
});
