# Gatebook mobile

Bare **React Native CLI** app (no Expo) for gate security guards and employees: visitor check-in / inside now / log /
today, and the post room. Plain JavaScript, **Redux Toolkit** (+ RTK Query) for state, **react-native-size-matters**
for sizing. Implements `../docs/API.md` and `../docs/SPEC.md`.

## Requirements

- Node ≥ 22.11, npm
- iOS: Xcode (latest), CocoaPods (`pod`), Ruby
- Android: JDK 17, Android SDK (`ANDROID_HOME=~/Library/Android/sdk`), an emulator or a device

## Setup

```bash
cd mobile
npm install
cp .env.example .env          # set API_URL, see below
cd ios && pod install && cd ..  # or: bundle install && bundle exec pod install
```

Start the backend first (`npm run dev:backend` from the repo root, default `http://localhost:4000`).
First login: `admin@gatebook.local` / `admin123` unless the backend was configured otherwise.

## Running

| | |
| --- | --- |
| Metro bundler | `npm start` |
| iOS simulator | `npm run ios` (or open `ios/Gatebook.xcworkspace` in Xcode) |
| Android emulator / device | `npm run android` |
| Lint | `npm run lint` |
| Tests | `npm test` |

`ios/` and `android/` are committed. `ios/Pods`, `ios/build`, Android build folders, `vendor/` and `.env` are ignored.

## API URL

`API_URL` in `mobile/.env` is read at **build time** by react-native-config (rebuild the app after changing it).

