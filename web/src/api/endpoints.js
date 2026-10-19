import { EMPTY_PAGINATION } from '../types';
import { fileUrl, request, requestBlob, withGate } from './client';

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
  return {
    ...v,
    photoUrl: fileUrl(v.photoUrl),
    idPhotoUrl: fileUrl(v.idPhotoUrl),
    agreementUrl: fileUrl(v.agreementUrl ?? null),
  };
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
  /** Everyone, minimal, for the org chart and escalation chains. @returns {Promise<import('../types').OrgUser[]>} */
  org: (signal) => request('GET', '/api/users/org', { signal }).then((r) => r.users),
  /** The module registry for the person editor. @returns {Promise<import('../types').ModuleDef[]>} */
  modules: (signal) => request('GET', '/api/users/modules', { signal }).then((r) => r.modules),
};

// ---- settings ---------------------------------------------------------------

export const settingsApi = {
  /** @returns {Promise<Settings>} */
  get: () => request('GET', '/api/settings').then((r) => r.settings),
  /** @returns {Promise<Settings>} */
  put: (settings) => request('PUT', '/api/settings', { body: settings }).then((r) => r.settings),
  /** PNG or JPEG under 1.5 MB. @param {File} file @returns {Promise<Settings>} */
  uploadLogo: (file) => {
    const form = new FormData();
    form.append('logo', file);
    return request('POST', '/api/settings/logo', { form }).then((r) => r.settings);
  },
  /** @returns {Promise<Settings>} */
  removeLogo: () => request('DELETE', '/api/settings/logo').then((r) => r.settings),
};

/** Public company name + logo for the sign-in page. @returns {Promise<{ name: string, logoUrl: string | null }>} */
export const brandApi = {
  get: () => request('GET', '/api/brand', { anonymous: true }),
};

// ---- terms & confidentiality agreement ------------------------------------------

export const termsApi = {
  /** Current terms + every version. @returns {Promise<{ terms: import('../types').Terms, versions: { version: number, at: string }[] }>} */
  get: (signal) => request('GET', '/api/terms', { signal }),
  /**
   * Public (no sign-in): a version's wording for the terms page.
   * @param {number | null} [v] @returns {Promise<{ version: number, current: number, title: string, company: string, body: string, logoUrl: string | null }>}
   */
  public: (v, signal) => request('GET', '/api/terms/public', { query: { v: v ?? undefined }, signal, anonymous: true }),
  /** Admin: what an agreement looks like now. @returns {Promise<{ blob: Blob, filename: string | null }>} */
  samplePdf: () => requestBlob('/api/terms/sample.pdf'),
};

// ---- escalation log (admin) -----------------------------------------------------

