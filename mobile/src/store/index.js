import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { api } from './api';
import auth from './authSlice';
import drafts from './draftsSlice';
import { listenerMiddleware } from './listeners';
import push from './pushSlice';
import settings from './settingsSlice';
import site from './siteSlice';
import ui from './uiSlice';

export const rootReducer = combineReducers({
  auth,
  settings,
  site,
  ui,
  drafts,
  push,
  [api.reducerPath]: api.reducer,
});

/** One store for the app; `preloadedState` is for tests. */
export function makeStore(preloadedState) {
  return configureStore({
    reducer: rootReducer,
    preloadedState,
    middleware: getDefault =>
      getDefault({
        // FormData bodies in mutation args are not serializable; they never reach the state.
        serializableCheck: {
          ignoredActionPaths: ['meta.arg.originalArgs', 'meta.baseQueryMeta'],
        },
      })
        .prepend(listenerMiddleware.middleware)
        .concat(api.middleware),
  });
}

export const store = makeStore();
