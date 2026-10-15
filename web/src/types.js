// JSDoc typedefs mirroring docs/API.md (the authoritative contract).

/** @typedef {'admin' | 'security' | 'viewer' | 'host'} Role  `host` = Employee */

/**
 * @typedef {object} User
 * @property {string} id
 * @property {string} name
 * @property {string} email
 * @property {Role} role
 * @property {boolean} active
 * @property {string} createdAt
 * @property {string} phone
 * @property {string} dept
 * @property {string} location     where visitors / post should go
 * @property {boolean} isHost      can receive post (always true for role host)
 */

/** @typedef {{ id: string, name: string, dept: string, location: string, phone: string }} Host */

/**
 * @typedef {object} Settings
 * @property {string[]} sites
 * @property {string[]} departments
 * @property {string[]} purposes
 * @property {string[]} mailKinds
 * @property {number} overstayHours
 */

/** @typedef {{ id: string, name: string }} GuardRef */

/**
 * @typedef {object} Visit
 * @property {string} id            same as `pass`
 * @property {string} pass          entry id, GB-YYMMDD-XXXX
 * @property {string} badge         physical pass-card number
 * @property {boolean | null} passReturned
 * @property {string} name
 * @property {string} phone
 * @property {string} company
 * @property {number} persons
 * @property {string} purpose
 * @property {string} host
 * @property {string} dept
 * @property {string} idType
 * @property {string} idLast4
 * @property {string} vehicle
 * @property {string} items
 * @property {string} notes
 * @property {string} site
 * @property {string} inAt
 * @property {string | null} outAt
 * @property {string} photoUrl      signed URL, already prefixed with the API base by the client
 * @property {string | null} idPhotoUrl
 * @property {GuardRef | null} guardIn
 * @property {GuardRef | null} guardOut
 * @property {string} exitNote
 * @property {boolean} overstay
 */

/**
 * @typedef {object} Pagination
 * @property {number} page
 * @property {number} limit
 * @property {number} total
 * @property {number} totalPages
 * @property {boolean} hasNextPage
 * @property {boolean} hasPrevPage
 */

/**
 * @template T
 * @typedef {{ data: T[], pagination: Pagination }} Paginated
 */

/**
 * @typedef {object} Overview
 * @property {number} insideNow
 * @property {number} entriesToday
 * @property {number} personsToday
 * @property {number | null} avgStayMinutes
 * @property {number} overstayCount
 * @property {{ hour: number, count: number }[]} byHour
 * @property {{ label: string, count: number }[]} byPurpose
 * @property {{ label: string, count: number }[]} byDept
 * @property {number} overstayHours
 */

/**
 * @typedef {'lodged' | 'handed' | 'closed' | 'confirmed' | 'disputed' | 'resolved'} MailStatus
 */

/**
 * @typedef {object} MailItem
 * @property {string} id            ML-YYMMDD-XXXX
 * @property {string} kind
 * @property {string} refNo
 * @property {string} sender
 * @property {string} carrier       "Brought by" (post / courier company)
 * @property {string} broughtBy     delivery person's name
 * @property {string} broughtPhone
 * @property {{ id: string, name: string, phone: string, location: string } | null} recipient
 * @property {string} recipientName
 * @property {string} dept
 * @property {number} pieces
 * @property {string} notes
 * @property {string} site
 * @property {string} receivedAt
 * @property {GuardRef} receivedBy
 * @property {string} coverPhotoUrl       front of the cover
 * @property {string | null} coverBackPhotoUrl  back of the cover; null on items logged before it existed
 * @property {string} personPhotoUrl
 * @property {MailStatus} status
 * @property {string | null} notifiedAt
 * @property {string | null} remindedAt
 * @property {string | null} handedAt
 * @property {GuardRef | null} handedBy
 * @property {string} collectedBy
 * @property {string} handedNote
 * @property {string | null} confirmedAt
 * @property {string} disputeNote
 * @property {string | null} resolvedAt
 * @property {GuardRef | null} resolvedBy
 * @property {string} resolveNote
 */

export const ID_TYPES = ['Aadhaar', 'Driving licence', 'PAN', 'Voter ID', 'Company ID', 'Passport', 'Other', 'None'];

export const EMPTY_PAGINATION = Object.freeze({
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 0,
  hasNextPage: false,
  hasPrevPage: false,
});
