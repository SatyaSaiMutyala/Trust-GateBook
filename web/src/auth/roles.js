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
