import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { API_URL } from '../api/config';
import { cleanParams } from '../api/query';
import { DEFAULT_PAGE_SIZE } from '../types';
import { loggedOut, userUpdated } from './authSlice';
import { settingsReceived } from './settingsSlice';

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

export const baseQuery = async (args, apiCtx, extra) => {
  const result = await rawBaseQuery(args, apiCtx, extra);
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
            host: input.host,
            dept: input.dept,
            idType: input.idType,
            idLast4: input.idLast4,
            vehicle: input.vehicle,
            items: input.items,
            notes: input.notes,
          },
          [
            ['photo', input.photoUri, 'photo.jpg'],
            ['idPhoto', input.idPhotoUri, 'id.jpg'],
          ],
        ),
      }),
      invalidatesTags: ['Visit', 'Inside', 'Stats'],
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
  useGetSettingsQuery,
  usePutSettingsMutation,
  useListVisitsInfiniteQuery,
  useInsideInfiniteQuery,
  useInsideCountQuery,
  useLookupInfiniteQuery,
  useBadgeCheckQuery,
  useGetVisitQuery,
  useCheckInMutation,
  useExitVisitMutation,
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
