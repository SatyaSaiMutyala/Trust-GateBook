/* global Response */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Provider } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { makeStore } from '../src/store';
import { api } from '../src/store/api';
import { loggedIn } from '../src/store/authSlice';
import { pushOpened, routeOf, routePendingOpen } from '../src/push/push';
import { resetNotices, routeNoticeKey } from '../src/push/dedupe';
import {
  flushRealtimeBatch,
  incidentEvent,
  keysEvent,
} from '../src/realtime/events';
import { dueChips, freeCopies } from '../src/utils/keys';
import { incidentRights } from '../src/utils/incidents';
import { KeysScreen } from '../src/screens/KeysScreen';
import { IncidentsScreen } from '../src/screens/IncidentsScreen';
import { IncidentDetailsScreen } from '../src/screens/IncidentDetailsScreen';

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

const move = {
  id: 'm1',
  key: { id: 'k1', number: 'SRV-1', name: 'Server room', location: 'Block A' },
  site: 'Main Gate',
  issuedAt: '2026-10-19T05:00:00.000Z',
  issuedBy: { id: 's1', name: 'Suresh' },
  taker: { id: null, name: 'Electrician Raju', phone: '98480 11111' },
  purpose: 'Wiring',
  dueAt: '2026-10-19T06:00:00.000Z',
  returnedAt: null,
  returnedByName: '',
  receivedBy: null,
  returnNote: '',
  state: 'overdue',
};
const keys = [
  {
    id: 'k1',
    number: 'SRV-1',
    name: 'Server room',
    location: 'Block A',
    site: 'Main Gate',
    copies: 1,
    restricted: true,
    authorised: 'IT team',
    active: true,
    out: [move],
  },
  {
    id: 'k2',
    number: 'ST-2',
    name: 'Store',
    location: '',
    site: 'Main Gate',
    copies: 2,
    restricted: false,
    authorised: '',
    active: true,
    out: [],
  },
];
const incident = {
  id: 'IN-261019-AAAA',
  code: 'IN-261019-AAAA',
  site: 'Main Gate',
  location: 'Lab 2',
  type: 'Water leak',
  severity: 'high',
  occurredAt: '2026-10-19T05:00:00.000Z',
  reportedAt: '2026-10-19T05:01:00.000Z',
  reportedBy: { id: 'h1', name: 'Ravi Kumar' },
  description: 'Water on the lab floor',
  people: '',
  actionTaken: 'Mopped',
  photoUrls: [],
  status: 'open',
  assignedTo: { id: 'h2', name: 'Anil Rao' },
  closedAt: null,
  closedBy: null,
  resolution: '',
  source: '',
  updates: [
    {
      at: '2026-10-19T05:10:00.000Z',
      by: { id: 's1', name: 'Suresh' },
      text: 'Plumber called',
      status: 'in_progress',
      assignTo: { id: 'h2', name: 'Anil Rao' },
    },
  ],
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
    if (url.includes('/api/keymoves'))
      return json({
        data: [move],
        pagination: { page: 1, limit: 20, total: 1, hasNextPage: false },
        counts: { out: 1, overdue: 1 },
      });
    if (url.includes('/api/keys'))
      return json({
        keys,
        counts: { total: 2, out: 1, available: 1, overdue: 1 },
      });
    if (url.includes('/api/incidents/assignees'))
      return json({ data: [{ id: 'h2', name: 'Anil Rao', role: 'host' }] });
    if (url.includes('/api/incidents/IN-')) return json({ incident });
    if (url.includes('/api/incidents'))
      return json({
        data: [incident],
        pagination: { page: 1, limit: 20, total: 1, hasNextPage: false },
        counts: { open: 1, closed: 0, critical: 1 },
      });
    if (url.includes('/api/settings')) return json({ settings: {} });
    return json({
      data: [],
      pagination: { page: 1, limit: 20, total: 0, hasNextPage: false },
    });
  });
});

describe('helpers', () => {
  test('return-by quick picks and free copies', () => {
    const morning = new Date(2026, 9, 19, 9, 0).getTime();
    const chips = dueChips(morning).map(([l]) => l);
    expect(chips).toEqual([
      '1 hour',
      '2 hours',
      '6 pm today',
      'Tomorrow 10 am',
    ]);
    const evening = new Date(2026, 9, 19, 17, 45).getTime();
    expect(dueChips(evening).map(([l]) => l)).not.toContain('6 pm today');
    const tomorrow = dueChips(evening).at(-1)[1];
    expect([tomorrow.getDate(), tomorrow.getHours()]).toEqual([20, 10]);
    expect(freeCopies(keys[0])).toBe(0);
    expect(freeCopies(keys[1])).toBe(2);
  });

  test('who may do what with an incident', () => {
    const sec = incidentRights(incident, { id: 's1', role: 'security' });
    expect(sec).toMatchObject({
      update: true,
      status: true,
      assign: true,
      close: true,
      reopen: false,
    });
    const assignee = incidentRights(incident, { id: 'h2', role: 'host' });
    expect(assignee).toMatchObject({
      status: true,
      assign: false,
      close: true,
    });
    const reporter = incidentRights(incident, { id: 'h1', role: 'host' });
    expect(reporter).toMatchObject({
      update: true,
      status: false,
      close: false,
    });
    const viewer = incidentRights(incident, { id: 'v1', role: 'viewer' });
    expect(viewer.update).toBe(false);
    const closed = { ...incident, status: 'closed' };
    expect(incidentRights(closed, { id: 'a1', role: 'admin' })).toMatchObject({
      update: false,
      reopen: true,
    });
  });
});

