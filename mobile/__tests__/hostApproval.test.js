/* global Response */
import { makeStore } from '../src/store';
import { api } from '../src/store/api';
import { loggedIn } from '../src/store/authSlice';
import { pushOpened, routePendingOpen } from '../src/push/push';
import { resetNotices, routeNoticeKey } from '../src/push/dedupe';
import {
  flushRealtimeBatch,
  notificationNewEvent,
  visitEvent,
} from '../src/realtime/events';
import {
  hostReplyText,
  hostStage,
  isLegacyVisit,
  telUrl,
} from '../src/utils/visit';

jest.useFakeTimers();

const json = (status, body) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );

function signedInStore(role = 'security', extra = {}) {
  const store = makeStore();
  store.dispatch(
    loggedIn({
      token: 'jwt',
      user: { id: 'u1', name: 'Ravi', role, ...extra },
    }),
  );
  return store;
}

const base = {
  id: 'GB-261019-AAAA',
  name: 'Anil Rao',
  host: 'Ravi Kumar',
  hostId: 'u1',
  badge: '7',
  inAt: '2026-10-19T05:00:00.000Z',
  outAt: null,
  hostStatus: 'waiting',
  hostVia: null,
  escalatedAt: null,
  allowedAt: null,
};

beforeEach(() => {
  resetNotices();
  global.fetch = jest.fn(() => json(200, { ok: true }));
});

afterEach(() => {
  global.fetch = undefined;
  jest.clearAllTimers();
});

describe('hostStage / hostReplyText', () => {
  test('maps every host-approval state to the gate’s next step', () => {
    expect(hostStage(base)).toMatchObject({ key: 'waiting', tone: 'wait' });
    expect(
      hostStage({ ...base, escalatedAt: '2026-10-19T05:06:00Z' }),
    ).toMatchObject({
      key: 'noreply',
      tone: 'bad',
    });
    expect(hostStage({ ...base, hostStatus: 'accepted' })).toMatchObject({
      key: 'accepted',
      tone: 'go',
    });
    expect(hostStage({ ...base, hostStatus: 'declined' })).toMatchObject({
      key: 'declined',
      tone: 'bad',
    });
    expect(hostStage({ ...base, hostStatus: 'manual' })).toMatchObject({
      key: 'manual',
    });
    // Let in or exited: nothing extra to show.
    expect(
      hostStage({ ...base, hostStatus: 'accepted', allowedAt: 'x' }),
    ).toBeNull();
    expect(hostStage({ ...base, outAt: 'x' })).toBeNull();
  });

  test('reply text, legacy visits and tel: URLs', () => {
    expect(
      hostReplyText({ ...base, hostStatus: 'accepted', hostVia: 'phone' }),
    ).toBe('Confirmed by phone');
    expect(hostReplyText({ ...base, escalatedAt: 'x' })).toBe('No reply');
    expect(
      isLegacyVisit({ ...base, hostStatus: 'manual', allowedAt: base.inAt }),
    ).toBe(true);
    expect(isLegacyVisit(base)).toBe(false);
    expect(telUrl('98765 00001')).toBe('tel:9876500001');
    expect(telUrl('+91 98765-00001')).toBe('tel:+919876500001');
  });
});

