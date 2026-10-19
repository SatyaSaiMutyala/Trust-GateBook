/**
 * Module access helpers for the admin person editor (docs/API.md "Module access").
 * `defs` is GET /api/users/modules: `{ key, label, group, roles, defaultFor, text }[]`.
 */

/** Modules a role can be given, in registry order (admins: all). */
export const eligibleFor = (defs, role) =>
  role === 'admin' ? defs : defs.filter(d => d.roles.includes(role));

/** Modules a new person of this role starts with. */
export const defaultsFor = (defs, role) =>
  eligibleFor(defs, role)
    .filter(d => d.defaultFor.includes(role))
    .map(d => d.key);

/** [name, what they can do] for a role. */
export const moduleText = (d, role) =>
  d.text?.[role] ?? d.text?.security ?? [d.label, ''];

/** The people above `id`, nearest first (cycle-safe, max 8), from GET /api/users/org. */
export function chainOf(org, id) {
  const byId = new Map(org.map(u => [u.id, u]));
  const out = [];
  const seen = new Set([id]);
  let cur = byId.get(id);
  while (cur?.reportsTo && out.length < 8) {
    const next = byId.get(cur.reportsTo);
    if (!next || seen.has(next.id) || !next.active) break;
    seen.add(next.id);
    out.push(next);
    cur = next;
  }
  return out;
}

/** "Ravi → Anil → admin". */
export const chainText = (org, id) =>
  [...chainOf(org, id).map(u => u.name), 'admin'].join(' → ');
