import {
  API_URL,
  PRODUCTION_API_URL,
  fileUrl,
  normalizeBaseUrl,
} from '../src/api/config';

test('the live server is the bare origin (the app adds /api/... itself)', () => {
  expect(PRODUCTION_API_URL).toBe('https://gatebook.mytrustlab.co.in');
});

test('base URLs lose a trailing slash and a trailing /api, so requests never hit /api/api', () => {
  expect(normalizeBaseUrl('https://gatebook.mytrustlab.co.in/api')).toBe(
    'https://gatebook.mytrustlab.co.in',
  );
  expect(normalizeBaseUrl('https://gatebook.mytrustlab.co.in/api/')).toBe(
    'https://gatebook.mytrustlab.co.in',
  );
  expect(normalizeBaseUrl(' http://10.0.2.2:4000/ ')).toBe(
    'http://10.0.2.2:4000',
  );
  expect(normalizeBaseUrl('')).toBe('');
  expect(normalizeBaseUrl(undefined)).toBe('');
});

test('API_URL comes from .env when set (jest sets API_URL) and photo paths are prefixed with it', () => {
  expect(API_URL).toBe('http://test.local:4000');
  expect(fileUrl('/api/files/a.jpg?sig=1')).toBe(
    'http://test.local:4000/api/files/a.jpg?sig=1',
  );
});
