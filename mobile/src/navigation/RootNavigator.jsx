import React, { useEffect, useMemo } from 'react';
import { StatusBar } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
} from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LoginScreen } from '../auth/LoginScreen';
import { CreateAccountScreen } from '../auth/CreateAccountScreen';
import { IssueAlerts } from '../components/IssueAlerts';
import { VisitAlerts } from '../components/VisitAlerts';
import { SheetHost } from '../components/SheetHost';
import { TabBar } from '../components/TabBar';
import { ToastHost } from '../components/Toast';
import { TopBar } from '../components/TopBar';
import { useRealtime } from '../realtime/useRealtime';
import {
  usePushOpenListeners,
  usePushRegistration,
  usePushRouting,
} from '../push/usePush';
import { navigationReady } from '../store/pushSlice';
import { navigationRef } from './navigationRef';
import { useAppConfig } from '../store/useAppConfig';
import { ForceUpdateDialog } from '../components/ForceUpdateDialog';
import { useForceUpdate } from '../state/useForceUpdate';
import { AccountScreen } from '../screens/AccountScreen';
import { CheckInScreen } from '../screens/CheckInScreen';
import { ExpectedFormScreen } from '../screens/ExpectedFormScreen';
import { ExpectedScreen } from '../screens/ExpectedScreen';
import { MaterialDetailsScreen } from '../screens/MaterialDetailsScreen';
import { MaterialFormScreen } from '../screens/MaterialFormScreen';
import { MaterialScreen } from '../screens/MaterialScreen';
import { IncidentDetailsScreen } from '../screens/IncidentDetailsScreen';
import { IncidentFormScreen } from '../screens/IncidentFormScreen';
import { IncidentsScreen } from '../screens/IncidentsScreen';
import { KeyIssueScreen } from '../screens/KeyIssueScreen';
import { KeysScreen } from '../screens/KeysScreen';
import { TrackScreen } from '../screens/TrackScreen';
import { loadSite } from '../store/siteSlice';
import { GeneratorScreen } from '../screens/GeneratorScreen';
import { PatrolScanScreen } from '../screens/PatrolScanScreen';
import { PatrolScreen } from '../screens/PatrolScreen';
import { InsideScreen } from '../screens/InsideScreen';
import { LogMailScreen } from '../screens/LogMailScreen';
import { LogScreen } from '../screens/LogScreen';
import { MailDetailsScreen } from '../screens/MailDetailsScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { MyPostScreen } from '../screens/MyPostScreen';
import { MyVisitorsScreen } from '../screens/MyVisitorsScreen';
import { PostRoomScreen } from '../screens/PostRoomScreen';
import { TodayScreen } from '../screens/TodayScreen';
import { MoreScreen } from '../screens/MoreScreen';
import { VisitDetailsScreen } from '../screens/VisitDetailsScreen';
import { useGetSettingsQuery } from '../store/api';
import { selectSettings } from '../store/settingsSlice';
import {
  selectAuthReady,
  selectHasModule,
  selectIsGateUser,
  selectIsSignedIn,
  selectUser,
} from '../store/authSlice';
import { useTheme } from '../theme';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function renderTabBar(props) {
  return <TabBar {...props} />;
}

/**
 * App bar props from a screen's navigation options: `title`, `headerSubtitle` and `headerActions`
 * (a React element for the right side; screens set the dynamic ones with navigation.setOptions).
 */
function barProps(options) {
  return {
    title: options.title,
    subtitle: options.headerSubtitle,
    right: options.headerActions ?? null,
    // The bell is on every signed-in screen except the Notifications screen itself.
    showBell: options.hideBell !== true,
  };
}

/** The app bar with the company logo from settings (Settings → Company). */
function BrandedTopBar(props) {
  const logoUrl = useSelector(s => selectSettings(s).company?.logoUrl ?? null);
  return <TopBar {...props} logoUrl={logoUrl} />;
}

/** Gate tabs opened from More (left off the bottom bar): their app bar gets a back button to More. */
const FROM_MORE = ['Log', 'Account'];

/** Gate screens: app bar plus the visitor alert rows (host answered / no reply) and the disputed-post rows. */
function renderGateHeader({ navigation, route, options }) {
  const fromMore = FROM_MORE.includes(route.name);
  return (
    <>
      <BrandedTopBar
        {...barProps(options)}
        onBack={fromMore ? () => navigation.navigate('More') : undefined}
      />
      <VisitAlerts />
      <IssueAlerts />
    </>
  );
}

function renderGateStackHeader({ navigation, options }) {
  return (
    <>
      <BrandedTopBar
        {...barProps(options)}
        onBack={() => navigation.goBack()}
      />
      <VisitAlerts />
      <IssueAlerts />
    </>
  );
}

function renderEmployeeHeader({ options }) {
  return <BrandedTopBar {...barProps(options)} />;
}

function renderEmployeeStackHeader({ navigation, options }) {
  return (
    <BrandedTopBar {...barProps(options)} onBack={() => navigation.goBack()} />
  );
}

