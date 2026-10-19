/* global Response */
import { makeStore } from '../src/store';
import { api } from '../src/store/api';
import { loggedIn } from '../src/store/authSlice';
import reducer, {
  EMPTY_CHECK_IN,
  checkInCleared,
  checkInPatched,
} from '../src/store/draftsSlice';
import { pushOpened, routeOf, routePendingOpen } from '../src/push/push';
import { resetNotices, routeNoticeKey } from '../src/push/dedupe';
import { expectedEvent, flushRealtimeBatch } from '../src/realtime/events';
import {
  boxesLine,
  checkInPatchFrom,
  expectedStateChip,
  expectedTitle,
  expectedWhen,
  mayManageExpected,
  mayPreRegister,
} from '../src/utils/expected';
import { hostReplyText } from '../src/utils/visit';
import {
  expectedBody,
  initialExpectedForm,
  missingExpectedFields,
} from '../src/screens/ExpectedFormScreen';

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

const visitor = {
  id: 'EX-261019-AAAA',
  code: 'EX-261019-AAAA',
  kind: 'visitor',
  name: 'Anil Rao',
  phone: '9000000001',
  company: 'Sysmex',
  purpose: 'Service / repair',
  persons: 2,
  host: { id: 'h1', name: 'Dr Meera' },
  contact: { id: 'h2', name: 'Lab in-charge' },
  also: [],
  expectedAt: '2026-10-19T09:30:00.000Z',
  untilAt: null,
  vehicle: 'KA01AB1234',
  items: 'Toolkit',
  notes: '',
  preapproved: true,
  boxes: 0,
  challanType: '',
  challanNo: '',
  status: 'expected',
  state: 'expected',
  createdBy: { id: 'h1', name: 'Dr Meera' },
};
const delivery = {
  ...visitor,
  id: 'EX-261019-BBBB',
  code: 'EX-261019-BBBB',
  kind: 'delivery',
  name: '',
  company: 'Reagent Co',
  contact: null,
  preapproved: false,
  boxes: 3,
  challanType: 'Tax invoice',
  challanNo: 'INV/9',
};

beforeEach(() => {
  resetNotices();
  global.fetch = jest.fn(() => json(200, { ok: true }));
});

afterEach(() => {
  global.fetch = undefined;
  jest.clearAllTimers();
});

describe('helpers', () => {
  test('state chips, titles, boxes and when', () => {
    expect(expectedStateChip(visitor)).toMatchObject({
      label: 'Expected',
      tone: 'wait',
    });
    expect(expectedStateChip({ ...visitor, state: 'late' }).tone).toBe('bad');
    expect(
      expectedStateChip({ ...delivery, state: 'arrived', status: 'arrived' })
        .label,
    ).toBe('Received');
    expect(expectedStateChip(delivery).label).toBe('Delivery expected');
    expect(expectedTitle(visitor)).toBe('Anil Rao');
    expect(expectedTitle(delivery)).toBe('Delivery from Reagent Co');
    expect(boxesLine(delivery)).toBe('3 boxes · Tax invoice INV/9');
    expect(
      boxesLine({ ...delivery, boxes: 1, challanType: '', challanNo: '' }),
    ).toBe('1 box');
    expect(boxesLine(visitor)).toBe('');
    expect(expectedWhen(visitor, new Date('2026-10-19T10:00:00.000Z'))).toMatch(
      /^Today, /,
    );
    expect(expectedWhen(visitor, new Date('2026-10-25T10:00:00.000Z'))).toMatch(
      /^19 Oct, /,
    );
  });

  test('who may pre-register and manage', () => {
    expect(mayPreRegister({ role: 'host' })).toBe(true);
    expect(mayPreRegister({ role: 'host', canPreRegister: false })).toBe(false);
    expect(mayPreRegister({ role: 'admin', canPreRegister: false })).toBe(true);
    expect(mayPreRegister({ role: 'viewer' })).toBe(false);
    expect(mayManageExpected(visitor, { id: 'zz', role: 'security' })).toBe(
      true,
    );
    expect(mayManageExpected(visitor, { id: 'h1', role: 'host' })).toBe(true);
    expect(mayManageExpected(visitor, { id: 'h2', role: 'host' })).toBe(false);
    expect(
      mayManageExpected(
        { ...visitor, status: 'arrived' },
        { id: 'h1', role: 'host' },
      ),
    ).toBe(false);
  });

  test('check-in is filled from the entry; the contact is the one asked', () => {
    const p = checkInPatchFrom(visitor, ['Meeting', 'Service / repair']);
    expect(p.form).toMatchObject({
      name: 'Anil Rao',
      phone: '9000000001',
      company: 'Sysmex',
      persons: '2',
      purpose: 'Service / repair',
      host: 'Lab in-charge',
      vehicle: 'KA01AB1234',
    });
    expect(p.hostPick).toMatchObject({ id: 'h2', name: 'Lab in-charge' });
    expect(p.expected.code).toBe(visitor.code);
    // A purpose no longer in settings is left for the guard to pick.
    expect(checkInPatchFrom(visitor, ['Meeting']).form.purpose).toBe('');
    expect(checkInPatchFrom({ ...visitor, contact: null }).hostPick.id).toBe(
      'h1',
    );
    expect(
      hostReplyText({ hostStatus: 'accepted', hostVia: 'preapproved' }),
    ).toBe('Pre-approved');
  });

  test('the draft keeps the linked entry until cleared', () => {
    let s = reducer(undefined, { type: 'init' });
    expect(s.checkIn.expected).toBeNull();
    s = reducer(s, checkInPatched(checkInPatchFrom(visitor)));
    expect(s.checkIn.expected.code).toBe(visitor.code);
    expect(s.checkIn.form.name).toBe('Anil Rao');
    s = reducer(s, checkInPatched({ expected: null }));
    expect(s.checkIn.expected).toBeNull();
    expect(s.checkIn.form.name).toBe('Anil Rao');
    s = reducer(s, checkInCleared());
    expect(s.checkIn).toEqual(EMPTY_CHECK_IN);
  });
});

