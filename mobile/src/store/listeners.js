import { createListenerMiddleware } from '@reduxjs/toolkit';
import { clearSession, loadSession, saveSession } from '../utils/secureStore';
import { api } from './api';
import { loggedIn, loggedOut, sessionRestored, userUpdated } from './authSlice';

/** Side effects of state changes: persisting the session, resetting caches on logout. */
export const listenerMiddleware = createListenerMiddleware();
const startListening = listenerMiddleware.startListening;

startListening({
  actionCreator: loggedIn,
  effect: async ({ payload }) => {
    await saveSession(payload.token, payload.user).catch(() => undefined);
  },
});

startListening({
  actionCreator: userUpdated,
  effect: async ({ payload }, { getState }) => {
    const token = getState().auth.token;
    if (token) await saveSession(token, payload).catch(() => undefined);
  },
});

startListening({
  actionCreator: loggedOut,
  effect: async (_action, { dispatch }) => {
    dispatch(api.util.resetApiState());
    await clearSession().catch(() => undefined);
  },
});

/** Launch: read the session from the Keychain, then refresh the user. */
export const bootstrap = () => async dispatch => {
  const session = await loadSession().catch(() => null);
  dispatch(sessionRestored(session));
  if (session?.token)
    dispatch(
      api.endpoints.me.initiate(undefined, {
        subscribe: false,
        forceRefetch: true,
      }),
    );
};
