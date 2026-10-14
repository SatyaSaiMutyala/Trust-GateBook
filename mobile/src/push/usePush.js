import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { navigationRef } from '../navigation/navigationRef';
import { selectIsSignedIn } from '../store/authSlice';
import { selectNavReady, selectPendingOpen } from '../store/pushSlice';
import { fcm } from './messaging';
import {
  foregroundMessage,
  pushOpened,
  registerPush,
  registerToken,
  routePendingOpen,
} from './push';

let initialChecked = false;

/**
 * App-wide (mounted once, signed in or not): notification taps from the background and the tap that
 * cold-started the app. The route is stored and handled after sign-in.
 */
export function usePushOpenListeners() {
  const dispatch = useDispatch();
  useEffect(() => {
    let unsubscribe = () => undefined;
    try {
      unsubscribe = fcm.onNotificationOpenedApp(message =>
        dispatch(pushOpened(message)),
      );
      if (!initialChecked) {
        initialChecked = true;
        fcm
          .getInitialNotification()
          .then(message => message && dispatch(pushOpened(message)))
          .catch(() => undefined);
      }
    } catch {
      // Firebase not configured on this build: push is simply off.
    }
    return () => unsubscribe();
  }, [dispatch]);
}

/** Signed-in only: register the device, keep the token fresh, toast foreground messages. */
export function usePushRegistration() {
  const dispatch = useDispatch();
  useEffect(() => {
    dispatch(registerPush());
    let offRefresh = () => undefined;
    let offMessage = () => undefined;
    try {
      offRefresh = fcm.onTokenRefresh(token => dispatch(registerToken(token)));
      offMessage = fcm.onMessage(message =>
        dispatch(foregroundMessage(message)),
      );
    } catch {
      // Firebase not configured on this build.
    }
    return () => {
      offRefresh();
      offMessage();
    };
  }, [dispatch]);
}

/** Navigates to a tapped item once the user is signed in and the navigator is ready. */
export function usePushRouting() {
  const dispatch = useDispatch();
  const pending = useSelector(selectPendingOpen);
  const navReady = useSelector(selectNavReady);
  const signedIn = useSelector(selectIsSignedIn);
  useEffect(() => {
    if (pending && navReady && signedIn)
      dispatch(routePendingOpen(navigationRef));
  }, [pending, navReady, signedIn, dispatch]);
}
