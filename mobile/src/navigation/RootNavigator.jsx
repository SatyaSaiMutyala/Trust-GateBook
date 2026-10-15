import React, { useMemo } from 'react';
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
import { AccountScreen } from '../screens/AccountScreen';
import { CheckInScreen } from '../screens/CheckInScreen';
import { InsideScreen } from '../screens/InsideScreen';
import { LogMailScreen } from '../screens/LogMailScreen';
import { LogScreen } from '../screens/LogScreen';
import { MailDetailsScreen } from '../screens/MailDetailsScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { MyPostScreen } from '../screens/MyPostScreen';
import { PostRoomScreen } from '../screens/PostRoomScreen';
import { TodayScreen } from '../screens/TodayScreen';
import { VisitDetailsScreen } from '../screens/VisitDetailsScreen';
import { useGetSettingsQuery } from '../store/api';
import {
  selectAuthReady,
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

/** Gate screens: app bar plus the disputed-post alert rows. */
function renderGateHeader({ options }) {
  return (
    <>
      <TopBar {...barProps(options)} />
      <IssueAlerts />
    </>
  );
}

function renderGateStackHeader({ navigation, options }) {
  return (
    <>
      <TopBar {...barProps(options)} onBack={() => navigation.goBack()} />
      <IssueAlerts />
    </>
  );
}

function renderEmployeeHeader({ options }) {
  return <TopBar {...barProps(options)} />;
}

function renderEmployeeStackHeader({ navigation, options }) {
  return <TopBar {...barProps(options)} onBack={() => navigation.goBack()} />;
}

/** Security / admin / viewer: Inside now · Post · Check in (raised) · Log · Account. Opens on Check in. */
function GateTabs() {
  return (
    <Tab.Navigator
      initialRouteName="CheckIn"
      tabBar={renderTabBar}
      backBehavior="history"
      screenOptions={{ header: renderGateHeader, lazy: true }}
    >
      <Tab.Screen
        name="Inside"
        component={InsideScreen}
        options={{ title: 'Inside now' }}
      />
      <Tab.Screen
        name="Post"
        component={PostRoomScreen}
        options={{ title: 'Post room' }}
      />
      <Tab.Screen
        name="CheckIn"
        component={CheckInScreen}
        options={{ title: 'Check in' }}
      />
      <Tab.Screen
        name="Log"
        component={LogScreen}
        options={{ title: 'Visitor log' }}
      />
      <Tab.Screen
        name="Account"
        component={AccountScreen}
        options={{ title: 'Account' }}
      />
    </Tab.Navigator>
  );
}

/** Employees: My post · Account. Opens on My post; no visitor screens, no gate selector. */
function EmployeeTabs() {
  return (
    <Tab.Navigator
      initialRouteName="MyPost"
      tabBar={renderTabBar}
      backBehavior="history"
      screenOptions={{ header: renderEmployeeHeader, lazy: true }}
    >
      <Tab.Screen
        name="MyPost"
        component={MyPostScreen}
        options={{ title: 'My post' }}
      />
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
    </NavigationContainer>
  );
}
