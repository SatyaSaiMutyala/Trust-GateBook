import ReactNativeBlobUtil from 'react-native-blob-util';
import Share from 'react-native-share';
import { API_URL } from './config';
import { buildQuery } from './query';

function stamp() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    '0',
  )}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Downloads a CSV export with the bearer token into the cache directory, then opens the share sheet.
 * @param {'visits' | 'mail'} kind
 * @param {object} query  list filters (page/limit are dropped)
 * @param {string|null} token
 */
export async function downloadAndShareCsv(kind, query, token) {
  const path =
    kind === 'mail' ? '/api/mail/export.csv' : '/api/visits/export.csv';
  const name = `${
    kind === 'mail' ? 'post-register' : 'visitor-log'
  }-${stamp()}.csv`;
  const { page: _page, limit: _limit, ...filters } = query ?? {};
  const target = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/${name}`;
  let res;
  try {
    res = await ReactNativeBlobUtil.config({
      fileCache: true,
      path: target,
    }).fetch(
      'GET',
      `${API_URL}${path}${buildQuery(filters)}`,
      token ? { Authorization: `Bearer ${token}` } : {},
    );
  } catch (e) {
    throw new Error(
      e instanceof Error ? `Export failed: ${e.message}` : 'Export failed.',
    );
  }
  const status = res.info().status;
  if (status < 200 || status >= 300) {
    let message = `Export failed (${status}).`;
    try {
      const text = await ReactNativeBlobUtil.fs.readFile(res.path(), 'utf8');
      message = JSON.parse(text).error.message || message;
    } catch {
      // keep default
    }
    await ReactNativeBlobUtil.fs.unlink(res.path()).catch(() => undefined);
    throw new Error(message);
  }
  try {
    await Share.open({
      url: `file://${res.path()}`,
      type: 'text/csv',
      filename: name,
      title: kind === 'mail' ? 'Export post register' : 'Export visitor log',
      failOnCancel: false,
    });
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : 'Sharing failed.');
  }
}
