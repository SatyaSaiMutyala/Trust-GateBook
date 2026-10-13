/* global Response */
import { makeStore } from '../src/store';
import { api } from '../src/store/api';
import { loggedIn } from '../src/store/authSlice';

function jsonResponse(status, body) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

const page = (n, hasNextPage, ids) => ({
  data: ids.map(id => ({ id })),
  pagination: {
    page: n,
    limit: 2,
    total: 3,
    totalPages: 2,
    hasNextPage,
    hasPrevPage: n > 1,
  },
  summary: { persons: 4, inside: 1 },
});

jest.useFakeTimers();

afterEach(() => {
  global.fetch = undefined;
  jest.clearAllTimers();
});

test('infinite list query sends page/limit + bearer token and follows hasNextPage', async () => {
  const calls = [];
  global.fetch = jest.fn(req => {
    calls.push(req);
    const url = new URL(req.url);
    return jsonResponse(
      200,
      url.searchParams.get('page') === '1'
        ? page(1, true, ['a', 'b'])
        : page(2, false, ['b', 'c']),
    );
  });
  const store = makeStore();
  store.dispatch(
    loggedIn({ token: 'tok', user: { id: 'u', role: 'security' } }),
  );
  const arg = { status: 'in', limit: 2 };
  const sub = store.dispatch(api.endpoints.listVisits.initiate(arg));
  await sub;
  await store.dispatch(
    api.endpoints.listVisits.initiate(arg, { direction: 'forward' }),
  );
  const state = api.endpoints.listVisits.select(arg)(store.getState());
  expect(state.data.pages).toHaveLength(2);
  expect(state.hasNextPage).toBe(false);
  expect(calls[0].headers.get('Authorization')).toBe('Bearer tok');
  const first = new URL(calls[0].url);
  expect(first.pathname).toBe('/api/visits');
  expect(first.searchParams.get('status')).toBe('in');
  expect(new URL(calls[1].url).searchParams.get('page')).toBe('2');
  sub.unsubscribe();
});

test('errors are mapped from { error: { code, message, field } } and 401 signs out', async () => {
  global.fetch = jest.fn(() =>
    jsonResponse(409, {
      error: {
        code: 'badge_in_use',
        message: 'Pass 12 is with Ravi Kumar.',
        field: 'badge',
      },
    }),
  );
  const store = makeStore();
  store.dispatch(
    loggedIn({ token: 'tok', user: { id: 'u', role: 'security' } }),
  );
  const res = await store.dispatch(
    api.endpoints.exitVisit.initiate({ id: 'GB-1' }),
  );
  expect(res.error).toEqual(
    expect.objectContaining({
      status: 409,
      code: 'badge_in_use',
      message: 'Pass 12 is with Ravi Kumar.',
      field: 'badge',
    }),
  );

  global.fetch = jest.fn(() =>
    jsonResponse(401, {
      error: { code: 'unauthorized', message: 'Sign in again.' },
    }),
  );
  await store.dispatch(api.endpoints.getVisit.initiate('GB-1'));
  expect(store.getState().auth.token).toBeNull();
});

test('network failures read as a guard-friendly message', async () => {
  global.fetch = jest.fn(() =>
    Promise.reject(new TypeError('Network request failed')),
  );
  const store = makeStore();
  const res = await store.dispatch(api.endpoints.getSettings.initiate());
  expect(res.error.code).toBe('network');
  expect(res.error.message).toMatch(/Cannot reach the server/);
});