export const escalationsApi = {
  /**
   * Paginated, newest first. Query: days (1 | 7 | 30 | 90), matrix (visitor | overstay | mail), page, limit.
   * @returns {Promise<{ data: import('../types').EscalationEvent[], pagination: Pagination }>}
   */
  list: (query, signal) => request('GET', '/api/escalations', { query, signal }).then((r) => page(r)),
  /** @returns {Promise<{ blob: Blob, filename: string | null }>} */
  exportCsv: (query) => requestBlob('/api/escalations/export.csv', { query }),
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
    request('GET', '/api/visits/inside', { query: withGate(query), signal }).then((r) => page(r, normalizeVisit)),
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
   * @param {Blob | null} photo  optional when Settings → Visitors allows it
   * @param {Blob | null} idPhoto
   * @returns {Promise<Visit>}
   */
  checkIn: (fields, photo, idPhoto) => {
    const form = new FormData();
    for (const [k, v] of Object.entries(withGate(fields))) form.append(k, String(v));
    if (photo) form.append('photo', photo, 'photo.jpg');
    if (idPhoto) form.append('idPhoto', idPhoto, 'id.jpg');
    return request('POST', '/api/visits', { form }).then((r) => normalizeVisit(r.visit));
  },
  /**
   * @param {string} id
   * @param {{ outAt?: string, exitNote?: string, passReturned?: boolean }} input
   * @returns {Promise<Visit>}
   */
  /** (Re)create the agreement PDF of a visit that accepted the terms. @returns {Promise<Visit>} */
  makeAgreement: (id) =>
    request('POST', `/api/visits/${encodeURIComponent(id)}/agreement`, { body: {} }).then((r) =>
      normalizeVisit(r.visit),
    ),
  exit: (id, input) =>
    request('POST', `/api/visits/${encodeURIComponent(id)}/exit`, { body: input }).then((r) => normalizeVisit(r.visit)),
  /**
   * Security lets the visitor in: after the host accepted, or `viaPhone` when confirmed with the host by phone.
   * @param {string} id
   * @param {{ viaPhone?: boolean }} [input]
   * @returns {Promise<Visit>}
   */
  allow: (id, input = {}) =>
    request('POST', `/api/visits/${encodeURIComponent(id)}/allow`, { body: input }).then((r) =>
      normalizeVisit(r.visit),
    ),
  /**
   * The signed-in user's own visitors. Query: scope (all | waiting | current | earlier), page, limit, q.
   * @param {Query} query
   * @param {AbortSignal} [signal]
   * @returns {Promise<{ data: Visit[], pagination: Pagination, counts: { waiting: number, current: number } }>}
   */
  mine: (query, signal) =>
    request('GET', '/api/visits/mine', { query, signal }).then((r) => ({
      ...page(r, normalizeVisit),
      counts: r.counts ?? { waiting: 0, current: 0 },
    })),
  /** One of my own visitors. @returns {Promise<Visit>} */
  getMine: (id) => request('GET', `/api/visits/mine/${encodeURIComponent(id)}`).then((r) => normalizeVisit(r.visit)),
  /**
   * The host accepts or declines a waiting visitor.
   * @param {string} id
   * @param {{ status: 'accepted' | 'declined', note?: string }} input
   * @returns {Promise<Visit>}
   */
  respond: (id, input) =>
    request('POST', `/api/visits/${encodeURIComponent(id)}/respond`, { body: input }).then((r) =>
      normalizeVisit(r.visit),
    ),
};

// ---- expected visitors & deliveries -------------------------------------------

/** @typedef {import('../types').Expected} Expected */

export const expectedApi = {
  /**
   * Paginated, scoped to me unless I'm a gate user. Query: when (all | today | upcoming | earlier), kind, q, page, limit.
   * @returns {Promise<{ data: Expected[], pagination: Pagination, counts: { today: number } }>}
   */
  list: (query, signal) =>
    request('GET', '/api/expected', {
      query: { tzOffset: new Date().getTimezoneOffset(), ...query },
      signal,
    }).then((r) => ({ ...page(r), counts: r.counts ?? { today: 0 } })),
  /** Today's open expected visitor with this mobile number, or null. @returns {Promise<Expected | null>} */
  match: (phone, signal) =>
    request('GET', '/api/expected/match', {
      query: { phone, tzOffset: new Date().getTimezoneOffset() },
      signal,
    }).then((r) => r.expected),
  /** @returns {Promise<Expected>} */
  get: (id) => request('GET', `/api/expected/${encodeURIComponent(id)}`).then((r) => r.expected),
  /** @returns {Promise<Expected>} */
  create: (input) => request('POST', '/api/expected', { body: input }).then((r) => r.expected),
  /** @returns {Promise<Expected>} */
  update: (id, patch) =>
    request('PATCH', `/api/expected/${encodeURIComponent(id)}`, { body: patch }).then((r) => r.expected),
  /** @returns {Promise<Expected>} */
  cancel: (id) =>
    request('POST', `/api/expected/${encodeURIComponent(id)}/cancel`, { body: {} }).then((r) => r.expected),
  /** Security received an expected delivery. @returns {Promise<Expected>} */
  received: (id) =>
    request('POST', `/api/expected/${encodeURIComponent(id)}/received`, { body: {} }).then((r) => r.expected),
};

// ---- stats ------------------------------------------------------------------

