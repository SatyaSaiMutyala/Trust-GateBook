import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useGetConfigQuery } from './api';

/**
 * Keeps the public feature switches (GET /api/config) loaded from app start — before login — and
 * refreshes them whenever the app returns to the foreground, so a switch flipped on the server
 * shows or hides Create account / Delete account without a restart.
 */
export function useAppConfig() {
  const { refetch } = useGetConfigQuery();
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') refetch();
    });
    return () => sub.remove();
  }, [refetch]);
}
