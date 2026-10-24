import { API_URL, fileUrl } from '../src/api/config';

test('the server URL is a bare origin (the app adds /api/... itself)', () => {
  expect(API_URL).toMatch(/^https?:\/\/[^/]+$/);
});

test('photo paths are prefixed with the server URL', () => {
  expect(fileUrl('/api/files/a.jpg?sig=1')).toBe(
    `${API_URL}/api/files/a.jpg?sig=1`,
  );
  expect(fileUrl('https://cdn.example.com/a.jpg')).toBe(
    'https://cdn.example.com/a.jpg',
  );
  expect(fileUrl(null)).toBeNull();
});