describe('form', () => {
  const user = { id: 'h1', name: 'Dr Meera', role: 'host' };

  test('a new visitor defaults to me as host, the next half hour and the pre-approved setting', () => {
    const f = initialExpectedForm(null, 'visitor', user, {
      expectedPreapproved: false,
    });
    expect(f.host).toMatchObject({ id: 'h1' });
    expect(f.preapproved).toBe(false);
    expect(f.at.getTime()).toBeGreaterThan(Date.now());
    expect(f.at.getMinutes() % 30).toBe(0);
    expect(
      initialExpectedForm(null, 'visitor', { role: 'security', id: 's' }, {})
        .host,
    ).toBeNull();
  });

  test('required fields per kind', () => {
    const f = initialExpectedForm(null, 'visitor', user, {});
    expect(missingExpectedFields(f)).toEqual({ name: true });
    const d = { ...f, kind: 'delivery' };
    expect(missingExpectedFields(d)).toEqual({ company: true, boxes: true });
    expect(
      missingExpectedFields({
        ...f,
        name: 'A',
        until: new Date(f.at.getTime() - 1),
      }),
    ).toEqual({ until: true });
    expect(missingExpectedFields({ ...f, name: 'A', host: null })).toEqual({
      host: true,
    });
  });

  test('the body clears visitor-only fields for a delivery', () => {
    const f = {
      ...initialExpectedForm(delivery, 'delivery', user, {}),
      items: 'x',
      preapproved: true,
      also: [{ id: 'h3', name: 'X' }],
    };
    const b = expectedBody(f);
    expect(b).toMatchObject({
      company: 'Reagent Co',
      boxes: 3,
      persons: 1,
      items: '',
      preapproved: false,
      contactId: null,
      alsoIds: [],
      hostId: 'h1',
      challanNo: 'INV/9',
    });
    expect(typeof b.expectedAt).toBe('string');
    const v = expectedBody(initialExpectedForm(visitor, 'visitor', user, {}));
    expect(v).toMatchObject({ contactId: 'h2', persons: 2, preapproved: true });
  });
});

