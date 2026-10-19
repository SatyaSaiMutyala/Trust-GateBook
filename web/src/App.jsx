import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import { useAuth, useUser } from './auth/context';
import { useRealtimeEvent } from './realtime/context';
import { RequireAuth } from './auth/RequireAuth';
import { hasModule, isEmployee, isGateUser, isRecipient } from './auth/roles';
import { AppShell } from './components/AppShell';
import { useIsDesktop } from './hooks';
import { CheckInPage } from './pages/checkin/CheckInPage';
import { ExpectedPage } from './pages/ExpectedPage';
import { MaterialPage } from './pages/MaterialPage';
import { IncidentsPage } from './pages/IncidentsPage';
import { KeysPage } from './pages/KeysPage';
import { GeneratorPage } from './pages/GeneratorPage';
import { PatrolsPage } from './pages/PatrolsPage';
import { InsideNowPage } from './pages/InsideNowPage';
import { LoginPage } from './pages/LoginPage';
import { OverviewPage } from './pages/OverviewPage';
import { LogPostPage } from './pages/post/LogPostPage';
import { MyPostPage } from './pages/post/MyPostPage';
import { MyVisitorsPage } from './pages/MyVisitorsPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { PostRoomPage } from './pages/post/PostRoomPage';
import { SettingsPage } from './pages/settings/SettingsPage';
import { TermsPage } from './pages/TermsPage';
import { VisitorLogPage } from './pages/VisitorLogPage';
import { RealtimeProvider } from './realtime/RealtimeProvider';
import { CheckInDraftProvider, MailDraftProvider } from './state/CheckInDraftProvider';
import { ExpectedProvider } from './state/ExpectedProvider';
import { MaterialUiProvider } from './state/MaterialUiProvider';
import { InsideProvider } from './state/InsideProvider';
import { MailCountsProvider } from './state/MailCountsProvider';
import { MailUiProvider } from './state/MailUiProvider';
import { MyVisitorsProvider } from './state/MyVisitorsProvider';
import { NotificationsProvider } from './state/NotificationsProvider';
import { SettingsProvider } from './state/SettingsProvider';
import { SiteProvider } from './state/SiteProvider';
import { TrackProvider } from './state/TrackProvider';
import { TrackPage } from './pages/TrackPage';
import { VisitUiProvider } from './state/VisitUiProvider';

/**
 * Employees → My visitors. Gate users: Overview on desktop, Check in on phone — or the first screen their modules
 * allow.
 */
function HomeRedirect() {
  const desktop = useIsDesktop();
  const user = useUser();
  const { search } = useLocation();
  // A printed patrol QR opens `/?cp=CODE`.
  const cp = new URLSearchParams(search).get('cp');
  if (cp && hasModule(user, 'patrol')) return <Navigate to={`/patrol?cp=${encodeURIComponent(cp)}`} replace />;
  if (isEmployee(user)) return <Navigate to="/my-visitors" replace />;
  const order = desktop
    ? [
        ['track', '/track'],
        ['visitors', '/check-in'],
      ]
    : [
        ['visitors', '/check-in'],
        ['track', '/overview'],
      ];
  const first = [
    ...order,
    ['expected', '/expected'],
    ['post', '/post'],
    ['material', '/material'],
    ['keys', '/keys'],
    ['incidents', '/incidents'],
    ['patrol', '/patrol'],
    ['gen', '/generator'],
  ].find(([m]) => hasModule(user, m));
  return <Navigate to={first ? first[1] : '/settings'} replace />;
}

/** Only render `children` when the user has one of the modules; otherwise go home. */
function NeedsModule({ modules, children }) {
  const user = useUser();
  return modules.some((m) => hasModule(user, m)) ? children : <Navigate to="/" replace />;
}

/** An admin changed my modules / profile: update the app without signing in again. */
function MeSync() {
  const { updateUser } = useAuth();
  useRealtimeEvent('me:updated', ({ user }) => updateUser(user));
  return null;
}

/** A tapped web push alert (service worker): go to its page. */
function PushOpen() {
  const navigate = useNavigate();
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;
    const onMessage = (e) => {
      if (e.data?.type === 'open' && typeof e.data.url === 'string') navigate(e.data.url);
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [navigate]);
  return null;
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
      <MeSync />
      <PushOpen />
      <SettingsProvider>
        <SiteProvider>
          <TrackProvider>
            <InsideProvider>
              <MailCountsProvider>
                <MyVisitorsProvider>
                  <CheckInDraftProvider>
                    <MailDraftProvider>
                      <MaterialUiProvider>
                        <VisitUiProvider>
                          <ExpectedProvider>
                            <MailUiProvider>
                              <NotificationsProvider>
                                <AppShell />
                              </NotificationsProvider>
                            </MailUiProvider>
                          </ExpectedProvider>
                        </VisitUiProvider>
                      </MaterialUiProvider>
                    </MailDraftProvider>
                  </CheckInDraftProvider>
                </MyVisitorsProvider>
              </MailCountsProvider>
            </InsideProvider>
          </TrackProvider>
        </SiteProvider>
      </SettingsProvider>
    </RealtimeProvider>
  );
}

const staff = (el) => <Only allow={isGateUser}>{el}</Only>;
/** @param {string[]} modules @param {import('react').ReactNode} el */
const needs = (modules, el) => <NeedsModule modules={modules}>{el}</NeedsModule>;

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route
        element={
          <RequireAuth>
            <SignedInApp />
          </RequireAuth>
        }
      >
        <Route index element={<HomeRedirect />} />
        <Route path="check-in" element={staff(needs(['visitors'], <CheckInPage />))} />
        <Route path="inside" element={staff(needs(['visitors', 'track'], <InsideNowPage />))} />
        <Route path="log" element={staff(needs(['visitors', 'track'], <VisitorLogPage />))} />
        <Route path="overview" element={staff(needs(['track'], <OverviewPage />))} />
        <Route path="track" element={staff(needs(['track'], <TrackPage />))} />
        <Route path="post" element={staff(needs(['post'], <PostRoomPage />))} />
        <Route path="post/new" element={staff(needs(['post'], <LogPostPage />))} />
        <Route path="my-post" element={<Only allow={isRecipient}>{needs(['post'], <MyPostPage />)}</Only>} />
        <Route
          path="my-visitors"
          element={
            <Only allow={isRecipient}>
              <MyVisitorsPage />
            </Only>
          }
        />
        <Route path="expected" element={needs(['expected'], <ExpectedPage />)} />
        <Route path="material" element={needs(['material'], <MaterialPage />)} />
        <Route path="keys" element={staff(needs(['keys'], <KeysPage />))} />
        <Route path="incidents" element={needs(['incidents'], <IncidentsPage />)} />
        <Route path="patrol" element={staff(needs(['patrol'], <PatrolsPage />))} />
        <Route path="generator" element={staff(needs(['gen'], <GeneratorPage />))} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<HomeRedirect />} />
      </Route>
    </Routes>
  );
}