/**
 * Security / admin / viewer: TRACK · Inside now · Check in (raised, centre) · Post · More. Visitor log and Account are
 * reached from More (hidden tabs). Opens on Check in. Tabs for modules the person has not been given are left out.
 */
function GateTabs() {
  const visitors = useSelector(selectHasModule('visitors'));
  const track = useSelector(selectHasModule('track'));
  const post = useSelector(selectHasModule('post'));
  const register = visitors || track;
  return (
    <Tab.Navigator
      initialRouteName={
        visitors ? 'CheckIn' : register ? 'Inside' : post ? 'Post' : 'Account'
      }
      tabBar={renderTabBar}
      backBehavior="history"
      screenOptions={{ header: renderGateHeader, lazy: true }}
    >
      {track ? (
        <Tab.Screen
          name="Track"
          component={TrackScreen}
          options={{ title: 'TRACK' }}
        />
      ) : null}
      {register ? (
        <Tab.Screen
          name="Inside"
          component={InsideScreen}
          options={{ title: 'Inside now' }}
        />
      ) : null}
      {visitors ? (
        <Tab.Screen
          name="CheckIn"
          component={CheckInScreen}
          options={{ title: 'Check in' }}
        />
      ) : null}
      {post ? (
        <Tab.Screen
          name="Post"
          component={PostRoomScreen}
          options={{ title: 'Post room' }}
        />
      ) : null}
      <Tab.Screen
        name="More"
        component={MoreScreen}
        options={{ title: 'More' }}
      />
      {/* Opened from More; kept as (hidden) tabs so links like Main → Account keep working. */}
      {register ? (
        <Tab.Screen
          name="Log"
          component={LogScreen}
          options={{ title: 'Visitor log' }}
        />
      ) : null}
      <Tab.Screen
        name="Account"
        component={AccountScreen}
        options={{ title: 'Account' }}
      />
    </Tab.Navigator>
  );
}

/** Employees: Visitors · Expected · My post · Account. Opens on Visitors (their own visitors); no gate register. */
function EmployeeTabs() {
  const expected = useSelector(selectHasModule('expected'));
  const post = useSelector(selectHasModule('post'));
  const material = useSelector(selectHasModule('material'));
  return (
    <Tab.Navigator
      initialRouteName="MyVisitors"
      tabBar={renderTabBar}
      backBehavior="history"
      screenOptions={{ header: renderEmployeeHeader, lazy: true }}
    >
      <Tab.Screen
        name="MyVisitors"
        component={MyVisitorsScreen}
        options={{ title: 'My visitors' }}
      />
      {expected ? (
        <Tab.Screen
          name="Expected"
          component={ExpectedScreen}
          options={{ title: 'Expected' }}
        />
      ) : null}
      {material ? (
        <Tab.Screen
          name="GatePasses"
          component={MaterialScreen}
          options={{ title: 'Gate passes' }}
        />
      ) : null}
      {post ? (
        <Tab.Screen
          name="MyPost"
          component={MyPostScreen}
          options={{ title: 'My post' }}
        />
      ) : null}
      <Tab.Screen
        name="Account"
        component={AccountScreen}
        options={{ title: 'My account' }}
      />
    </Tab.Navigator>
  );
}

const modal = {
  presentation: 'fullScreenModal',
  animation: 'slide_from_bottom',
};

function GateStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Main" component={GateTabs} />
      <Stack.Screen
        name="Today"
        component={TodayScreen}
        options={{
          headerShown: true,
          header: renderGateStackHeader,
          title: 'Today at the gate',
        }}
      />
      <Stack.Screen
        name="MyVisitors"
        component={MyVisitorsScreen}
        options={{
          headerShown: true,
          header: renderGateStackHeader,
          title: 'My visitors',
        }}
      />
      <Stack.Screen
        name="Expected"
        component={ExpectedScreen}
        options={{
          headerShown: true,
          header: renderGateStackHeader,
          title: 'Expected',
        }}
      />
      <Stack.Screen
        name="ExpectedForm"
        component={ExpectedFormScreen}
        options={{
          headerShown: true,
          header: renderEmployeeStackHeader,
          title: 'Expect a visitor',
        }}
      />
      <Stack.Screen
        name="Material"
        component={MaterialScreen}
        options={{
          headerShown: true,
          header: renderGateStackHeader,
          title: 'Material passes',
        }}
      />
      <Stack.Screen
        name="MaterialForm"
        component={MaterialFormScreen}
        options={{
          headerShown: true,
          header: renderEmployeeStackHeader,
          title: 'Material pass',
        }}
      />
      <Stack.Screen
        name="MaterialDetails"
        component={MaterialDetailsScreen}
        options={modal}
      />
      <Stack.Screen
        name="Keys"
        component={KeysScreen}
        options={{
          headerShown: true,
          header: renderGateStackHeader,
          title: 'Key register',
        }}
      />
      <Stack.Screen
        name="Patrol"
        component={PatrolScreen}
        options={{
          headerShown: true,
          header: renderGateStackHeader,
          title: 'Patrols',
        }}
      />
      <Stack.Screen
        name="PatrolScan"
        component={PatrolScanScreen}
        options={{
          headerShown: true,
          header: renderEmployeeStackHeader,
          title: 'Scan checkpoint',
        }}
      />
      <Stack.Screen
        name="Generator"
        component={GeneratorScreen}
        options={{
          headerShown: true,
          header: renderGateStackHeader,
          title: 'Generator & diesel',
        }}
      />
      <Stack.Screen
        name="KeyIssue"
        component={KeyIssueScreen}
        options={{
          headerShown: true,
          header: renderEmployeeStackHeader,
          title: 'Issue key',
        }}
      />
      <Stack.Screen
        name="Incidents"
        component={IncidentsScreen}
        options={{
          headerShown: true,
          header: renderGateStackHeader,
          title: 'Incidents',
        }}
      />
      <Stack.Screen
        name="IncidentForm"
        component={IncidentFormScreen}
        options={{
          headerShown: true,
          header: renderEmployeeStackHeader,
          title: 'Report an incident',
        }}
      />
      <Stack.Screen
        name="IncidentDetails"
        component={IncidentDetailsScreen}
        options={modal}
      />
      <Stack.Screen
        name="LogMail"
        component={LogMailScreen}
        options={{
          headerShown: true,
          header: renderGateStackHeader,
          title: 'Log incoming post',
        }}
      />
      <Stack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          headerShown: true,
          header: renderGateStackHeader,
          title: 'Notifications',
          hideBell: true,
        }}
      />
      <Stack.Screen
        name="VisitDetails"
        component={VisitDetailsScreen}
        options={modal}
      />
      <Stack.Screen
        name="MailDetails"
        component={MailDetailsScreen}
        options={modal}
      />
    </Stack.Navigator>
  );
}

function EmployeeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Main" component={EmployeeTabs} />
      <Stack.Screen
        name="MaterialForm"
        component={MaterialFormScreen}
        options={{
          headerShown: true,
          header: renderEmployeeStackHeader,
          title: 'Send material out',
        }}
      />
      <Stack.Screen
        name="MaterialDetails"
        component={MaterialDetailsScreen}
        options={modal}
      />
      <Stack.Screen
        name="ExpectedForm"
        component={ExpectedFormScreen}
        options={{
          headerShown: true,
          header: renderEmployeeStackHeader,
          title: 'Expect a visitor',
        }}
      />
      <Stack.Screen
        name="Incidents"
        component={IncidentsScreen}
        options={{
          headerShown: true,
          header: renderEmployeeStackHeader,
          title: 'Incidents',
        }}
      />
      <Stack.Screen
        name="IncidentForm"
        component={IncidentFormScreen}
        options={{
          headerShown: true,
          header: renderEmployeeStackHeader,
          title: 'Report an incident',
        }}
      />
      <Stack.Screen
        name="IncidentDetails"
        component={IncidentDetailsScreen}
        options={modal}
      />
      <Stack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          headerShown: true,
          header: renderEmployeeStackHeader,
          title: 'Notifications',
          hideBell: true,
        }}
      />
      <Stack.Screen
        name="VisitDetails"
        component={VisitDetailsScreen}
        options={modal}
      />
      <Stack.Screen
        name="MailDetails"
        component={MailDetailsScreen}
        options={modal}
      />
    </Stack.Navigator>
  );
}

/** Signed out: Login and (when the server allows sign-up) Create account. */
function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="CreateAccount" component={CreateAccountScreen} />
    </Stack.Navigator>
  );
}

/** Signed-in shell: socket, settings subscription, role-based navigator. */
function SignedIn() {
  useRealtime();
  usePushRegistration();
  usePushRouting();
  useGetSettingsQuery(); // keeps the settings slice fresh (also refreshed by `settings:updated`)
  const dispatch = useDispatch();
  useEffect(() => {
    dispatch(loadSite()); // the gate this phone works at (several gates)
  }, [dispatch]);
  const gate = useSelector(selectIsGateUser);
  return gate ? <GateStack /> : <EmployeeStack />;
}

export function RootNavigator() {
  const ready = useSelector(selectAuthReady);
  const signedIn = useSelector(selectIsSignedIn);
  const user = useSelector(selectUser);
  const { c, dark } = useTheme();
  const dispatch = useDispatch();
  usePushOpenListeners();
  useAppConfig();
  const { updateRequired, storeVersion, openStore } = useForceUpdate();
  const navTheme = useMemo(() => {
    const base = dark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: c.accent,
        background: c.bg,
        card: c.surface,
        text: c.ink,
        border: c.line,
      },
    };
  }, [c, dark]);

  if (!ready) return null;
  return (
    <NavigationContainer
      ref={navigationRef}
      theme={navTheme}
      onReady={() => dispatch(navigationReady())}
    >
      {/* Top bar and login header are always the dark rail, so light status-bar content everywhere. */}
      <StatusBar barStyle="light-content" backgroundColor={c.rail} />
      {signedIn ? <SignedIn key={`${user.id}:${user.role}`} /> : <AuthStack />}
      <SheetHost />
      <ToastHost />
      <ForceUpdateDialog
        visible={updateRequired}
        storeVersion={storeVersion}
        onUpdate={openStore}
      />
    </NavigationContainer>
  );
}