describe('API', () => {
  test('list sends when + tzOffset; today count reads counts.today', async () => {
    global.fetch = jest.fn(() =>
      json(200, {
        data: [visitor],
        pagination: { total: 1, hasNextPage: false },
        counts: { today: 4 },
      }),
    );
    const store = signedInStore();
    const r = await store.dispatch(api.endpoints.expectedTodayCount.initiate());
    expect(r.data).toBe(4);
    const url = new URL(global.fetch.mock.calls[0][0].url);
    expect(url.pathname).toBe('/api/expected');
    expect(url.searchParams.get('when')).toBe('today');
    expect(url.searchParams.get('tzOffset')).toBe(
      String(new Date().getTimezoneOffset()),
    );
  });

  test('create / cancel / received / match hit the right endpoints', async () => {
    const calls = [];
    global.fetch = jest.fn(async req => {
      const path = new URL(req.url).pathname;
      calls.push([req.method, path + new URL(req.url).search]);
      return json(path === '/api/expected' ? 201 : 200, { expected: visitor });
    });
    const store = signedInStore();
    const created = await store.dispatch(
      api.endpoints.createExpected.initiate({ kind: 'visitor', hostId: 'h1' }),
    );
    expect(created.data.code).toBe(visitor.code);
    await store.dispatch(api.endpoints.cancelExpected.initiate(visitor.code));
    await store.dispatch(
      api.endpoints.receivedExpected.initiate(delivery.code),
    );
    const m = await store.dispatch(
      api.endpoints.expectedMatch.initiate('9000000001'),
    );
    expect(m.data.code).toBe(visitor.code);
    expect(calls).toEqual([
      ['POST', '/api/expected'],
      ['POST', `/api/expected/${visitor.code}/cancel`],
      ['POST', `/api/expected/${delivery.code}/received`],
      ['GET', '/api/expected/match?phone=9000000001'],
    ]);
  });

  test('check-in sends expectedId when filled from a pre-registration', async () => {
    const bodies = [];
    global.fetch = jest.fn(async req => {
      bodies.push(await req.formData());
      return json(201, { visit: { id: 'GB-1' } });
    });
    const store = signedInStore();
    const common = {
      badge: '7',
      phone: '9000000001',
      name: 'Anil',
      purpose: 'Meeting',
      hostId: 'h2',
      photoUri: 'file:///p.jpg',
    };
    await store.dispatch(
      api.endpoints.checkIn.initiate({ ...common, expectedId: visitor.code }),
    );
    await store.dispatch(api.endpoints.checkIn.initiate(common));
    expect(bodies[0].get('expectedId')).toBe(visitor.code);
    expect(bodies[1].get('expectedId')).toBeNull();
  });
});

describe('push & realtime', () => {
  test('an expected notification opens the list searched for its code', () => {
    expect(routeOf({ data: { type: 'expected', id: visitor.code } })).toEqual({
      type: 'expected',
      id: visitor.code,
    });
    expect(routeNoticeKey({ type: 'expected', id: 'EX-1' })).toBe(
      'expected:EX-1',
    );

    const gate = signedInStore('security');
    gate.dispatch(pushOpened({ data: { type: 'expected', id: visitor.code } }));
    const nav = { isReady: () => true, navigate: jest.fn() };
    expect(gate.dispatch(routePendingOpen(nav))).toBe(true);
    expect(nav.navigate).toHaveBeenCalledWith('Expected', { q: visitor.code });

    const host = signedInStore('host');
    host.dispatch(pushOpened({ data: { type: 'expected', id: visitor.code } }));
    const nav2 = { isReady: () => true, navigate: jest.fn() };
    host.dispatch(routePendingOpen(nav2));
    expect(nav2.navigate).toHaveBeenCalledWith('Main', {
      screen: 'Expected',
      params: { q: visitor.code },
    });
  });

  test('expected:changed patches the cached entry and refreshes the lists', async () => {
    global.fetch = jest.fn(() => json(200, { expected: visitor }));
    const store = signedInStore();
    await store.dispatch(api.endpoints.getExpected.initiate(visitor.code));
    store.dispatch(
      expectedEvent({ ...visitor, status: 'cancelled', state: 'cancelled' }),
    );
    const cached = api.endpoints.getExpected.select(visitor.code)(
      store.getState(),
    );
    expect(cached.data.status).toBe('cancelled');
    const actions = [];
    flushRealtimeBatch(a => {
      actions.push(a);
      return store.dispatch(a);
    });
    const invalidated = actions.find(a => api.util.invalidateTags.match(a));
    expect(invalidated.payload).toEqual(
      expect.arrayContaining(['Expected', 'Stats']),
    );
  });
});
