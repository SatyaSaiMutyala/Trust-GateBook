import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { API_URL } from '../api/config';
import { cleanParams } from '../api/query';
import { DEFAULT_PAGE_SIZE } from '../types';
import { loggedOut, userUpdated } from './authSlice';
import { settingsReceived } from './settingsSlice';
import { selectSite } from './siteSlice';

/** Every tag type. Socket events and mutations invalidate these. */
export const TAGS = [
  'Visit',
  'Inside',
  'Stats',
  'Mail',
  'MailCounts',
  'Settings',
  'Users',
  'Hosts',
  'Me',
  'Notifications',
  'UnreadCount',
  'MyVisitors',
  'Expected',
  'Material',
  'Keys',
  'MyKeys',
  'Incidents',
  'Patrol',
  'Gen',
  'Track',
];

const rawBaseQuery = fetchBaseQuery({
  baseUrl: API_URL,
  prepareHeaders: (headers, { getState }) => {
    const token = getState().auth.token;
    if (token) headers.set('Authorization', `Bearer ${token}`);
    headers.set('Accept', 'application/json');
    return headers;
  },
});

/**
 * Normalises errors to `{ status, code, message, field?, item? }` from the contract's
 * `{ error: { code, message, field } }` body; signs out on any 401 while signed in.
 */
/** Endpoints whose 401 means "wrong password", not "session expired". */
const PASSWORD_CHECK_ENDPOINTS = new Set(['deleteMe']);

/** Gate-desk lists that follow the gate this phone works at. */
const GATE_LISTS = new Set([
  '/api/track',
  '/api/visits/inside',
  '/api/stats/overview',
  '/api/mail',
  '/api/material',
  '/api/keys',
  '/api/keymoves',
  '/api/incidents',
  '/api/patrol',
  '/api/patrol/log',
  '/api/gen',
]);
/** New records stamped with the gate. */
const GATE_FORMS = new Set(['/api/visits', '/api/mail', '/api/material']);

/**
 * Adds the gate (several gates only) to gate-desk lists and to new visits / post / material. Explicit `site`
 * params win; "My post" (`recipient`) is never filtered.
 */
export function withSite(args, site) {
  if (!site) return args;
  const a = typeof args === 'string' ? { url: args } : args;
  const [path] = String(a.url).split('?');
  const method = (a.method ?? 'GET').toUpperCase();
  if (method === 'GET' && GATE_LISTS.has(path)) {
    const params = a.params ?? {};
    if (params.site !== undefined || params.recipient !== undefined) return a;
    return { ...a, params: { ...params, site } };
  }
  if (method === 'POST' && GATE_FORMS.has(path) && a.body instanceof FormData) {
    // React Native's FormData keeps `_parts`; the standard one has `has()`.
    const has =
      typeof a.body.has === 'function'
        ? a.body.has('site')
        : (a.body._parts ?? []).some(([k]) => k === 'site');
    if (!has) a.body.append('site', site);
  }
  return a;
}

export const baseQuery = async (args, apiCtx, extra) => {
  const result = await rawBaseQuery(
    withSite(args, selectSite(apiCtx.getState())),
    apiCtx,
    extra,
  );
  if (!result.error) return result;
  const { status, data } = result.error;
  if (status === 'FETCH_ERROR' || status === 'TIMEOUT_ERROR') {
    return {
      error: {
        status: 0,
        code: 'network',
        message: `Cannot reach the server at ${API_URL}. Check the connection.`,
      },
    };
  }
  if (status === 'PARSING_ERROR') {
    const code = result.error.originalStatus;
    return {
      error: {
        status: code,
        code: 'internal',
        message: `Request failed (${code}).`,
      },
    };
  }
  const body = data && data.error ? data.error : null;
  // A 401 means the session is gone — except where 401 answers a password check
  // (DELETE /api/auth/me → "Wrong password."), which must stay inside the dialog.
  if (
    status === 401 &&
    apiCtx.getState().auth.token &&
    !PASSWORD_CHECK_ENDPOINTS.has(apiCtx.endpoint)
  )
    apiCtx.dispatch(loggedOut());
  return {
    error: {
      status,
      code: body?.code ?? (status === 401 ? 'unauthorized' : 'internal'),
      message: body?.message ?? `Request failed (${status}).`,
      field: body?.field,
      item: body?.item,
      // Host-approval conflicts carry the current visit (e.g. security already confirmed by phone).
      visit: body?.visit,
    },
  };
};

/** Error message for the guard, from an RTK Query error or any thrown value. */
export function errorMessage(e) {
  if (!e) return 'Something went wrong.';
  if (typeof e.message === 'string') return e.message;
  if (e.error && typeof e.error === 'string') return e.error;
  return 'Something went wrong.';
}

