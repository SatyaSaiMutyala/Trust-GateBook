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
  if (status === 401 && apiCtx.getState().auth.token)
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
      query: input => {
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
        return {
          url: '/api/mail',
          method: 'POST',
          body: multipart(fields, [
            ['cover', input.coverUri, 'cover.jpg'],
            ['person', input.personUri, 'person.jpg'],
          ]),
        };
      },
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
