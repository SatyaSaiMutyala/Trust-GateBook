import { EMPTY_PAGINATION } from '../types';
import { fileUrl, request, requestBlob } from './client';

/** @typedef {import('../types').Visit} Visit */
/** @typedef {import('../types').User} User */
/** @typedef {import('../types').Settings} Settings */
/** @typedef {import('../types').Overview} Overview */
/** @typedef {import('../types').Pagination} Pagination */
/** @typedef {Record<string, string | number | boolean | null | undefined>} Query */

/**
 * Prefix signed photo URLs with the API base. Applied to every visit that enters the app.
 * @param {Visit} v
 * @returns {Visit}
 */
export function normalizeVisit(v) {
  return { ...v, photoUrl: fileUrl(v.photoUrl), idPhotoUrl: fileUrl(v.idPhotoUrl) };
}

/** @param {{ data?: any[], pagination?: Pagination }} r */
function page(r, map = (x) => x) {
  return { ...r, data: (r.data ?? []).map(map), pagination: r.pagination ?? EMPTY_PAGINATION };
}

// ---- auth & users ------------------------------------------------------------

export const authApi = {
  /** @returns {Promise<{ token: string, user: User }>} */
  login: (email, password) => request('POST', '/api/auth/login', { body: { email, password }, anonymous: true }),
  /** @returns {Promise<User>} */
  me: () => request('GET', '/api/auth/me').then((r) => r.user),
  /**
   * Update own profile.
   * @param {{ phone?: string, dept?: string, location?: string }} patch
   * @returns {Promise<User>}
   */
  updateMe: (patch) => request('PATCH', '/api/auth/me', { body: patch }).then((r) => r.user),
};

export const hostsApi = {
  /**
   * Paginated recipient directory. Query: page, limit, q (name, dept), dept, sort (name).
   * @returns {Promise<{ data: import('../types').Host[], pagination: Pagination }>}
   */
  list: (query, signal) => request('GET', '/api/hosts', { query, signal }).then((r) => page(r)),
};

export const usersApi = {
  /**
   * Paginated. Query: page, limit, q (name, email), role, active, sort (name | email | createdAt).
   * @param {Query} query
   * @param {AbortSignal} [signal]
   * @returns {Promise<{ data: User[], pagination: Pagination }>}
   */
  list: (query, signal) => request('GET', '/api/users', { query, signal }).then((r) => page(r)),
  /** @returns {Promise<User>} */
  create: (input) => request('POST', '/api/users', { body: input }).then((r) => r.user),
  /** @returns {Promise<User>} */
  update: (id, patch) => request('PATCH', `/api/users/${encodeURIComponent(id)}`, { body: patch }).then((r) => r.user),
};

// ---- settings ---------------------------------------------------------------

export const settingsApi = {
  /** @returns {Promise<Settings>} */
  get: () => request('GET', '/api/settings').then((r) => r.settings),
  /** @returns {Promise<Settings>} */
  put: (settings) => request('PUT', '/api/settings', { body: settings }).then((r) => r.settings),
};

// ---- visits -----------------------------------------------------------------

export const visitsApi = {
  /**
   * Paginated. Query: page, limit, q, sort (inAt | outAt | name | badge, `-` = desc), from, to, status.
   * @param {Query} query
   * @param {AbortSignal} [signal]
   * @returns {Promise<{ data: Visit[], pagination: Pagination, summary: { persons: number, inside: number } }>}
   */
  list: (query, signal) =>
    request('GET', '/api/visits', { query, signal }).then((r) => ({
      ...page(r, normalizeVisit),
      summary: r.summary ?? { persons: 0, inside: 0 },
    })),
  /**
   * Paginated open visits. Query: page, limit, q, sort (default inAt), overstay ('true').
   * @param {Query} query
   * @param {AbortSignal} [signal]
   * @returns {Promise<{ data: Visit[], pagination: Pagination }>}
   */
  inside: (query, signal) =>
    request('GET', '/api/visits/inside', { query, signal }).then((r) => page(r, normalizeVisit)),
  /**
   * Returning-visitor lookup; `data` = closed visits (newest first), paginated (default limit 5).
   * @param {Query} query  phone, page, limit
   * @param {AbortSignal} [signal]
   * @returns {Promise<{ open: Visit | null, data: Visit[], pagination: Pagination }>}
   */
  lookup: (query, signal) =>
    request('GET', '/api/visits/lookup', { query, signal }).then((r) => ({
      ...page(r, normalizeVisit),
      open: r.open ? normalizeVisit(r.open) : null,
    })),
  /** @returns {Promise<Visit | null>} */
  badgeCheck: (badge, signal) =>
    request('GET', '/api/visits/badge-check', { query: { badge }, signal }).then((r) =>
      r.inUse ? normalizeVisit(r.inUse) : null,
    ),
  /** Same filters / q / sort as list, not paginated. */
  exportCsv: (query) => requestBlob('/api/visits/export.csv', { query }),
  /** @returns {Promise<Visit>} */
  get: (id) => request('GET', `/api/visits/${encodeURIComponent(id)}`).then((r) => normalizeVisit(r.visit)),
  /**
   * Multipart check-in.
   * @param {Record<string, string | number>} fields
   * @param {Blob} photo
   * @param {Blob | null} idPhoto
   * @returns {Promise<Visit>}
   */
  checkIn: (fields, photo, idPhoto) => {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, String(v));
    form.append('photo', photo, 'photo.jpg');
    if (idPhoto) form.append('idPhoto', idPhoto, 'id.jpg');
    return request('POST', '/api/visits', { form }).then((r) => normalizeVisit(r.visit));
  },
  /**
   * @param {string} id
   * @param {{ outAt?: string, exitNote?: string, passReturned?: boolean }} input
   * @returns {Promise<Visit>}
   */
  exit: (id, input) =>
    request('POST', `/api/visits/${encodeURIComponent(id)}/exit`, { body: input }).then((r) => normalizeVisit(r.visit)),
};

