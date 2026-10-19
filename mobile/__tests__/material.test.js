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
import { flushRealtimeBatch, materialEvent } from '../src/realtime/events';
import { mayCancel, mpState, outstandingText } from '../src/utils/material';
import { savedToast } from '../src/screens/MaterialFormScreen';
import { MaterialScreen } from '../src/screens/MaterialScreen';
import { MaterialDetailsScreen } from '../src/screens/MaterialDetailsScreen';

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

const base = {
  id: 'MP-261019-AAAA',
  code: 'MP-261019-AAAA',
  site: 'Main Gate',
  direction: 'in',
  mode: 'visitor',
  boxes: 3,
  items: [{ desc: 'Boxes', qty: 3, unit: 'Box', serial: '', outstanding: 3 }],
  challanType: 'Delivery challan',
  refNo: 'DC-5521',
  ewaybill: '',
  challanPhotoUrls: ['/api/files/a.jpg'],
  photoUrls: [],
  carrier: {
    name: 'Anil Rao',
    company: 'Sysmex',
    phone: '',
    vehicle: '',
    visitId: 'GB-1',
    visitBadge: '7',
    photoUrl: '/api/files/p.jpg',
  },
  purpose: '',
  remarks: '',
  returnable: false,
  returnDue: null,
  overdue: false,
  status: 'awaiting_receipt',
  authorisedBy: { id: 'h1', name: 'Ravi Kumar' },
  requestedBy: null,
  createdBy: { id: 's1', name: 'Suresh' },
  createdAt: '2026-10-19T05:00:00.000Z',
  returns: [],
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
    if (url.includes('/api/material/MP-')) return json({ pass: base });
    if (url.includes('/api/material'))
      return json({
        data: [
          base,
          {
            ...base,
            id: 'MP-261019-BBBB',
            code: 'MP-261019-BBBB',
            direction: 'out',
            status: 'ready',
            boxes: 1,
            items: [],
          },
        ],
        pagination: { page: 1, limit: 20, total: 2, hasNextPage: false },
        counts: {
          boxesInToday: 3,
          boxesOutToday: 0,
          accept: 1,
          gate: 1,
          open: 0,
          overdue: 0,
          todo: 1,
        },
      });
    if (url.includes('/api/settings')) return json({ settings: {} });
    return json({
      data: [],
      pagination: { page: 1, limit: 20, total: 0, hasNextPage: false },
    });
  });
});

describe('helpers', () => {
  test('status words follow the pass', () => {
    expect(mpState(base)).toEqual({
      label: 'Waiting for Ravi Kumar to accept',
      tone: 'wait',
    });
    expect(mpState({ ...base, status: 'ready', mode: 'visitor' }).label).toBe(
      'Count boxes when visitor leaves',
    );
    expect(
      mpState({ ...base, status: 'pending_return', overdue: true }),
    ).toEqual({ label: 'Overdue', tone: 'bad' });
    expect(
      mpState({ ...base, status: 'returned', direction: 'out' }).label,
    ).toBe('Came back');
    expect(mpState({ ...base, status: 'done', direction: 'out' }).label).toBe(
      'Left the premises',
    );
    expect(
      outstandingText({
        items: [
          { desc: 'Boxes', unit: 'Box', outstanding: 1 },
          { desc: 'Tool kit', unit: 'Set', outstanding: 1 },
        ],
      }),
    ).toBe('1 box, 1 Set Tool kit');
  });

  test('who may cancel; the toast after saving', () => {
    expect(mayCancel(base, { id: 's1', role: 'security' })).toBe(true);
    expect(mayCancel(base, { id: 'h1', role: 'host' })).toBe(false);
    expect(
      mayCancel(
        { ...base, requestedBy: { id: 'h1' } },
        { id: 'h1', role: 'host' },
      ),
    ).toBe(true);
    expect(
      mayCancel(
        { ...base, status: 'received' },
        { id: 's1', role: 'security' },
      ),
    ).toBe(false);
    expect(savedToast(base, true)).toBe(
      'Saved. Ravi Kumar has been asked to accept 3 boxes.',
    );
    expect(savedToast({ ...base, status: 'ready' }, false)).toBe(
      'Saved. Security will count the boxes when the visitor leaves.',
    );
  });
});

