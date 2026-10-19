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
 * @property {boolean} canPreRegister  may register expected visitors / deliveries
 * @property {ModuleKey[]} modules  modules they can use (admins: all)
 * @property {string | null} reportsTo  manager's user id (escalation Level 1)
 * @property {string} designation
 * @property {boolean} isSupervisor  gate supervisor
 */

/** @typedef {'track' | 'visitors' | 'expected' | 'post' | 'material' | 'keys' | 'incidents' | 'patrol' | 'gen'} ModuleKey */
/**
 * @typedef {object} ModuleDef
 * @property {ModuleKey} key
 * @property {string} label
 * @property {string} group
 * @property {Role[]} roles       who can be given it
 * @property {Role[]} defaultFor  who starts with it
 * @property {Record<string, [string, string]>} text  per role: [name, what they can do]
 */
/** @typedef {{ id: string, name: string, role: Role, designation: string, dept: string, location: string, reportsTo: string | null, isSupervisor: boolean, active: boolean }} OrgUser */

/**
 * One step of an escalation matrix.
 * @typedef {object} EscStep
 * @property {number} after   minutes from the clock start
 * @property {string} to      guards | person | l1 | l2 | l3 | supervisors | admins | user:<id>
 * @property {number} repeat  minutes; 0 = once
 * @property {boolean} alarm
 * @property {string} label
 */
/** @typedef {'visitor' | 'overstay' | 'mail'} MatrixKey */

/**
 * @typedef {object} EscalationEvent
 * @property {string} id
 * @property {MatrixKey} matrix
 * @property {'visit' | 'mail'} refType
 * @property {string} ref
 * @property {string} item
 * @property {string} site
 * @property {number} step
 * @property {number} occurrence
 * @property {string} at
 * @property {string} title
 * @property {string} label
 * @property {string} target
 * @property {string} targetName
 * @property {UserRef[]} recipients
 * @property {string} note
 * @property {boolean} alarm
 */

/**
 * @typedef {object} Company
 * @property {string} name  short name, shown in the apps
 * @property {string} legalName
 * @property {string} address
 * @property {string} phone
 * @property {string} email
 * @property {string} website
 * @property {string} gstin
 * @property {string} cin
 * @property {string | null} logoUrl  public /api/brand/logo?v=…
 */

/** @typedef {{ id: string, name: string, dept: string, location: string, phone: string }} Host */

/**
 * @typedef {object} Settings
 * @property {string[]} sites
 * @property {string[]} departments
 * @property {string[]} purposes
 * @property {string[]} mailKinds
 * @property {number} overstayHours
 * @property {number} hostReplyMinutes  minutes a host has to answer before security is told to call them
 * @property {boolean} expectedPreapproved  new expected visitors start pre-approved
 * @property {string[]} designations
 * @property {boolean} visitorPhotoRequired
 * @property {boolean} visitorPassRequired
 * @property {boolean} mailCoverRequired
 * @property {boolean} mailPersonPhotoRequired
 * @property {Company} company
 * @property {Record<MatrixKey, EscStep[]>} esc
 * @property {Terms} terms
 */

/**
 * Visitor terms & confidentiality agreement.
 * @typedef {object} Terms
 * @property {boolean} required  visitors must agree at check-in
 * @property {string} company    name printed on the agreement ('' = registered name)
 * @property {string} title
 * @property {string} body       plain text; sections separated by a blank line, "1. Heading" on its own line
 * @property {number} version
 */

/** @typedef {{ id: string, name: string }} UserRef */

/**
 * A pre-registered visitor or delivery (docs/API.md "Expected visitors and deliveries").
 * @typedef {object} Expected
 * @property {string} id            same as `code`
 * @property {string} code          EX-YYMMDD-XXXX
 * @property {'visitor' | 'delivery'} kind
 * @property {string} site
 * @property {string} name          visitor, or driver / courier ('' when unknown)
 * @property {string} phone
 * @property {string} company       for deliveries: who it is from
 * @property {string} purpose
 * @property {number} persons
 * @property {UserRef} host
 * @property {UserRef | null} contact   receives them at the location
 * @property {UserRef[]} also
 * @property {string} expectedAt
 * @property {string | null} untilAt
 * @property {string} vehicle
 * @property {string} items
 * @property {string} notes         note for security
 * @property {boolean} preapproved
 * @property {number} boxes
 * @property {string} challanType
 * @property {string} challanNo
 * @property {'expected' | 'arrived' | 'cancelled'} status
 * @property {'expected' | 'late' | 'missed' | 'arrived' | 'cancelled'} state
 * @property {UserRef} createdBy
 * @property {string | null} createdAt
 * @property {string | null} arrivedAt
 * @property {UserRef | null} arrivedBy
 * @property {string | null} visitId
 * @property {string | null} cancelledAt
 * @property {UserRef | null} cancelledBy
 */

/** @typedef {{ id: string, name: string }} GuardRef */

/**
 * Host approval: waiting (asked in the app) · accepted · declined · manual (host not on Gatebook: confirm by phone).
 * @typedef {'waiting' | 'accepted' | 'declined' | 'manual'} HostStatus
 */

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
 * @property {string | null} hostId      the Gatebook employee being visited (null when typed)
 * @property {string} hostPhone
 * @property {string} hostLocation
 * @property {HostStatus} hostStatus
 * @property {string | null} hostAt      when the host answered (or security confirmed by phone)
 * @property {GuardRef | null} hostBy
 * @property {'app' | 'phone' | 'preapproved' | null} hostVia
 * @property {string} hostNote           the host's message to security
 * @property {string | null} escalatedAt when security was told the host had not replied
 * @property {string | null} allowedAt   when security let the visitor in
 * @property {GuardRef | null} allowedBy
 * @property {string | null} expectedId  the Expected code it was checked in from
 * @property {number | null} termsVersion  terms version accepted at check-in
 * @property {string | null} termsAt       when (= inAt)
 * @property {string | null} agreementUrl  signed URL of the agreement PDF (null until made)
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
 * @property {number} waitingAtGate           not let in yet and not declined
 * @property {number | null} avgHostReplyMinutes
 * @property {number} noReplyToday
 * @property {number} expectedToday          pre-registered for today, not here yet
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