// ---- stats ------------------------------------------------------------------

export const statsApi = {
  /** @returns {Promise<Overview>} */
  overview: (signal) =>
    request('GET', '/api/stats/overview', {
      query: { tzOffset: new Date().getTimezoneOffset() },
      signal,
    }).then((r) => r.overview),
};

// ---- post room ----------------------------------------------------------------

/** @typedef {import('../types').MailItem} MailItem */

/**
 * Prefix signed photo URLs with the API base.
 * @param {MailItem} m
 * @returns {MailItem}
 */
export function normalizeMail(m) {
  return { ...m, coverPhotoUrl: fileUrl(m.coverPhotoUrl), personPhotoUrl: fileUrl(m.personPhotoUrl) };
}

const EMPTY_COUNTS = { lodged: 0, handed: 0, disputed: 0 };

export const mailApi = {
  /**
   * Paginated. Query: page, limit, q, sort (receivedAt | handedAt), status (one or comma list), from, to,
   * recipient ('me' or a user id).
   * @returns {Promise<{ data: MailItem[], pagination: Pagination, counts: { lodged: number, handed: number, disputed: number } }>}
   */
  list: (query, signal) =>
    request('GET', '/api/mail', { query, signal }).then((r) => ({
      ...page(r, normalizeMail),
      counts: { ...EMPTY_COUNTS, ...(r.counts ?? {}) },
    })),
  /** @returns {Promise<MailItem>} */
  get: (id) => request('GET', `/api/mail/${encodeURIComponent(id)}`).then((r) => normalizeMail(r.item)),
  /** Same filters / q / sort as list, not paginated. */
  exportCsv: (query) => requestBlob('/api/mail/export.csv', { query }),
  /**
   * Multipart create. `fields` carries recipientId or recipientName.
   * @returns {Promise<MailItem>}
   */
  create: (fields, cover, person) => {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined || v === null || v === '') continue;
      form.append(k, String(v));
    }
    form.append('cover', cover, 'cover.jpg');
    form.append('person', person, 'person.jpg');
    return request('POST', '/api/mail', { form }).then((r) => normalizeMail(r.item));
  },
  /** @returns {Promise<MailItem>} */
  remind: (id) => request('POST', `/api/mail/${encodeURIComponent(id)}/remind`).then((r) => normalizeMail(r.item)),
  /** @returns {Promise<MailItem>} */
  handover: (id, body) =>
    request('POST', `/api/mail/${encodeURIComponent(id)}/handover`, { body }).then((r) => normalizeMail(r.item)),
  /** @returns {Promise<MailItem>} */
  confirm: (id, body) =>
    request('POST', `/api/mail/${encodeURIComponent(id)}/confirm`, { body }).then((r) => normalizeMail(r.item)),
  /** @returns {Promise<MailItem>} */
  resolve: (id, body) =>
    request('POST', `/api/mail/${encodeURIComponent(id)}/resolve`, { body }).then((r) => normalizeMail(r.item)),
};

// ---- in-app notifications -------------------------------------------------------

/** @typedef {{ id: string, event: 'mail_logged' | 'mail_reminder' | 'mail_confirm' | 'mail_disputed', title: string, body: string, data: { type: 'mail', id: string }, readAt: string | null, createdAt: string }} AppNotification */

export const notificationsApi = {
  /**
   * Paginated, own notifications only. Query: page, limit, unread ('true'), sort (createdAt, default -createdAt).
   * @returns {Promise<{ data: AppNotification[], pagination: Pagination, unreadCount: number }>}
   */
  list: (query, signal) =>
    request('GET', '/api/notifications', { query, signal }).then((r) => ({
      ...page(r),
      unreadCount: r.unreadCount ?? 0,
    })),
  /** @returns {Promise<number>} */
  unreadCount: (signal) => request('GET', '/api/notifications/unread-count', { signal }).then((r) => r.count ?? 0),
  /** @returns {Promise<{ notification: AppNotification, unreadCount: number }>} */
  read: (id) => request('POST', `/api/notifications/${encodeURIComponent(id)}/read`),
  /** @returns {Promise<{ updated: number, unreadCount: number }>} */
  readAll: () => request('POST', '/api/notifications/read-all'),
};
