// Server URL: keep ONE line active, put // in front of the other. Rebuild the app after changing.
// export const API_URL = 'https://trusentinel.mytrustlab.co.in'; // live
export const API_URL = 'http://192.168.29.169:4000'; // local: your PC's Wi-Fi IP (phone on the same Wi-Fi)

/** Signed file URLs come back as `/api/files/...`; prefix them with the server URL. */
export function fileUrl(path) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_URL}${path.startsWith('/') ? '' : '/'}${path}`;
}