/** Infinite-query options for every paginated list (docs/API.md "Pagination & query params"). */
const pages = {
  initialPageParam: 1,
  getNextPageParam: (lastPage, _all, lastPageParam) =>
    lastPage?.pagination?.hasNextPage ? lastPageParam + 1 : undefined,
};
const listQuery =
  url =>
  ({ queryArg, pageParam }) => ({
    url,
    params: cleanParams({
      limit: DEFAULT_PAGE_SIZE,
      ...queryArg,
      page: pageParam,
    }),
  });

function multipart(fields, files) {
  const form = new FormData();
  Object.entries(fields).forEach(([k, v]) => {
    if (v !== undefined && v !== null) form.append(k, String(v));
  });
  // React Native's FormData takes { uri, name, type } file parts.
  files.forEach(([key, uri, name]) => {
    if (uri) form.append(key, { uri, name, type: 'image/jpeg' });
  });
  return form;
}

/**
 * Multipart body for POST /api/mail: fields plus the three required photos —
 * `cover` (front), `coverBack` (back) and `person` (delivery person).
 */
export function mailFormData(input) {
  const fields = {
    kind: input.kind,
    sender: input.sender,
    refNo: input.refNo,
    carrier: input.carrier,
    broughtBy: input.broughtBy,
    broughtPhone: input.broughtPhone,
    pieces: input.pieces,
    dept: input.dept,
    notes: input.notes,
  };
  if (input.recipientId) fields.recipientId = input.recipientId;
  else fields.recipientName = input.recipientName;
  return multipart(fields, [
    ['cover', input.coverUri, 'cover.jpg'],
    ['coverBack', input.coverBackUri, 'cover-back.jpg'],
    ['person', input.personUri, 'person.jpg'],
  ]);
}

