/**
 * JSON shapes from docs/API.md, as JSDoc typedefs (the app is plain JavaScript;
 * editors still pick these up for hints).
 *
 * @typedef {'admin' | 'security' | 'viewer'} Role
 *
 * @typedef {Object} User
 * @property {string} id
 * @property {string} name
 * @property {string} email
 * @property {Role} role
 * @property {boolean} active
 * @property {string} createdAt
 *
 * @typedef {Object} Settings
 * @property {string[]} sites
 * @property {string[]} departments
 * @property {string[]} purposes
 * @property {number} overstayHours
 *
 * @typedef {'Aadhaar'|'Driving licence'|'PAN'|'Voter ID'|'Company ID'|'Passport'|'Other'|'None'} IdType
 *
 * @typedef {Object} GuardRef
 * @property {string} id
 * @property {string} name
 *
 * @typedef {Object} Visit
 * @property {string} id            Same as `pass`.
 * @property {string} pass          Entry id, GB-YYMMDD-XXXX.
 * @property {string} badge         Physical pass-card number.
 * @property {boolean|null} passReturned
 * @property {string} name
 * @property {string} phone
 * @property {string} company
 * @property {number} persons
 * @property {string} purpose
 * @property {string} host
 * @property {string} dept
 * @property {IdType} idType
 * @property {string} idLast4
 * @property {string} vehicle
 * @property {string} items
 * @property {string} notes
 * @property {string} site
 * @property {string} inAt
 * @property {string|null} outAt
 * @property {string} photoUrl      Signed path; prefix with the API base URL.
 * @property {string|null} idPhotoUrl
 * @property {GuardRef|null} guardIn
 * @property {GuardRef|null} guardOut
 * @property {string} exitNote
 * @property {boolean} overstay
 *
 * @typedef {Object} Pagination
 * @property {number} page
 * @property {number} limit
 * @property {number} total
 * @property {number} totalPages
 * @property {boolean} hasNextPage
 * @property {boolean} hasPrevPage
 *
 * @template T
 * @typedef {Object} Paginated
 * @property {T[]} data
 * @property {Pagination} pagination
 *
 * @typedef {Object} Overview
 * @property {number} insideNow
 * @property {number} entriesToday
 * @property {number} personsToday
 * @property {number|null} avgStayMinutes
 * @property {number} overstayCount
 * @property {{hour: number, count: number}[]} byHour
 * @property {{label: string, count: number}[]} byPurpose
 * @property {{label: string, count: number}[]} byDept
 * @property {number} overstayHours
 */

/**
 * @typedef {'admin' | 'security' | 'viewer' | 'host'} RoleWithHost  `host` = "Employee" in the UI.
 *
 * User (additions for the post room): phone, dept, location: string; isHost: boolean.
 *
 * @typedef {Object} Host
 * @property {string} id
 * @property {string} name
 * @property {string} dept
 * @property {string} location
 * @property {string} phone   '' for host/viewer callers
 *
 * @typedef {'lodged'|'handed'|'closed'|'confirmed'|'disputed'|'resolved'} MailStatus
 *
 * @typedef {Object} MailItem
 * @property {string} id                ML-YYMMDD-XXXX
 * @property {string} kind
 * @property {string} refNo
 * @property {string} sender
 * @property {string} carrier
 * @property {string} broughtBy
 * @property {string} broughtPhone
 * @property {{id: string, name: string, phone: string, location: string}|null} recipient
 * @property {string} recipientName
 * @property {string} dept
 * @property {number} pieces
 * @property {string} notes
 * @property {string} site
 * @property {string} receivedAt
 * @property {GuardRef} receivedBy
 * @property {string} coverPhotoUrl
 * @property {string} personPhotoUrl
 * @property {MailStatus} status
 * @property {string|null} notifiedAt
 * @property {string|null} remindedAt
 * @property {string|null} handedAt
 * @property {GuardRef|null} handedBy
 * @property {string} collectedBy
 * @property {string} handedNote
 * @property {string|null} confirmedAt
 * @property {string} disputeNote
 * @property {string|null} resolvedAt
 * @property {GuardRef|null} resolvedBy
 * @property {string} resolveNote
 */

/** @type {IdType[]} */
export const ID_TYPES = [
  'Aadhaar',
  'Driving licence',
  'PAN',
  'Voter ID',
  'Company ID',
  'Passport',
  'Other',
  'None',
];

export const DEFAULT_PAGE_SIZE = 20;

/** Post room status labels (API.md "Post CSV columns"). */
export const MAIL_STATUS_LABELS = {
  lodged: 'To collect',
  handed: 'Handed · awaiting confirmation',
  closed: 'Handed over',
  confirmed: 'Collected · confirmed',
  disputed: 'Receiver disputes',
  resolved: 'Resolved',
};

/** Suggestions for "Brought by" when logging post. */
export const CARRIERS = [
  'India Post',
  'Blue Dart',
  'DTDC',
  'Delhivery',
  'Professional Couriers',
  'DHL',
  'FedEx',
  'Ecom Express',
  'Hand delivery',
];