export const statsApi = {
  /** @returns {Promise<Overview>} */
  overview: (signal) =>
    request('GET', '/api/stats/overview', {
      query: withGate({ tzOffset: new Date().getTimezoneOffset() }),
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
  return {
    ...m,
    coverPhotoUrl: fileUrl(m.coverPhotoUrl),
    coverBackPhotoUrl: fileUrl(m.coverBackPhotoUrl ?? null),
    personPhotoUrl: fileUrl(m.personPhotoUrl),
  };
}

const EMPTY_COUNTS = { lodged: 0, handed: 0, disputed: 0 };

export const mailApi = {
  /**
   * Paginated. Query: page, limit, q, sort (receivedAt | handedAt), status (one or comma list), from, to,
   * recipient ('me' or a user id).
   * @returns {Promise<{ data: MailItem[], pagination: Pagination, counts: { lodged: number, handed: number, disputed: number } }>}
   */
  list: (query, signal) =>
    request('GET', '/api/mail', { query: query?.recipient ? query : withGate(query), signal }).then((r) => ({
      ...page(r, normalizeMail),
      counts: { ...EMPTY_COUNTS, ...(r.counts ?? {}) },
    })),
  /** @returns {Promise<MailItem>} */
  get: (id) => request('GET', `/api/mail/${encodeURIComponent(id)}`).then((r) => normalizeMail(r.item)),
  /** Same filters / q / sort as list, not paginated. */
  exportCsv: (query) => requestBlob('/api/mail/export.csv', { query }),
  /**
   * Multipart create. `fields` carries recipientId or recipientName; files `cover` (front), `coverBack`, `person`.
   * @returns {Promise<MailItem>}
   */
  create: (fields, cover, coverBack, person) => {
    const form = new FormData();
    for (const [k, v] of Object.entries(withGate(fields))) {
      if (v === undefined || v === null || v === '') continue;
      form.append(k, String(v));
    }
    // Each photo is optional when the Settings → Post room rules allow it.
    if (cover) form.append('cover', cover, 'cover.jpg');
    if (coverBack) form.append('coverBack', coverBack, 'cover-back.jpg');
    if (person) form.append('person', person, 'person.jpg');
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

// ---- material gate passes ---------------------------------------------------------

/** @param {any} p */
export function normalizeMaterial(p) {
  return {
    ...p,
    challanPhotoUrls: (p.challanPhotoUrls ?? []).map(fileUrl),
    photoUrls: (p.photoUrls ?? []).map(fileUrl),
    carrier: { ...p.carrier, photoUrl: fileUrl(p.carrier?.photoUrl ?? null) },
    returns: (p.returns ?? []).map((r) => ({ ...r, photoUrl: fileUrl(r.photoUrl ?? null) })),
  };
}

/** Multipart body: plain fields + `[field, blob]` files (blobs may be null). */
function materialForm(fields, files = []) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null || v === '') continue;
    form.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  files.forEach(([k, blob], i) => {
    if (blob) form.append(k, blob, `${k}-${i}.jpg`);
  });
  return form;
}

const mp = (id, action) => `/api/material/${encodeURIComponent(id)}${action ? `/${action}` : ''}`;
const mpOne = (r) => normalizeMaterial(r.pass);

export const materialApi = {
  /**
   * Paginated. Gate: tab today | accept | gate | open | overdue | all (+ days 7 | 30 | 120); employees: tab todo |
   * sent | in | all. Both: dir, visitId, q. Response adds `counts`.
   */
  list: (query, signal) =>
    request('GET', '/api/material', {
      query: withGate({ tzOffset: new Date().getTimezoneOffset(), ...query }),
      signal,
    }).then((r) => page(r, normalizeMaterial)),
  /** Visitors inside now (`mine` = visiting me). */
  visitors: (signal) => request('GET', '/api/material/visitors', { signal }).then((r) => r.data),
  get: (id, signal) => request('GET', mp(id), { signal }).then(mpOne),
  /** @param {Record<string, unknown>} fields @param {{ challan?: Blob[], boxPhotos?: Blob[], carrier?: Blob | null }} files */
  create: (fields, files = {}) =>
    request('POST', '/api/material', {
      form: materialForm(withGate(fields), [
        ...(files.challan ?? []).map((b) => ['challan', b]),
        ...(files.boxPhotos ?? []).map((b) => ['boxPhoto', b]),
        ['carrier', files.carrier ?? null],
      ]),
    }).then(mpOne),
  receipt: (id, body) => request('POST', mp(id, 'receipt'), { body }).then(mpOne),
  decision: (id, body) => request('POST', mp(id, 'decision'), { body }).then(mpOne),
  drop: (id, boxes) => request('POST', mp(id, 'drop'), { body: { boxes } }).then(mpOne),
  /** @param {Record<string, unknown>} fields @param {Blob | null} [photo] person collecting */
  release: (id, fields, photo = null) =>
    request('POST', mp(id, 'release'), { form: materialForm(fields, [['carrier', photo]]) }).then(mpOne),
  /** @param {{ lines?: { i: number, qty: number }[], note?: string }} fields @param {Blob | null} [photo] */
  returnBack: (id, fields, photo = null) =>
    request('POST', mp(id, 'return'), { form: materialForm(fields, [['returnPhoto', photo]]) }).then(mpOne),
  cancel: (id) => request('POST', mp(id, 'cancel'), { body: {} }).then(mpOne),
  remind: (id) => request('POST', mp(id, 'remind'), { body: {} }),
  pdf: (id) => requestBlob(mp(id, 'pdf')),
  exportCsv: (query) =>
    requestBlob('/api/material/export.csv', { query: { tzOffset: new Date().getTimezoneOffset(), ...query } }),
};

// ---- key register ---------------------------------------------------------------

const keyPath = (id, action) => `/api/keys/${encodeURIComponent(id)}${action ? `/${action}` : ''}`;

export const keysApi = {
  /** The key board: `{ keys (each with the copies `out` now), counts { total, out, available, overdue } }`. */
  board: (query, signal) => request('GET', '/api/keys', { query: withGate(query), signal }),
  create: (body) => request('POST', '/api/keys', { body }).then((r) => r.key),
  update: (id, body) => request('PATCH', keyPath(id), { body }).then((r) => r.key),
  /** `{ takerId?, takerName, takerPhone, purpose, dueAt? }` (dueAt null = no return time). */
  issue: (id, body) => request('POST', keyPath(id, 'issue'), { body }),
  /** Key diary, paginated. Query: period today | 7d | 30d | 90d, state all | out | overdue | returned, q. */
  diary: (query, signal) =>
    request('GET', '/api/keymoves', {
      query: withGate({ tzOffset: new Date().getTimezoneOffset(), ...query }),
      signal,
    }).then((r) => page(r)),
  giveBack: (moveId, body) => request('POST', `/api/keymoves/${encodeURIComponent(moveId)}/return`, { body }),
  exportCsv: (query) =>
    requestBlob('/api/keymoves/export.csv', { query: { tzOffset: new Date().getTimezoneOffset(), ...query } }),
};

// ---- incidents ------------------------------------------------------------------

/** @param {any} i */
export const normalizeIncident = (i) => ({ ...i, photoUrls: (i.photoUrls ?? []).map(fileUrl) });
const inc = (id, action) => `/api/incidents/${encodeURIComponent(id)}${action ? `/${action}` : ''}`;
const incOne = (r) => normalizeIncident(r.incident);

export const incidentsApi = {
  /** Paginated. Query: tab open | closed | all, severity, q. Response adds `counts { open, closed, critical }`. */
  list: (query, signal) =>
    request('GET', '/api/incidents', { query: withGate(query), signal }).then((r) => page(r, normalizeIncident)),
  get: (id, signal) => request('GET', inc(id), { signal }).then(incOne),
  /** People an incident can be given to (security / admin only). */
  assignees: (signal) => request('GET', '/api/incidents/assignees', { signal }).then((r) => r.data),
  /** @param {Record<string, unknown>} fields @param {Blob[]} photos */
  report: (fields, photos = []) =>
    request('POST', '/api/incidents', {
      form: materialForm(
        fields,
        photos.map((b) => ['photos', b]),
      ),
    }).then(incOne),
  update: (id, body) => request('POST', inc(id, 'update'), { body }).then(incOne),
  close: (id, resolution) => request('POST', inc(id, 'close'), { body: { resolution } }).then(incOne),
  reopen: (id, text) => request('POST', inc(id, 'reopen'), { body: { text } }).then(incOne),
  exportCsv: (query) => requestBlob('/api/incidents/export.csv', { query }),
};

// ---- patrols ----------------------------------------------------------------------

/** @param {any} s */
const normalizeScan = (s) => ({ ...s, photoUrl: fileUrl(s.photoUrl ?? null) });

export const patrolApi = {
  /** `{ checkpoints, rounds, slots (12 h back … 12 h ahead), now }` */
  board: (signal) => request('GET', '/api/patrol', { query: withGate(), signal }),
  /** Late & missed log: `{ data, summary }`. Query: days 1 | 7 | 30 | 90, filter problems | all. */
  log: (query, signal) => request('GET', '/api/patrol/log', { query: withGate(query), signal }),
  logCsv: (query) => requestBlob('/api/patrol/log.csv', { query }),
  scans: (query, signal) => request('GET', '/api/patrol/scans', { query, signal }).then((r) => page(r, normalizeScan)),
  lookup: (code, signal) => request('GET', '/api/patrol/lookup', { query: { code }, signal }),
  /** @param {{ code: string, status: 'ok' | 'issue', note?: string, manual?: boolean }} fields @param {Blob | null} photo */
  scan: (fields, photo = null) =>
    request('POST', '/api/patrol/scan', { form: materialForm(fields, [['scanPhoto', photo]]) }).then((r) => ({
      ...r,
      scan: normalizeScan(r.scan),
    })),
  createCheckpoint: (body) => request('POST', '/api/patrol/checkpoints', { body }).then((r) => r.checkpoint),
  updateCheckpoint: (id, body) =>
    request('PATCH', `/api/patrol/checkpoints/${encodeURIComponent(id)}`, { body }).then((r) => r.checkpoint),
  createRound: (body) => request('POST', '/api/patrol/rounds', { body }).then((r) => r.round),
  updateRound: (id, body) =>
    request('PATCH', `/api/patrol/rounds/${encodeURIComponent(id)}`, { body }).then((r) => r.round),
};

// ---- generator & diesel -----------------------------------------------------------

/** @param {any} g */
const normalizeGen = (g) => ({
  ...g,
  lastCheck: g.lastCheck ? { ...g.lastCheck, photoUrl: fileUrl(g.lastCheck.photoUrl ?? null) } : null,
});
/** @param {any} f */
const normalizeFuel = (f) => ({ ...f, photoUrl: fileUrl(f.photoUrl ?? null) });
const genPath = (id, action) => `/api/gen/${encodeURIComponent(id)}/${action}`;

export const genApi = {
  /** `{ generators (with status), reasons, genCheckDays, genCheckHour }` */
  status: (signal) =>
    request('GET', '/api/gen', { query: withGate(), signal }).then((r) => ({
      ...r,
      generators: r.generators.map(normalizeGen),
    })),
  createGenerator: (body) => request('POST', '/api/gen/generators', { body }).then((r) => normalizeGen(r.generator)),
  updateGenerator: (id, body) =>
    request('PATCH', `/api/gen/generators/${encodeURIComponent(id)}`, { body }).then((r) => normalizeGen(r.generator)),
  start: (id, body) => request('POST', genPath(id, 'start'), { body }).then((r) => r.run),
  stop: (runId, body) =>
    request('POST', `/api/gen/runs/${encodeURIComponent(runId)}/stop`, { body }).then((r) => r.run),
  /** @param {Record<string, unknown>} fields @param {Blob | null} photo */
  fuel: (id, fields, photo = null) =>
    request('POST', genPath(id, 'fuel'), { form: materialForm(fields, [['genPhoto', photo]]) }).then((r) =>
      normalizeFuel(r.entry),
    ),
  /** Run log, paginated + `hours`. Query: days, genId. */
  runs: (query, signal) => request('GET', '/api/gen/runs', { query, signal }).then((r) => page(r)),
  runsCsv: (query) => requestBlob('/api/gen/runs.csv', { query }),
  /** Diesel log, paginated (+ `consumption` with genId). Query: days, genId. */
  fuelLog: (query, signal) => request('GET', '/api/gen/fuel', { query, signal }).then((r) => page(r, normalizeFuel)),
  fuelCsv: (query) => requestBlob('/api/gen/fuel.csv', { query }),
};

// ---- TRACK & web push -------------------------------------------------------------

export const trackApi = {
  /** `{ items, counts { total, urgent, byCat }, cats, expectedSoon, materialInProgress, now }` for this gate. */
  get: (signal) => request('GET', '/api/track', { query: withGate(), signal }),
};

export const pushApi = {
  /** `{ publicKey }` (VAPID, base64url) */
  config: () => request('GET', '/api/push/config'),
  subscribe: (subscription, device) => request('POST', '/api/push/subscribe', { body: { subscription, device } }),
  unsubscribe: (endpoint) => request('POST', '/api/push/unsubscribe', { body: { endpoint } }),
  /** `{ sent }` */
  test: () => request('POST', '/api/push/test', { body: {} }),
  /** `[{ kind: 'web' | 'android' | 'ios', name, lastSeenAt }]` */
  devices: (signal) => request('GET', '/api/push/devices', { signal }).then((r) => r.devices),
};
