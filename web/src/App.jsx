import { Navigate, Route, Routes } from 'react-router';
import { useUser } from './auth/context';
import { RequireAuth } from './auth/RequireAuth';
import { isEmployee, isGateUser, isRecipient } from './auth/roles';
import { AppShell } from './components/AppShell';
import { useIsDesktop } from './hooks';
import { CheckInPage } from './pages/checkin/CheckInPage';
import { InsideNowPage } from './pages/InsideNowPage';
import { LoginPage } from './pages/LoginPage';
import { OverviewPage } from './pages/OverviewPage';
import { LogPostPage } from './pages/post/LogPostPage';
import { MyPostPage } from './pages/post/MyPostPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { PostRoomPage } from './pages/post/PostRoomPage';
import { SettingsPage } from './pages/settings/SettingsPage';
import { VisitorLogPage } from './pages/VisitorLogPage';
import { RealtimeProvider } from './realtime/RealtimeProvider';
import { CheckInDraftProvider, MailDraftProvider } from './state/CheckInDraftProvider';
import { InsideProvider } from './state/InsideProvider';
import { MailCountsProvider } from './state/MailCountsProvider';
import { MailUiProvider } from './state/MailUiProvider';
import { NotificationsProvider } from './state/NotificationsProvider';
import { SettingsProvider } from './state/SettingsProvider';
import { VisitUiProvider } from './state/VisitUiProvider';

/** Employees → My post. Gate users: Overview on desktop, Check in on phone. */
function HomeRedirect() {
  const desktop = useIsDesktop();
  const user = useUser();
  if (isEmployee(user)) return <Navigate to="/my-post" replace />;
  return <Navigate to={desktop ? '/overview' : '/check-in'} replace />;
}

/** Only render `children` when `allow(user)`; otherwise go home. */
function Only({ allow, children }) {
  const user = useUser();
  return allow(user) ? children : <Navigate to="/" replace />;
}

/** Everything that needs a signed-in user. */
function SignedInApp() {
  return (
    <RealtimeProvider>
      <SettingsProvider>
        <InsideProvider>
          <MailCountsProvider>
            <CheckInDraftProvider>
              <MailDraftProvider>
                <VisitUiProvider>
                  <MailUiProvider>
                    <NotificationsProvider>
                      <AppShell />
                    </NotificationsProvider>
                  </MailUiProvider>
                </VisitUiProvider>
              </MailDraftProvider>
            </CheckInDraftProvider>
          </MailCountsProvider>
        </InsideProvider>
      </SettingsProvider>
    </RealtimeProvider>
  );
}

const staff = (el) => <Only allow={isGateUser}>{el}</Only>;

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <SignedInApp />
          </RequireAuth>
        }
      >
        <Route index element={<HomeRedirect />} />
        <Route path="check-in" element={staff(<CheckInPage />)} />
        <Route path="inside" element={staff(<InsideNowPage />)} />
        <Route path="log" element={staff(<VisitorLogPage />)} />
        <Route path="overview" element={staff(<OverviewPage />)} />
        <Route path="post" element={staff(<PostRoomPage />)} />
        <Route path="post/new" element={staff(<LogPostPage />)} />
        <Route
          path="my-post"
          element={
            <Only allow={isRecipient}>
              <MyPostPage />
            </Only>
          }
        />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<HomeRedirect />} />
      </Route>
    </Routes>
  );
}