describe('API', () => {
  test('check-in sends hostId for a picked employee, host for a typed name', async () => {
    const bodies = [];
    global.fetch = jest.fn(async req => {
      bodies.push(await req.formData());
      return json(201, { visit: base });
    });
    const store = signedInStore();
    const common = {
      badge: '7',
      phone: '9000000001',
      name: 'Anil',
      purpose: 'Meeting',
      photoUri: 'file:///p.jpg',
    };
    await store.dispatch(
      api.endpoints.checkIn.initiate({
        ...common,
        hostId: 'u9',
        host: 'Ravi Kumar',
      }),
    );
    await store.dispatch(
      api.endpoints.checkIn.initiate({ ...common, host: 'Front office' }),
    );
    expect(bodies[0].get('hostId')).toBe('u9');
    expect(bodies[0].get('host')).toBeNull();
    expect(bodies[1].get('hostId')).toBeNull();
    expect(bodies[1].get('host')).toBe('Front office');
  });

  test('respond / allow hit the right endpoints; a conflict exposes the current visit', async () => {
    const calls = [];
    global.fetch = jest.fn(async req => {
      calls.push([req.method, new URL(req.url).pathname, await req.text()]);
      if (new URL(req.url).pathname.endsWith('/allow'))
        return json(409, {
          error: {
            code: 'conflict',
            message: 'Already let in.',
            visit: { ...base, allowedAt: 'x' },
          },
        });
      return json(200, { visit: { ...base, hostStatus: 'accepted' } });
    });
    const store = signedInStore('host');
    await store.dispatch(
      api.endpoints.respondVisit.initiate({
        id: base.id,
        status: 'accepted',
        note: 'Send up',
      }),
    );
    const res = await store.dispatch(
      api.endpoints.allowVisit.initiate({ id: base.id, viaPhone: true }),
    );
    expect(calls[0]).toEqual([
      'POST',
      `/api/visits/${base.id}/respond`,
      JSON.stringify({ status: 'accepted', note: 'Send up' }),
    ]);
    expect(calls[1]).toEqual([
      'POST',
      `/api/visits/${base.id}/allow`,
      JSON.stringify({ viaPhone: true }),
    ]);
    expect(res.error).toMatchObject({
      code: 'conflict',
      visit: { allowedAt: 'x' },
    });
  });

  test('my waiting count reads counts.waiting', async () => {
    global.fetch = jest.fn(() =>
      json(200, {
        data: [],
        pagination: { total: 0 },
        counts: { waiting: 3, current: 1 },
      }),
    );
    const store = signedInStore('host');
    const r = await store.dispatch(api.endpoints.myWaitingCount.initiate());
    expect(r.data).toBe(3);
    const url = new URL(global.fetch.mock.calls[0][0].url);
    expect(url.pathname).toBe('/api/visits/mine');
    expect(url.searchParams.get('scope')).toBe('waiting');
  });
});

describe('push routing', () => {
  test('a visit notification opens the visitor: gate → Inside, host → My visitors', () => {
    const gate = signedInStore('security');
    gate.dispatch(
      pushOpened({
        data: { type: 'visit', id: base.id, notificationId: 'n1' },
      }),
    );
    const nav = { isReady: () => true, navigate: jest.fn() };
    expect(gate.dispatch(routePendingOpen(nav))).toBe(true);
    expect(nav.navigate).toHaveBeenNthCalledWith(1, 'Main', {
      screen: 'Inside',
    });
    expect(nav.navigate).toHaveBeenNthCalledWith(2, 'VisitDetails', {
      id: base.id,
    });

    const host = signedInStore('host');
    host.dispatch(pushOpened({ data: { type: 'visit', id: base.id } }));
    const nav2 = { isReady: () => true, navigate: jest.fn() };
    host.dispatch(routePendingOpen(nav2));
    expect(nav2.navigate).toHaveBeenNthCalledWith(1, 'Main', {
      screen: 'MyVisitors',
    });
    expect(nav2.navigate).toHaveBeenNthCalledWith(2, 'VisitDetails', {
      id: base.id,
    });
  });

  test('visit notices dedupe on their own key', () => {
    expect(routeNoticeKey({ type: 'visit', id: 'GB-1' })).toBe('visit:GB-1');
    expect(routeNoticeKey({ type: 'mail', id: 'ML-1' })).toBe('mail:ML-1');
  });
});

describe('realtime', () => {
  test('a visit event refreshes My visitors and patches the host’s cached visit', async () => {
    global.fetch = jest.fn(() => json(200, { visit: base }));
    const store = signedInStore('host');
    await store.dispatch(api.endpoints.getMyVisit.initiate(base.id));
    store.dispatch(visitEvent({ ...base, hostStatus: 'accepted' }));
    const cached = api.endpoints.getMyVisit.select(base.id)(store.getState());
    expect(cached.data.hostStatus).toBe('accepted');
    // Record what the batched invalidation dispatches.
    const actions = [];
    flushRealtimeBatch(a => {
      actions.push(a);
      return store.dispatch(a);
    });
    const invalidated = actions.find(a => api.util.invalidateTags.match(a));
    expect(invalidated.payload).toEqual(
      expect.arrayContaining(['MyVisitors', 'Inside', 'Visit', 'Stats']),
    );
  });

  test('a visit_arrived notification toasts its title and body', () => {
    const store = signedInStore('host');
    store.dispatch(
      notificationNewEvent({
        notification: {
          id: 'n1',
          event: 'visit_arrived',
          title: '🚪 Anil Rao is at the gate',
          body: 'Acme · Meeting · tap to accept or decline',
          data: { type: 'visit', id: base.id },
        },
        unreadCount: 1,
      }),
    );
    expect(store.getState().ui.toast.message).toBe(
      '🚪 Anil Rao is at the gate · Acme · Meeting · tap to accept or decline',
    );
  });
});