export const api = createApi({
  reducerPath: 'api',
  baseQuery,
  tagTypes: TAGS,
  keepUnusedDataFor: 30,
  endpoints: build => ({
    // ---------------- auth ----------------
    login: build.mutation({
      query: body => ({ url: '/api/auth/login', method: 'POST', body }),
    }),

    // ---------------- feature switches, sign-up, account deletion ----------------
    /** Public: `{ features: { signup, accountDeletion } }`. Loaded before login and on return to foreground. */
    getConfig: build.query({
      query: () => '/api/config',
      transformResponse: res => ({
        signup: !!res?.features?.signup,
        accountDeletion: !!res?.features?.accountDeletion,
      }),
    }),
    /** Public: company name + logo for the sign-in screen → `{ name, logoUrl }`. */
    getBrand: build.query({
      query: () => '/api/brand',
      keepUnusedDataFor: 600,
    }),
    /** Public: `{ name, email, phone, password, dept? }` → `{ message }` (creates a pending account). */
    signup: build.mutation({
      query: body => ({ url: '/api/auth/signup', method: 'POST', body }),
    }),
    /** `{ password }` → `{ ok }`. 401 = wrong password (does not sign out), 409 = last admin. */
    deleteMe: build.mutation({
      query: body => ({ url: '/api/auth/me', method: 'DELETE', body }),
    }),

    // ---------------- push devices (FCM) ----------------
    /** `{ token, platform: 'android' | 'ios' }` — upsert this device's FCM token for the signed-in user. */
    registerDevice: build.mutation({
      query: body => ({ url: '/api/devices', method: 'POST', body }),
    }),
    /** Remove this device's FCM token (sign-out). */
    unregisterDevice: build.mutation({
      query: token => ({
        url: `/api/devices/${encodeURIComponent(token)}`,
        method: 'DELETE',
      }),
    }),
    // ---------------- in-app notifications (inbox) ----------------
    /** Paginated own notifications, newest first. Query: unread ('true'), limit. Response adds `unreadCount`. */
    listNotifications: build.infiniteQuery({
      query: listQuery('/api/notifications'),
      infiniteQueryOptions: pages,
      providesTags: ['Notifications'],
    }),
    /** Bell badge: `{ count }` → number. */
    unreadCount: build.query({
      query: () => '/api/notifications/unread-count',
      transformResponse: res => res?.count ?? 0,
      providesTags: ['UnreadCount'],
    }),
    markNotificationRead: build.mutation({
      query: id => ({
        url: `/api/notifications/${encodeURIComponent(id)}/read`,
        method: 'POST',
        body: {},
      }),
      async onQueryStarted(id, { dispatch, getState, queryFulfilled }) {
        const undo = applyNotificationRead(dispatch, getState, id);
        try {
          const { data } = await queryFulfilled;
          if (typeof data?.unreadCount === 'number')
            dispatch(setUnreadCount(data.unreadCount));
        } catch {
          undo();
        }
      },
    }),
    markAllNotificationsRead: build.mutation({
      query: () => ({
        url: '/api/notifications/read-all',
        method: 'POST',
        body: {},
      }),
      async onQueryStarted(_arg, { dispatch, getState, queryFulfilled }) {
        const undo = applyNotificationRead(dispatch, getState, 'all');
        try {
          await queryFulfilled;
          dispatch(setUnreadCount(0));
        } catch {
          undo();
        }
      },
    }),

    me: build.query({
      query: () => '/api/auth/me',
      providesTags: ['Me'],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(userUpdated(data.user));
        } catch {
          // 401 is handled by the base query
        }
      },
    }),
    updateMe: build.mutation({
      query: body => ({ url: '/api/auth/me', method: 'PATCH', body }),
      invalidatesTags: ['Me', 'Hosts'],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        const { data } = await queryFulfilled;
        dispatch(userUpdated(data.user));
      },
    }),

    // ---------------- users & hosts ----------------
    listUsers: build.infiniteQuery({
      query: listQuery('/api/users'),
      infiniteQueryOptions: pages,
      providesTags: ['Users'],
    }),
    /** Pending sign-up: approve with a role (default Employee). */
    approveUser: build.mutation({
      query: ({ id, role }) => ({
        url: `/api/users/${encodeURIComponent(id)}/approve`,
        method: 'POST',
        body: role ? { role } : {},
      }),
      invalidatesTags: ['Users', 'Hosts'],
    }),
    /** Pending sign-up: reject (deletes the request). */
    rejectUser: build.mutation({
      query: id => ({
        url: `/api/users/${encodeURIComponent(id)}/reject`,
        method: 'POST',
        body: {},
      }),
      invalidatesTags: ['Users'],
    }),
    createUser: build.mutation({
      query: body => ({ url: '/api/users', method: 'POST', body }),
      invalidatesTags: ['Users', 'Hosts'],
    }),
    updateUser: build.mutation({
      query: ({ id, ...body }) => ({
        url: `/api/users/${encodeURIComponent(id)}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Users', 'Hosts'],
    }),
    /** Everyone, minimal (admin): org chart, reports-to pickers. */
    orgUsers: build.query({
      query: () => '/api/users/org',
      transformResponse: res => res?.users ?? [],
      providesTags: ['Users'],
    }),
    /** The module registry for the person editor (admin). */
    moduleDefs: build.query({
      query: () => '/api/users/modules',
      transformResponse: res => res?.modules ?? [],
      keepUnusedDataFor: 600,
    }),
    listHosts: build.infiniteQuery({
      query: listQuery('/api/hosts'),
      infiniteQueryOptions: pages,
      providesTags: ['Hosts'],
    }),

    // ---------------- settings ----------------
    getSettings: build.query({
      query: () => '/api/settings',
      providesTags: ['Settings'],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(settingsReceived(data.settings));
        } catch {
          // keep defaults
        }
      },
    }),
    putSettings: build.mutation({
      query: body => ({ url: '/api/settings', method: 'PUT', body }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        const { data } = await queryFulfilled;
        dispatch(settingsReceived(data.settings));
      },
      invalidatesTags: ['Settings'],
    }),

    // ---------------- visits ----------------
    listVisits: build.infiniteQuery({
      query: listQuery('/api/visits'),
      infiniteQueryOptions: pages,
      providesTags: ['Visit'],
    }),
    inside: build.infiniteQuery({
      query: listQuery('/api/visits/inside'),
      infiniteQueryOptions: pages,
      providesTags: ['Inside'],
    }),
    /** Inside-now count for the tab badge: `/api/visits/inside?limit=1` → pagination.total. */
    insideCount: build.query({
      query: () => ({
        url: '/api/visits/inside',
        params: { limit: 1, page: 1 },
      }),
      transformResponse: res => res?.pagination?.total ?? 0,
      providesTags: ['Inside'],
    }),
    lookup: build.infiniteQuery({
      query: ({ queryArg, pageParam }) => ({
        url: '/api/visits/lookup',
        params: cleanParams({ limit: 5, ...queryArg, page: pageParam }),
      }),
      infiniteQueryOptions: pages,
      providesTags: ['Visit'],
    }),
    badgeCheck: build.query({
      query: badge => ({
        url: '/api/visits/badge-check',
        params: { badge },
      }),
      keepUnusedDataFor: 0,
      providesTags: ['Inside'],
    }),
    getVisit: build.query({
      query: id => `/api/visits/${encodeURIComponent(id)}`,
      transformResponse: res => res.visit,
      providesTags: (_r, _e, id) => [{ type: 'Visit', id }],
    }),
    checkIn: build.mutation({
      query: input => ({
        url: '/api/visits',
        method: 'POST',
        body: multipart(
          {
            badge: input.badge,
            phone: input.phone,
            name: input.name,
            company: input.company,
            persons: input.persons,
            purpose: input.purpose,
            // A picked employee is asked to accept in the app; a typed name is confirmed by phone.
            ...(input.hostId ? { hostId: input.hostId } : { host: input.host }),
            dept: input.dept,
            idType: input.idType,
            idLast4: input.idLast4,
            vehicle: input.vehicle,
            items: input.items,
            notes: input.notes,
            // Filled from a pre-registration: marks it arrived and may pre-approve the host.
            expectedId: input.expectedId,
            // Only sent when Settings → Terms requires agreement.
            termsAccepted: input.termsAccepted,
          },
          [
            ['photo', input.photoUri, 'photo.jpg'],
            ['idPhoto', input.idPhotoUri, 'id.jpg'],
          ],
        ),
      }),
      invalidatesTags: ['Visit', 'Inside', 'Stats', 'MyVisitors', 'Expected'],
    }),
    /**
     * Gate alert rows: open visits security must act on now (host accepted / declined / no reply / not on
     * TruSentinel) — `/api/visits/inside?attention=true&limit=5` → `{ data, total }`.
     */
    attention: build.query({
      query: () => ({
        url: '/api/visits/inside',
        params: { attention: 'true', limit: 5, page: 1 },
      }),
      transformResponse: res => ({
        data: res?.data ?? [],
        total: res?.pagination?.total ?? 0,
      }),
      providesTags: ['Inside'],
    }),
    /** Security lets the visitor in: after the host accepted, or `viaPhone` when confirmed by phone. */
    allowVisit: build.mutation({
      query: ({ id, viaPhone }) => ({
        url: `/api/visits/${encodeURIComponent(id)}/allow`,
        method: 'POST',
        body: viaPhone ? { viaPhone: true } : {},
      }),
      // A conflict carries the current visit in error.visit, so refresh either way.
      invalidatesTags: (_r, _e, { id }) => [
        { type: 'Visit', id },
        'Visit',
        'Inside',
        'Stats',
        'MyVisitors',
      ],
    }),
    /** My own visitors (as host). Query: scope (all | waiting | current | earlier). Response adds `counts`. */
    myVisits: build.infiniteQuery({
      query: listQuery('/api/visits/mine'),
      infiniteQueryOptions: pages,
      providesTags: ['MyVisitors'],
    }),
    /** Tab badge: how many of my visitors are waiting for my answer. */
    myWaitingCount: build.query({
      query: () => ({
        url: '/api/visits/mine',
        params: { scope: 'waiting', limit: 1, page: 1 },
      }),
      transformResponse: res => res?.counts?.waiting ?? 0,
      providesTags: ['MyVisitors'],
    }),
    /** One of my own visitors (hosts can't read the gate register). */
    getMyVisit: build.query({
      query: id => `/api/visits/mine/${encodeURIComponent(id)}`,
      transformResponse: res => res.visit,
      providesTags: (_r, _e, id) => [{ type: 'Visit', id }],
    }),
    /** The host accepts or declines: `{ id, status: 'accepted' | 'declined', note? }`. */
    respondVisit: build.mutation({
      query: ({ id, ...body }) => ({
        url: `/api/visits/${encodeURIComponent(id)}/respond`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: 'Visit', id },
        'MyVisitors',
        'Inside',
        'Stats',
      ],
    }),
    /** (Re)create the agreement PDF of a visit that accepted the terms → the visit. */
    makeAgreement: build.mutation({
      query: id => ({
        url: `/api/visits/${encodeURIComponent(id)}/agreement`,
        method: 'POST',
        body: {},
      }),
      transformResponse: res => res.visit,
      invalidatesTags: (_r, _e, id) => [{ type: 'Visit', id }, 'Visit'],
    }),
    exitVisit: build.mutation({
      query: ({ id, ...body }) => ({
        url: `/api/visits/${encodeURIComponent(id)}/exit`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: 'Visit', id },
        'Visit',
        'Inside',
        'Stats',
      ],
    }),

    // ---------------- expected visitors & deliveries ----------------
    /** Query: when (all | today | upcoming | earlier), kind, q. Response adds `counts.today`. */
    listExpected: build.infiniteQuery({
      query: ({ queryArg, pageParam }) => ({
        url: '/api/expected',
        params: cleanParams({
          limit: DEFAULT_PAGE_SIZE,
          tzOffset: new Date().getTimezoneOffset(),
          ...queryArg,
          page: pageParam,
        }),
      }),
      infiniteQueryOptions: pages,
      providesTags: ['Expected'],
    }),
    /** Nav badge: entries still expected today (gate: everyone's; others: their own). */
    expectedTodayCount: build.query({
      query: () => ({
        url: '/api/expected',
        params: {
          when: 'today',
          limit: 1,
          page: 1,
          tzOffset: new Date().getTimezoneOffset(),
        },
      }),
      transformResponse: res => res?.counts?.today ?? 0,
      providesTags: ['Expected'],
    }),
    /** Gate: an open pre-registration for this mobile number today, or null. */
    expectedMatch: build.query({
      query: phone => ({ url: '/api/expected/match', params: { phone } }),
      transformResponse: res => res?.expected ?? null,
      providesTags: ['Expected'],
    }),
    getExpected: build.query({
      query: id => `/api/expected/${encodeURIComponent(id)}`,
      transformResponse: res => res.expected,
      providesTags: (_r, _e, id) => [{ type: 'Expected', id }],
    }),
    createExpected: build.mutation({
      query: body => ({ url: '/api/expected', method: 'POST', body }),
      transformResponse: res => res.expected,
      invalidatesTags: ['Expected', 'Stats'],
    }),
    updateExpected: build.mutation({
      query: ({ id, ...body }) => ({
        url: `/api/expected/${encodeURIComponent(id)}`,
        method: 'PATCH',
        body,
      }),
      transformResponse: res => res.expected,
      invalidatesTags: ['Expected', 'Stats'],
    }),
    cancelExpected: build.mutation({
      query: id => ({
        url: `/api/expected/${encodeURIComponent(id)}/cancel`,
        method: 'POST',
        body: {},
      }),
      transformResponse: res => res.expected,
      invalidatesTags: ['Expected', 'Stats'],
    }),
    /** Security: an expected delivery has come in. */
    receivedExpected: build.mutation({
      query: id => ({
        url: `/api/expected/${encodeURIComponent(id)}/received`,
        method: 'POST',
        body: {},
      }),
      transformResponse: res => res.expected,
      invalidatesTags: ['Expected', 'Stats'],
    }),

    // ---------------- material gate passes ----------------
    /**
     * Gate: tab today | accept | gate | open | overdue | all (+ days); employees: tab todo | sent | in | all.
     * Both: dir, visitId, q. Response adds `counts`.
     */
    listMaterial: build.infiniteQuery({
      query: ({ queryArg, pageParam }) => ({
        url: '/api/material',
        params: cleanParams({
          limit: DEFAULT_PAGE_SIZE,
          tzOffset: new Date().getTimezoneOffset(),
          ...queryArg,
          page: pageParam,
        }),
      }),
      infiniteQueryOptions: pages,
      providesTags: ['Material'],
    }),
    /** Counts only: `{ counts }` for the tabs / badges. */
    materialCounts: build.query({
      query: tab => ({
        url: '/api/material',
        params: {
          tab,
          limit: 1,
          page: 1,
          tzOffset: new Date().getTimezoneOffset(),
        },
      }),
      transformResponse: res => res?.counts ?? {},
      providesTags: ['Material'],
    }),
    materialVisitors: build.query({
      query: () => '/api/material/visitors',
      transformResponse: res => res?.data ?? [],
      keepUnusedDataFor: 0,
    }),
    getMaterial: build.query({
      query: id => `/api/material/${encodeURIComponent(id)}`,
      transformResponse: res => res.pass,
      providesTags: (_r, _e, id) => [{ type: 'Material', id }],
    }),
    /** Multipart: fields + challan[] / boxPhoto[] / carrier (local URIs). */
    createMaterial: build.mutation({
      query: ({ fields, challan = [], boxPhotos = [], carrier = null }) => ({
        url: '/api/material',
        method: 'POST',
        body: multipart(fields, [
          ...challan.map((u, i) => ['challan', u, `challan-${i}.jpg`]),
          ...boxPhotos.map((u, i) => ['boxPhoto', u, `boxes-${i}.jpg`]),
          ['carrier', carrier, 'carrier.jpg'],
        ]),
      }),
      transformResponse: res => res.pass,
      invalidatesTags: ['Material', 'Expected'],
    }),
    materialAction: build.mutation({
      /** `{ id, action: receipt | decision | drop | cancel | remind, body }` */
      query: ({ id, action, body = {} }) => ({
        url: `/api/material/${encodeURIComponent(id)}/${action}`,
        method: 'POST',
        body,
      }),
      transformResponse: res => res.pass ?? null,
      invalidatesTags: (_r, _e, { id }) => [
        { type: 'Material', id },
        'Material',
      ],
    }),
    /** Multipart release / return: `{ id, action, fields, photo }` */
    materialUpload: build.mutation({
      query: ({ id, action, fields, photo = null }) => ({
        url: `/api/material/${encodeURIComponent(id)}/${action}`,
        method: 'POST',
        body: multipart(fields, [
          [action === 'return' ? 'returnPhoto' : 'carrier', photo, 'photo.jpg'],
        ]),
      }),
      transformResponse: res => res.pass,
      invalidatesTags: (_r, _e, { id }) => [
        { type: 'Material', id },
        'Material',
      ],
    }),

    // ---------------- key register ----------------
    /** The key board: `{ keys (each with `out`), counts { total, out, available, overdue } }`. */
    keyBoard: build.query({
      query: () => '/api/keys',
      providesTags: ['Keys'],
    }),
    /** Key diary: period today | 7d | 30d | 90d, state all | out | overdue | returned, q. Adds `counts`. */
    keyDiary: build.infiniteQuery({
      query: ({ queryArg, pageParam }) => ({
        url: '/api/keymoves',
        params: cleanParams({
          limit: DEFAULT_PAGE_SIZE,
          tzOffset: new Date().getTimezoneOffset(),
          ...queryArg,
          page: pageParam,
        }),
      }),
      infiniteQueryOptions: pages,
      providesTags: ['Keys'],
    }),
    /** `{ id, body: { takerId?, takerName, takerPhone, purpose, dueAt? } }` → `{ move, key }` */
    issueKey: build.mutation({
      query: ({ id, body }) => ({
        url: `/api/keys/${encodeURIComponent(id)}/issue`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Keys', 'Stats'],
    }),
    /** `{ moveId, body: { returnedByName, note } }` → `{ move, key }` */
    returnKey: build.mutation({
      query: ({ moveId, body }) => ({
        url: `/api/keymoves/${encodeURIComponent(moveId)}/return`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Keys', 'Stats'],
    }),
    /** Keys issued to me (any role): `{ data (still with me), returned (last 7 days), counts { out, overdue } }`. */
    myKeys: build.query({
      query: () => '/api/mykeys',
      providesTags: ['MyKeys'],
    }),

    // ---------------- incidents ----------------
    /** tab open | closed | all, severity, q. Adds `counts { open, closed, critical }`. */
    listIncidents: build.infiniteQuery({
      query: listQuery('/api/incidents'),
      infiniteQueryOptions: pages,
      providesTags: ['Incidents'],
    }),
    getIncident: build.query({
      query: id => `/api/incidents/${encodeURIComponent(id)}`,
      transformResponse: res => res.incident,
      providesTags: (_r, _e, id) => [{ type: 'Incidents', id }],
    }),
    /** People an incident can be given to (security / admin). */
    incidentAssignees: build.query({
      query: () => '/api/incidents/assignees',
      transformResponse: res => res?.data ?? [],
    }),
    /** Multipart: fields + photos (local URIs, ≤ 3). */
    reportIncident: build.mutation({
      query: ({ fields, photos = [] }) => ({
        url: '/api/incidents',
        method: 'POST',
        body: multipart(
          fields,
          photos.map((u, i) => ['photos', u, `incident-${i}.jpg`]),
        ),
      }),
      transformResponse: res => res.incident,
      invalidatesTags: ['Incidents', 'Stats'],
    }),
    /** `{ id, action: update | close | reopen, body }` */
    incidentAction: build.mutation({
      query: ({ id, action, body = {} }) => ({
        url: `/api/incidents/${encodeURIComponent(id)}/${action}`,
        method: 'POST',
        body,
      }),
      transformResponse: res => res.incident,
      invalidatesTags: (_r, _e, { id }) => [
        { type: 'Incidents', id },
        'Incidents',
        'Stats',
      ],
    }),

    // ---------------- TRACK ----------------
    /** `{ items, counts { total, urgent, byCat }, cats, expectedSoon, materialInProgress }` for this gate. */
    track: build.query({
      query: () => '/api/track',
      providesTags: ['Track'],
    }),

    // ---------------- patrols ----------------
    /** `{ checkpoints, rounds, slots (12 h back … 12 h ahead), now }` */
    patrolBoard: build.query({
      query: () => '/api/patrol',
      providesTags: ['Patrol'],
    }),
    /** Late & missed log `{ data, summary }`: days 1 | 7 | 30 | 90, filter problems | all. */
    patrolLog: build.query({
      query: params => ({ url: '/api/patrol/log', params }),
      providesTags: ['Patrol'],
    }),
    patrolScans: build.infiniteQuery({
      query: listQuery('/api/patrol/scans'),
      infiniteQueryOptions: pages,
      providesTags: ['Patrol'],
    }),
    patrolLookup: build.query({
      query: code => ({ url: '/api/patrol/lookup', params: { code } }),
      keepUnusedDataFor: 0,
    }),
    /** Multipart `{ fields: { code, status, note, manual }, photo }` → `{ scan, checkpoint, slot, round, done, total, missing }` */
    patrolScan: build.mutation({
      query: ({ fields, photo = null }) => ({
        url: '/api/patrol/scan',
        method: 'POST',
        body: multipart(fields, [['scanPhoto', photo, 'scan.jpg']]),
      }),
      invalidatesTags: ['Patrol', 'Stats'],
    }),

    // ---------------- generator & diesel ----------------
    genStatus: build.query({
      query: () => '/api/gen',
      providesTags: ['Gen'],
    }),
    genRuns: build.infiniteQuery({
      query: listQuery('/api/gen/runs'),
      infiniteQueryOptions: pages,
      providesTags: ['Gen'],
    }),
    /** `{ id, action: 'start', body }` or `{ runId, action: 'stop', body }` */
    genRun: build.mutation({
      query: ({ id, runId, action, body = {} }) => ({
        url:
          action === 'stop'
            ? `/api/gen/runs/${encodeURIComponent(runId)}/stop`
            : `/api/gen/${encodeURIComponent(id)}/start`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Gen', 'Stats'],
    }),
    /** Multipart diesel fill / level check: `{ id, fields, photo }` */
    genFuel: build.mutation({
      query: ({ id, fields, photo = null }) => ({
        url: `/api/gen/${encodeURIComponent(id)}/fuel`,
        method: 'POST',
        body: multipart(fields, [['genPhoto', photo, 'gen.jpg']]),
      }),
      invalidatesTags: ['Gen', 'Stats'],
    }),

    // ---------------- stats ----------------
    overview: build.query({
      query: () => ({
        url: '/api/stats/overview',
        params: { tzOffset: new Date().getTimezoneOffset() },
      }),
      transformResponse: res => res.overview,
      providesTags: ['Stats'],
    }),

    // ---------------- post room ----------------
    listMail: build.infiniteQuery({
      query: listQuery('/api/mail'),
      infiniteQueryOptions: pages,
      providesTags: ['Mail'],
    }),
    /** Tab-badge counts `{ lodged, handed, disputed }` from `/api/mail?limit=1` (whole register, or recipient=me for employees). */
    mailCounts: build.query({
      query: scope => ({
        url: '/api/mail',
        params: cleanParams({ ...scope, limit: 1, page: 1 }),
      }),
      transformResponse: res => ({
        lodged: 0,
        handed: 0,
        disputed: 0,
        ...(res?.counts ?? {}),
      }),
      providesTags: ['MailCounts'],
    }),
    getMail: build.query({
      query: id => `/api/mail/${encodeURIComponent(id)}`,
      transformResponse: res => res.item,
      providesTags: (_r, _e, id) => [{ type: 'Mail', id }],
    }),
    createMail: build.mutation({
      query: input => ({
        url: '/api/mail',
        method: 'POST',
        body: mailFormData(input),
      }),
      invalidatesTags: ['Mail', 'MailCounts'],
    }),
    remindMail: build.mutation({
      query: id => ({
        url: `/api/mail/${encodeURIComponent(id)}/remind`,
        method: 'POST',
        body: {},
      }),
      invalidatesTags: (_r, _e, id) => [{ type: 'Mail', id }, 'Mail'],
    }),
    handoverMail: build.mutation({
      query: ({ id, ...body }) => ({
        url: `/api/mail/${encodeURIComponent(id)}/handover`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: 'Mail', id },
        'Mail',
        'MailCounts',
      ],
    }),
    confirmMail: build.mutation({
      query: ({ id, ...body }) => ({
        url: `/api/mail/${encodeURIComponent(id)}/confirm`,
        method: 'POST',
        body,
      }),
      // A conflict carries the current item in error.item, so refresh either way.
      invalidatesTags: (_r, _e, { id }) => [
        { type: 'Mail', id },
        'Mail',
        'MailCounts',
      ],
    }),
    resolveMail: build.mutation({
      query: ({ id, ...body }) => ({
        url: `/api/mail/${encodeURIComponent(id)}/resolve`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: 'Mail', id },
        'Mail',
        'MailCounts',
      ],
    }),
  }),
});

export const {
  useLoginMutation,
  useGetConfigQuery,
  useGetBrandQuery,
  useSignupMutation,
  useDeleteMeMutation,
  useApproveUserMutation,
  useRejectUserMutation,
  useListNotificationsInfiniteQuery,
  useUnreadCountQuery,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
  useRegisterDeviceMutation,
  useUnregisterDeviceMutation,
  useMeQuery,
  useUpdateMeMutation,
  useListUsersInfiniteQuery,
  useCreateUserMutation,
  useUpdateUserMutation,
  useListHostsInfiniteQuery,
  useOrgUsersQuery,
  useModuleDefsQuery,
  useGetSettingsQuery,
  usePutSettingsMutation,
  useListVisitsInfiniteQuery,
  useInsideInfiniteQuery,
  useInsideCountQuery,
  useLookupInfiniteQuery,
  useBadgeCheckQuery,
  useGetVisitQuery,
  useCheckInMutation,
  useAttentionQuery,
  useAllowVisitMutation,
  useMyVisitsInfiniteQuery,
  useMyWaitingCountQuery,
  useGetMyVisitQuery,
  useRespondVisitMutation,
  useExitVisitMutation,
  useMakeAgreementMutation,
  useListMaterialInfiniteQuery,
  useMaterialCountsQuery,
  useMaterialVisitorsQuery,
  useGetMaterialQuery,
  useCreateMaterialMutation,
  useMaterialActionMutation,
  useMaterialUploadMutation,
  useKeyBoardQuery,
  useKeyDiaryInfiniteQuery,
  useIssueKeyMutation,
  useReturnKeyMutation,
  useMyKeysQuery,
  useListIncidentsInfiniteQuery,
  useGetIncidentQuery,
  useIncidentAssigneesQuery,
  useReportIncidentMutation,
  useIncidentActionMutation,
  useTrackQuery,
  usePatrolBoardQuery,
  usePatrolLogQuery,
  usePatrolScansInfiniteQuery,
  useLazyPatrolLookupQuery,
  usePatrolScanMutation,
  useGenStatusQuery,
  useGenRunsInfiniteQuery,
  useGenRunMutation,
  useGenFuelMutation,
  useListExpectedInfiniteQuery,
  useExpectedTodayCountQuery,
  useExpectedMatchQuery,
  useGetExpectedQuery,
  useCreateExpectedMutation,
  useUpdateExpectedMutation,
  useCancelExpectedMutation,
  useReceivedExpectedMutation,
  useOverviewQuery,
  useListMailInfiniteQuery,
  useMailCountsQuery,
  useGetMailQuery,
  useCreateMailMutation,
  useRemindMailMutation,
  useHandoverMailMutation,
  useConfirmMailMutation,
  useResolveMailMutation,
} = api;

// ---------------- notification cache helpers ----------------

/** Writes the bell badge count into the `unreadCount` cache (creates it if needed). */
export const setUnreadCount = count => (dispatch, getState) => {
  const value = Math.max(0, count);
  const entry = api.endpoints.unreadCount.select()(getState());
  if (entry?.data !== undefined) {
    // Existing cache entry (the bell is subscribed): synchronous patch.
    dispatch(api.util.updateQueryData('unreadCount', undefined, () => value));
  } else {
    dispatch(api.util.upsertQueryData('unreadCount', undefined, value));
  }
};

/**
 * Optimistically marks one notification (or 'all') read in every cached notifications list and the badge.
 * Returns an undo function.
 */
export function applyNotificationRead(dispatch, getState, ids) {
  const now = new Date().toISOString();
  const all = ids === 'all';
  const wanted = all ? null : new Set(Array.isArray(ids) ? ids : [ids]);
  let newlyRead = 0;
  let found = false;
  const patches = [];
  const args = api.util.selectCachedArgsForQuery(
    getState(),
    'listNotifications',
  );
  const seen = new Set();
  args.forEach(arg => {
    patches.push(
      dispatch(
        api.util.updateQueryData('listNotifications', arg, draft => {
          draft.pages.forEach(page => {
            (page.data ?? []).forEach(n => {
              if (!all && wanted.has(n.id)) found = true;
              if (!n.readAt && (all || wanted.has(n.id))) {
                n.readAt = now;
                if (!seen.has(n.id)) {
                  seen.add(n.id);
                  newlyRead += 1;
                }
              }
            });
          });
        }),
      ),
    );
  });
  const before = api.endpoints.unreadCount.select()(getState())?.data;
  if (typeof before === 'number') {
    // An id that is not in any loaded page (e.g. opened from a push) is assumed unread; the server's
    // unreadCount in the response corrects it either way.
    const delta = all ? before : found ? newlyRead : wanted.size;
    patches.push(
      dispatch(
        api.util.updateQueryData('unreadCount', undefined, () =>
          Math.max(0, before - delta),
        ),
      ),
    );
  }
  return () => patches.forEach(p => p.undo());
}

const NO_FEATURES = { signup: false, accountDeletion: false };

/** Server feature switches; both false while loading or on error. */
export function useFeatures() {
  const { data } = useGetConfigQuery();
  return data ?? NO_FEATURES;
}