describe('API, push and realtime', () => {
  test('issue, return, report and update hit the right endpoints', async () => {
    const calls = [];
    global.fetch = jest.fn(async req => {
      const path = new URL(req.url).pathname;
      calls.push([
        req.method,
        path,
        path === '/api/incidents' ? await req.formData() : await req.text(),
      ]);
      return json({ move, key: keys[0], incident });
    });
    const store = storeAs({ id: 's1', name: 'Suresh', role: 'security' });
    await store.dispatch(
      api.endpoints.issueKey.initiate({
        id: 'k2',
        body: { takerName: 'Raju', dueAt: null },
      }),
    );
    await store.dispatch(
      api.endpoints.returnKey.initiate({ moveId: 'm1', body: { note: 'ok' } }),
    );
    await store.dispatch(
      api.endpoints.reportIncident.initiate({
        fields: { type: 'Water leak', severity: 'low', description: 'x' },
        photos: ['file:///a.jpg'],
      }),
    );
    await store.dispatch(
      api.endpoints.incidentAction.initiate({
        id: incident.id,
        action: 'close',
        body: { resolution: 'Fixed' },
      }),
    );
    expect(calls.map(c => [c[0], c[1]])).toEqual([
      ['POST', '/api/keys/k2/issue'],
      ['POST', '/api/keymoves/m1/return'],
      ['POST', '/api/incidents'],
      ['POST', `/api/incidents/${incident.id}/close`],
    ]);
    expect(JSON.parse(calls[0][2])).toEqual({ takerName: 'Raju', dueAt: null });
    expect(calls[2][2].get('severity')).toBe('low');
  });

  test('incident pushes open the incident; key pushes open the key board for the gate', () => {
    expect(routeOf({ data: { type: 'incident', id: incident.id } })).toEqual({
      type: 'incident',
      id: incident.id,
    });
    expect(routeNoticeKey({ type: 'incident', id: incident.id })).toBe(
      `incident:${incident.id}`,
    );
    const store = storeAs({ id: 'h1', name: 'Ravi', role: 'host' });
    store.dispatch(pushOpened({ data: { type: 'incident', id: incident.id } }));
    const nav = { isReady: () => true, navigate: jest.fn() };
    expect(store.dispatch(routePendingOpen(nav))).toBe(true);
    expect(nav.navigate).toHaveBeenCalledWith('IncidentDetails', {
      id: incident.id,
    });
    const gate = storeAs({ id: 's1', name: 'Suresh', role: 'security' });
    gate.dispatch(pushOpened({ data: { type: 'key', id: 'm1' } }));
    const nav2 = { isReady: () => true, navigate: jest.fn() };
    expect(gate.dispatch(routePendingOpen(nav2))).toBe(true);
    expect(nav2.navigate).toHaveBeenCalledWith('Keys');
  });

  test('incident:changed patches the cached incident; keys:changed refreshes the key lists', async () => {
    const store = storeAs({ id: 's1', name: 'Suresh', role: 'security' });
    await store.dispatch(api.endpoints.getIncident.initiate(incident.id));
    store.dispatch(incidentEvent({ ...incident, status: 'closed' }));
    expect(
      api.endpoints.getIncident.select(incident.id)(store.getState()).data
        .status,
    ).toBe('closed');
    store.dispatch(keysEvent());
    const actions = [];
    flushRealtimeBatch(a => {
      actions.push(a);
      return store.dispatch(a);
    });
    expect(actions.find(a => api.util.invalidateTags.match(a)).payload).toEqual(
      expect.arrayContaining(['Incidents', 'Keys']),
    );
  });
});

describe('screens', () => {
  const nav = {
    setOptions: jest.fn(),
    navigate: jest.fn(),
    goBack: jest.fn(),
    replace: jest.fn(),
  };

  test('the key board shows keys, who has them, Issue for free keys and Return', async () => {
    const { texts, buttons } = await render(
      storeAs({ id: 's1', name: 'Suresh', role: 'security' }),
      <KeysScreen navigation={nav} />,
    );
    expect(texts).toContain('SRV-1');
    expect(texts).toContain('Electrician Raju');
    expect(texts).toContain('Overdue');
    expect(texts).toContain('2 of 2 in');
    expect(buttons).toEqual(
      expect.arrayContaining([
        'Issue',
        'Take back key SRV-1 from Electrician Raju',
      ]),
    );
  });

  test('a viewer sees the board without Issue / Return', async () => {
    const { buttons } = await render(
      storeAs({ id: 'v1', name: 'Viewer', role: 'viewer' }),
      <KeysScreen navigation={nav} />,
    );
    expect(buttons).not.toContain('Issue');
  });

  test('incidents list: open count and Report button', async () => {
    const { texts, buttons } = await render(
      storeAs({ id: 'h1', name: 'Ravi', role: 'host' }),
      <IncidentsScreen navigation={nav} />,
    );
    expect(texts).toContain('Water leak');
    expect(texts).toContain('High');
    expect(buttons).toEqual(expect.arrayContaining(['+ Report incident']));
  });

  test('incident details: the assignee can update and close, the timeline shows', async () => {
    const { texts, buttons } = await render(
      storeAs({ id: 'h2', name: 'Anil Rao', role: 'host' }),
      <IncidentDetailsScreen
        navigation={nav}
        route={{ params: { id: incident.id } }}
      />,
    );
    expect(texts).toContain('Plumber called');
    expect(texts).toContain('Water on the lab floor');
    expect(buttons).toEqual(
      expect.arrayContaining(['Save update', 'Close incident']),
    );
    expect(buttons).not.toContain('Reopen');
  });
});
