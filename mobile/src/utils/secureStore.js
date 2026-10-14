import * as Keychain from 'react-native-keychain';

const SERVICE = 'com.app.gatebook.session';

/** Session (token + cached user) in the iOS Keychain / Android Keystore. */
export async function saveSession(token, user) {
  await Keychain.setGenericPassword(
    'session',
    JSON.stringify({ token, user }),
    { service: SERVICE },
  );
}

/** @returns {Promise<{ token: string, user: object | null } | null>} */
export async function loadSession() {
  const creds = await Keychain.getGenericPassword({ service: SERVICE });
  if (!creds) return null;
  try {
    const parsed = JSON.parse(creds.password);
    return parsed && parsed.token ? parsed : null;
  } catch {
    return null;
  }
}

export async function clearSession() {
  await Keychain.resetGenericPassword({ service: SERVICE });
}
