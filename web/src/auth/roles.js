export const ROLE_LABEL = {
  admin: 'Admin',
  security: 'Security',
  viewer: 'Viewer',
  host: 'Employee',
};
export const ROLES = ['admin', 'security', 'viewer', 'host'];
export const isAdmin = (u) => u?.role === 'admin';
/** Check visitors in, record exits, log / hand over post. */
export const canOperate = (u) => u?.role === 'admin' || u?.role === 'security';
/** Security / admin / viewer ("gate" users): visitor screens and the post room. */
export const isGateUser = (u) => u?.role === 'admin' || u?.role === 'security' || u?.role === 'viewer';
/** Employee (role `host`): only My post + My account. */
export const isEmployee = (u) => u?.role === 'host';
/** Can receive post: role `host`, or any role with `isHost`. */
export const isRecipient = (u) => !!u && (u.role === 'host' || !!u.isHost);
export const GATE_ROLES = ['admin', 'security', 'viewer'];
/**
 * Module access (docs/API.md "Module access"): admins have every module; others the modules ticked for them.
 * Accounts from a server without modules (no `modules` field) keep everything their role allows.
 * @param {import('../types').User | null | undefined} u
 * @param {'track' | 'visitors' | 'expected' | 'post'} key
 */
export const hasModule = (u, key) =>
  !!u && (u.role === 'admin' || !Array.isArray(u.modules) || u.modules.includes(key));
