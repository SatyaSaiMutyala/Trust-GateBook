/** `?a=1&b=x` from an object, skipping undefined/null/'' values. */
export function buildQuery(params) {
  if (!params) return '';
  const parts = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    parts.push(
      `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
    );
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

/** Drops undefined/null/'' so they never reach the URL. */
export function cleanParams(params) {
  const out = {};
  Object.entries(params ?? {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') out[k] = v;
  });
  return out;
}