| Where the app runs | Value |
| --- | --- |
| iOS simulator | empty → `http://localhost:4000` |
| Android emulator | empty → `http://10.0.2.2:4000` (the emulator's alias for your computer) |
| Physical phone | your computer's LAN IP, e.g. `API_URL=http://192.168.1.20:4000` (same Wi-Fi; backend listening on all interfaces) |

Find the LAN IP with `ipconfig getifaddr en0` (macOS). The login screen shows which server the app uses. Signed photo
URLs (`/api/files/...`) are prefixed with this base URL; Socket.IO connects to the same URL.

**Plain HTTP:** debug builds allow it (Android `usesCleartextTraffic` is on for debug via the React Native Gradle plugin;
iOS allows local networking through `NSAllowsLocalNetworking`). **Release builds** block cleartext on Android and
non-local HTTP on iOS: use HTTPS for production, or add a network security config / ATS exception deliberately.

## Architecture

```
App.js                    Redux <Provider>, SafeAreaProvider, bootstrap (Keychain session)
src/store/
  index.js                configureStore: auth, settings, ui, drafts slices + RTK Query + listener middleware
  api.js                  RTK Query: every endpoint; infinite queries for paginated lists; tags
                          Visit, Inside, Stats, Mail, MailCounts, Settings, Users, Hosts, Me
  authSlice.js            token/user + role selectors (canCheckIn, isGateUser, isEmployee, isRecipient…)
  settingsSlice.js        latest Settings merged over defaults
  uiSlice.js              toast, open bottom sheet (exit / handover / resolve), issue-alert pulse
  draftsSlice.js          half-filled Check in and Log post forms, dispute notes (survive navigation and live updates)
  pushSlice.js            push permission, registered FCM token, pending notification tap
  listeners.js            persistence side effects (Keychain, AsyncStorage), logout resets the API cache
  useInfiniteList.js      FlatList adapter over infinite queries (debounced search, loadMore, pull-to-refresh)
  hooks.js, mailActions.js
src/push/                 FCM: permission, device registration, foreground toasts, tap routing
src/realtime/             Socket.IO → invalidateTags / cache patches, toasts + vibration for recipients
src/api/                  base URL config, CSV download (react-native-blob-util) + share sheet (react-native-share)
src/components/, src/screens/, src/navigation/, src/theme/, src/utils/
assets/fonts/             Barlow, Barlow Condensed, JetBrains Mono (linked with `npx react-native-asset`)
```

- **Lists** use RTK Query infinite queries: page 1 first, `fetchNextPage` on `onEndReached` while
  `pagination.hasNextPage`, pull-to-refresh reloads page 1, search debounced 300 ms. Counts come from
  `pagination.total` / `counts`.
- **Realtime:** socket events invalidate tags (infinite queries refetch the pages already loaded) and patch the details
  caches. Form drafts live in their own slice, so live updates never reset a half-filled form.
- **Roles:** gate users (security / admin / viewer) get Inside now · Post · Check in · Log · Account; employees (`host`)
  get My post · Account.
- **Single gate:** there is one gate, so the app has no gate selector, gate filter or Gates settings list and never
  sends `site`; the backend defaults it.
- **Sizing:** `ScaledSheet.create` with `@s` / `@vs` / `@ms` annotations, or the pre-scaled tokens in
  `src/theme/tokens.js` (`spacing`, `radius`, `font`, `MIN_TOUCH`). 1–4 px border strokes stay unscaled.

## Push notifications (Firebase Cloud Messaging)

The app uses React Native Firebase 26.4.0 (`@react-native-firebase/app` + `messaging`) with the Firebase project
**trustlab-diagnostics**, app ID `com.app.gatebook` on both platforms. Config files:
`android/app/google-services.json` and `ios/Gatebook/GoogleService-Info.plist` (in the Gatebook target's Copy Bundle
Resources).

**One-time setup**

1. **iOS — APNs:** in the Firebase console → Project settings → Cloud Messaging → Apple app configuration, upload an
   **APNs Authentication Key** (.p8, with Key ID and Team ID) from the Apple Developer account.
2. **iOS — App ID capability:** the App ID `com.app.gatebook` needs **Push Notifications** enabled (Apple Developer →
   Identifiers). In Xcode, Gatebook target → Signing & Capabilities should show *Push Notifications* (from
   `Gatebook/Gatebook.entitlements`, `aps-environment = development`) and *Background Modes → Remote notifications*
   (Info.plist). Use `production` in the entitlements for App Store / TestFlight builds signed with a distribution
   profile (Xcode does this automatically when archiving with automatic signing).
3. **iOS — pods:** `cd ios && pod install`. The Podfile now uses `use_frameworks! :linkage => :static` and
   `$RNFirebaseAsStaticFramework = true` as React Native Firebase requires; open `Gatebook.xcworkspace` afterwards and
   do a clean build.
4. **Android:** nothing extra — the Google Services Gradle plugin reads `google-services.json`. On **Android 13+** the
   app asks for the notification permission after sign-in. Notifications use the channel `gatebook_default`
   ("Gatebook alerts", high importance, created at startup) and the white bell icon `ic_notification`.

**Behaviour**

- After sign-in the app asks for permission, gets the FCM token and registers it with `POST /api/devices`
  (re-registered whenever the token refreshes). Sign-out calls `DELETE /api/devices/:token` and deletes the local
  token before the session is cleared.
- In the foreground a push shows an in-app toast; if the socket already announced the same item within 5 s it is not
  shown twice.
- Tapping a notification (`data: { type: 'mail', id }`) opens the item: gate users land on Post room → item,
  employees on My post → item. A tap that launches the app while signed out is handled after sign-in.
- If permission is refused, nothing breaks; Account shows "Notifications are off — enable them in Settings".
- Push needs a real device for iOS (the simulator cannot receive APNs pushes without extra tooling).

## App icon & splash screen

The Gatebook logo (`assets/gatebook.png`) is the app icon and splash on both platforms:

- **iOS:** `ios/Gatebook/Images.xcassets/AppIcon.appiconset` (logo on white), and `LaunchScreen.storyboard`
  showing `SplashLogo` centred on white.
- **Android:**
  - launcher icons in `res/mipmap-*` (square, round and adaptive foreground, with a white background from `@color/ic_launcher_background`)
  - splash: `LaunchTheme` (`res/values/styles.xml`, and `values-v31` for the Android 12+ system splash)
    shows `@drawable/launch_screen`; `MainActivity` switches to `AppTheme` on start.
- **In the app:** `src/assets/logo*.png` in the top bar and on the login screen.

To change the logo, replace `assets/gatebook.png` and run `node mobile/scripts/generate-icons.cjs` from the repo
root. It regenerates every size, including the web favicon. Then rebuild the native apps.

## Fonts

The TTFs in `assets/fonts` are named after their PostScript names (`Barlow-Regular`, `BarlowCondensed-Bold`,
`JetBrainsMono-Medium`, …), which both platforms resolve as `fontFamily`. After adding or removing a font run
`npx react-native-asset`. Licences (SIL OFL) are in `assets/licenses`.
