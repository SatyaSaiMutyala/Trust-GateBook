/**
 * Thin wrapper over the @react-native-firebase/messaging modular API (v26), so the rest of the app (and the
 * tests) deal with plain functions.
 */
import {
  AuthorizationStatus,
  deleteToken,
  getInitialNotification,
  getMessaging,
  getToken,
  onMessage,
  onNotificationOpenedApp,
  onTokenRefresh,
  requestPermission,
  setBackgroundMessageHandler,
} from '@react-native-firebase/messaging';

const m = () => getMessaging();

export const fcm = {
  /** iOS permission prompt. Resolves true for authorized/provisional. */
  requestIosPermission: async () => {
    const status = await requestPermission(m());
    return (
      status === AuthorizationStatus.AUTHORIZED ||
      status === AuthorizationStatus.PROVISIONAL
    );
  },
  getToken: () => getToken(m()),
  deleteToken: () => deleteToken(m()),
  onTokenRefresh: listener => onTokenRefresh(m(), listener),
  onMessage: listener => onMessage(m(), listener),
  onNotificationOpenedApp: listener => onNotificationOpenedApp(m(), listener),
  getInitialNotification: () => getInitialNotification(m()),
  setBackgroundMessageHandler: handler =>
    setBackgroundMessageHandler(m(), handler),
};
