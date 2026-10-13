import { createContext, useContext } from 'react';
export const AuthContext = createContext(null);
export function useAuth() {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}
/** The signed-in user (only call below <RequireAuth>). */
export function useUser() {
  const { user } = useAuth();
  if (!user) throw new Error('useUser called without a signed-in user');
  return user;
}
