/** @typedef {import('../types').ModuleDef} ModuleDef */

/** Modules a role can be given, in registry order (admins: all). @param {ModuleDef[]} defs @param {string} role */
export const eligibleFor = (defs, role) => (role === 'admin' ? defs : defs.filter((d) => d.roles.includes(role)));

/** Modules a new person of this role starts with. @param {ModuleDef[]} defs @param {string} role */
export const defaultsFor = (defs, role) =>
  eligibleFor(defs, role)
    .filter((d) => d.defaultFor.includes(role))
    .map((d) => d.key);
