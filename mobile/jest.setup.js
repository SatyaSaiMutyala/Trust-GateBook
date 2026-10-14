/* Mocks for native modules so the store and a render smoke test run under Jest. */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest'),
);
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('react-native-keychain', () => ({
  setGenericPassword: jest.fn(() => Promise.resolve(true)),
  getGenericPassword: jest.fn(() => Promise.resolve(false)),
  resetGenericPassword: jest.fn(() => Promise.resolve(true)),
}));
jest.mock('react-native-config', () => ({ API_URL: 'http://test.local:4000' }));
jest.mock('react-native-image-picker', () => ({ launchCamera: jest.fn() }));
jest.mock('@bam.tech/react-native-image-resizer', () => ({
  createResizedImage: jest.fn(),
}));
jest.mock('react-native-blob-util', () => ({
  config: jest.fn(),
  fs: { dirs: { CacheDir: '/tmp' } },
}));
jest.mock('react-native-share', () => ({ open: jest.fn() }));
jest.mock('@react-native-community/datetimepicker', () => {
  const React = require('react');
  const Picker = () => React.createElement('DateTimePicker');
  return {
    __esModule: true,
    default: Picker,
    DateTimePickerAndroid: { open: jest.fn(), dismiss: jest.fn() },
  };
});
jest.mock('socket.io-client', () => ({
  io: jest.fn(() => ({
    on: jest.fn(),
    removeAllListeners: jest.fn(),
    disconnect: jest.fn(),
  })),
}));
// React Native Firebase (modular API). Tests drive the listeners through `__fcm`.
jest.mock('@react-native-firebase/messaging', () => {
  const listeners = { opened: [], message: [], refresh: [] };
  const sub = list => fn => {
    list.push(fn);
    return () => list.splice(list.indexOf(fn), 1);
  };
  const messaging = {};
  return {
    __esModule: true,
    AuthorizationStatus: {
      NOT_DETERMINED: -1,
      DENIED: 0,
      AUTHORIZED: 1,
      PROVISIONAL: 2,
      EPHEMERAL: 3,
    },
    getMessaging: jest.fn(() => messaging),
    requestPermission: jest.fn(() => Promise.resolve(1)),
    getToken: jest.fn(() => Promise.resolve('fcm-token-1')),
    deleteToken: jest.fn(() => Promise.resolve()),
    onTokenRefresh: jest.fn((_m, fn) => sub(listeners.refresh)(fn)),
    onMessage: jest.fn((_m, fn) => sub(listeners.message)(fn)),
    onNotificationOpenedApp: jest.fn((_m, fn) => sub(listeners.opened)(fn)),
    getInitialNotification: jest.fn(() => Promise.resolve(null)),
    setBackgroundMessageHandler: jest.fn(),
    __fcm: listeners,
  };
});
jest.mock('@react-native-firebase/app', () => ({
  __esModule: true,
  getApp: jest.fn(() => ({})),
}));
