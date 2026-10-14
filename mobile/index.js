/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { fcm } from './src/push/messaging';

// FCM data handling while the app is in the background / quit. The OS shows the notification itself
// (every Gatebook push has a `notification` block), so there is nothing to do here.
try {
  fcm.setBackgroundMessageHandler(async () => undefined);
} catch {
  // Firebase not configured on this build: push stays off.
}

AppRegistry.registerComponent(appName, () => App);
