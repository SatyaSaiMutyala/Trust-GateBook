/**
 * Module access (docs/API.md "Module access"). Each person is ticked into the modules they can use; the role decides
 * which modules can be given and which start ticked. Admins always have every module. Unticked modules are hidden
 * by the apps and refused here.
 */

/**
 * @typedef {'track' | 'visitors' | 'expected' | 'post' | 'material' | 'keys' | 'incidents' | 'patrol' | 'gen'} ModuleKey
 * @typedef {{ key: ModuleKey, label: string, group: string, roles: string[], defaultFor: string[],
 *   text: Record<string, [string, string]> }} ModuleDef
 */

/** @type {ModuleDef[]} */
export const MODULES = [
  {
    key: 'track',
    label: 'Overview',
    group: 'Track',
    roles: ['security', 'viewer'],
    defaultFor: ['security', 'viewer'],
    text: { security: ['Overview', 'Today at the gate: counts, arrivals by hour, who needs attention'] },
  },
  {
    key: 'visitors',
    label: 'Visitors',
    group: 'Visitors',
    roles: ['security', 'viewer'],
    defaultFor: ['security', 'viewer'],
    text: { security: ['Visitors', 'Check in, Inside now, Visitor log, exits'] },
  },
  {
    key: 'expected',
    label: 'Expected',
    group: 'Visitors',
    roles: ['security', 'viewer', 'host'],
    defaultFor: ['security', 'viewer', 'host'],
    text: {
      security: ['Expected', 'Pre-registered visitors and deliveries'],
      host: ['Expected', 'Register visitors and deliveries before they come'],
    },
  },
  {
    key: 'post',
    label: 'Post room',
    group: 'Gate desk',
    roles: ['security', 'viewer', 'host'],
    defaultFor: ['security', 'viewer', 'host'],
    text: {
      security: ['Post room', 'Log post and couriers, hand over'],
      host: ['My post', 'See and confirm post for them'],
    },
  },
  {
    key: 'material',
    label: 'Material gate passes',
    group: 'Gate desk',
    roles: ['security', 'viewer', 'host'],
    defaultFor: ['security', 'viewer', 'host'],
    text: {
      security: ['Material passes', 'Material IN / OUT, box counts, releases'],
      host: ['Gate passes', 'Send material out, see material for them'],
    },
  },
  {
    key: 'keys',
    label: 'Key register',
    group: 'Gate desk',
    roles: ['security', 'viewer'],
    defaultFor: ['security', 'viewer'],
    text: { security: ['Key register', 'Issue and take back keys, key diary'] },
  },
  {
    key: 'incidents',
    label: 'Incidents',
    group: 'Site safety',
    roles: ['security', 'viewer', 'host'],
    defaultFor: ['security', 'viewer', 'host'],
    text: {
      security: ['Incidents', 'Report and follow up incidents on site'],
      host: ['Incidents', 'Report something unsafe, follow up ones given to them'],
    },
  },
  {
    key: 'patrol',
    label: 'Patrols',
    group: 'Site safety',
    roles: ['security', 'viewer'],
    defaultFor: ['security', 'viewer'],
    text: { security: ['Patrols', 'QR rounds and patrol alarms'] },
  },
  {
    key: 'gen',
    label: 'Generator & diesel',
    group: 'Site safety',
    roles: ['security', 'viewer'],
    defaultFor: ['security', 'viewer'],
    text: { security: ['Generator', 'Runs, diesel levels and fills'] },
  },
];
export const MODULE_KEYS = MODULES.map((m) => m.key);

/** Modules a role can be given (admins: all). @param {string} role */
export const eligibleModules = (role) =>
  role === 'admin' ? [...MODULE_KEYS] : MODULES.filter((m) => m.roles.includes(role)).map((m) => m.key);

/** Modules a new person of this role starts with. @param {string} role */
export const defaultModules = (role) =>
  role === 'admin' ? [...MODULE_KEYS] : MODULES.filter((m) => m.defaultFor.includes(role)).map((m) => m.key);

/**
 * What the person can use: admins everything; others their ticks (missing = the role defaults), limited to what
 * the role can be given.
 * @param {{ role: string, modules?: string[] | null }} u
 * @returns {ModuleKey[]}
 */
export function effectiveModules(u) {
  if (u.role === 'admin') return [...MODULE_KEYS];
  const eligible = eligibleModules(u.role);
  const ticked = Array.isArray(u.modules) ? u.modules : defaultModules(u.role);
  return /** @type {ModuleKey[]} */ (eligible.filter((k) => ticked.includes(k)));
}

/** @param {{ role: string, modules?: string[] | null }} u @param {ModuleKey} key */
export const hasModule = (u, key) => effectiveModules(u).includes(key);

/** Keeps only known modules the role can be given, in registry order. @param {string[]} keys @param {string} role */
export const cleanModules = (keys, role) => eligibleModules(role).filter((k) => keys.includes(k));

export const NO_MODULE_MESSAGE = 'You do not have access to this module. Ask the administrator.';

/** For GET /api/auth/me and the users editor: the registry without internals. */
export const moduleDefs = () =>
  MODULES.map(({ key, label, group, roles, defaultFor, text }) => ({ key, label, group, roles, defaultFor, text }));