describe('API, push and realtime', () => {
  test('create sends fields and photo parts; actions hit the right endpoints', async () => {
    const calls = [];
    global.fetch = jest.fn(async req => {
      const path = new URL(req.url).pathname;
      calls.push([
        req.method,
        path,
        path.endsWith('/material') ? await req.formData() : null,
      ]);
      return json({ pass: base });
    });
    const store = storeAs({ id: 's1', name: 'Suresh', role: 'security' });
    await store.dispatch(
      api.endpoints.createMaterial.initiate({
        fields: { direction: 'in', boxes: 3 },
        challan: ['file:///c.jpg'],
        boxPhotos: [],
        carrier: null,
      }),
    );
    await store.dispatch(
      api.endpoints.materialAction.initiate({
        id: base.id,
        action: 'receipt',
        body: { ok: true },
      }),
    );
    await store.dispatch(
      api.endpoints.materialUpload.initiate({
        id: base.id,
        action: 'release',
        fields: { boxes: 3 },
      }),
    );
    expect(calls.map(c => [c[0], c[1]])).toEqual([
      ['POST', '/api/material'],
      ['POST', `/api/material/${base.id}/receipt`],
      ['POST', `/api/material/${base.id}/release`],
    ]);
    expect(calls[0][2].get('boxes')).toBe('3');
    expect(calls[0][2].get('direction')).toBe('in');
  });

  test('a material notification opens the pass; notices dedupe on their own key', () => {
    expect(routeOf({ data: { type: 'material', id: base.id } })).toEqual({
      type: 'material',
      id: base.id,
    });
    expect(routeNoticeKey({ type: 'material', id: base.id })).toBe(
      `material:${base.id}`,
    );
    const store = storeAs({ id: 'h1', name: 'Ravi', role: 'host' });
    store.dispatch(pushOpened({ data: { type: 'material', id: base.id } }));
    const nav = { isReady: () => true, navigate: jest.fn() };
    expect(store.dispatch(routePendingOpen(nav))).toBe(true);
    expect(nav.navigate).toHaveBeenCalledWith('MaterialDetails', {
      id: base.id,
    });
  });

  test('material:changed patches the cached pass and refreshes the lists', async () => {
    const store = storeAs({ id: 's1', name: 'Suresh', role: 'security' });
    await store.dispatch(api.endpoints.getMaterial.initiate(base.id));
    store.dispatch(materialEvent({ ...base, status: 'received' }));
    expect(
      api.endpoints.getMaterial.select(base.id)(store.getState()).data.status,
    ).toBe('received');
    const actions = [];
    flushRealtimeBatch(a => {
      actions.push(a);
      return store.dispatch(a);
    });
    expect(actions.find(a => api.util.invalidateTags.match(a)).payload).toEqual(
      expect.arrayContaining(['Material']),
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

  test('security sees the gate tabs with counts, IN / OUT buttons and the passes', async () => {
    const { texts, buttons } = await render(
      storeAs({ id: 's1', name: 'Suresh', role: 'security' }),
      <MaterialScreen navigation={nav} />,
    );
    expect(texts).toContain('Today 3/0');
    expect(texts).toContain('Anil Rao');
    expect(buttons).toEqual(
      expect.arrayContaining(['↓ Material IN', '↑ Material OUT']),
    );
  });

  test('an employee sees "Send material out" and their tabs', async () => {
    const { texts, buttons } = await render(
      storeAs({ id: 'h1', name: 'Ravi', role: 'host' }),
      <MaterialScreen navigation={nav} />,
    );
    expect(buttons).toContain('+ Send material out');
    expect(texts).toContain('Sent out');
  });

  test('the receiving employee gets Received / Not received on the pass', async () => {
    const { texts, buttons } = await render(
      storeAs({ id: 'h1', name: 'Ravi', role: 'host' }),
      <MaterialDetailsScreen
        navigation={nav}
        route={{ params: { id: base.id } }}
      />,
    );
    expect(texts).toContain('3 boxes brought in for you');
    expect(buttons).toEqual(
      expect.arrayContaining(['Received', 'Not received']),
    );
    expect(buttons).not.toContain('Cancel pass');
  });

  test('security sees Remind / Received on paper and can cancel', async () => {
    const { buttons } = await render(
      storeAs({ id: 's1', name: 'Suresh', role: 'security' }),
      <MaterialDetailsScreen
        navigation={nav}
        route={{ params: { id: base.id } }}
      />,
    );
    expect(buttons).toEqual(
      expect.arrayContaining(['Remind', 'Received on paper', 'Cancel pass']),
    );
  });
});
