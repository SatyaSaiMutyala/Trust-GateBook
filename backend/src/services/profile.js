import { z } from 'zod';

/** Profile fields shared by PATCH /api/auth/me and the users admin. */
export const phoneField = z
  .string({ error: 'Mobile number must be text.' })
  .trim()
  .max(20, 'Mobile number is too long.')
  .regex(/^[0-9+\-\s()]*$/, 'Mobile number can only use digits, spaces and +.');
export const deptField = z.string({ error: 'Department must be text.' }).trim().max(80, 'Department is too long.');
export const locationField = z.string({ error: 'Location must be text.' }).trim().max(120, 'Location is too long.');
