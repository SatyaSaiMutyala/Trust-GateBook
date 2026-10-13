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
  listeners.js            persistence side effects (Keychain, AsyncStorage), logout resets the API cache
  useInfiniteList.js      FlatList adapter over infinite queries (debounced search, loadMore, pull-to-refresh)
  hooks.js, mailActions.js
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

## Fonts

The TTFs in `assets/fonts` are named after their PostScript names (`Barlow-Regular`, `BarlowCondensed-Bold`,
`JetBrainsMono-Medium`, …), which both platforms resolve as `fontFamily`. After adding or removing a font run
`npx react-native-asset`. Licences (SIL OFL) are in `assets/licenses`.
