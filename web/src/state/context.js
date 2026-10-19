import { createContext, useContext } from 'react';
function required(v, name) {
  if (v === null) throw new Error(`${name} used outside its provider`);
  return v;
}
export const SettingsContext = createContext(null);
export const useSettings = () => required(useContext(SettingsContext), 'useSettings');
/** Inside-now count: { count: number | null, refresh() }. From pagination.total. */
export const InsideContext = createContext(null);
export const useInside = () => required(useContext(InsideContext), 'useInside');
export const ToastContext = createContext(null);
export const useToast = () => required(useContext(ToastContext), 'useToast');
export const VisitUiContext = createContext(null);
export const useVisitUi = () => required(useContext(VisitUiContext), 'useVisitUi');
/**
 * Half-filled check-in form, kept above the routes so it survives live updates
 * and navigating to another screen and back.
 */
export const CheckInDraftContext = createContext(null);
export const useCheckInDraft = () => required(useContext(CheckInDraftContext), 'useCheckInDraft');

/** Half-filled "Log incoming post" form (same rules as the check-in draft). */
export const MailDraftContext = createContext(null);
export const useMailDraft = () => required(useContext(MailDraftContext), 'useMailDraft');

/**
 * Post room counts for the nav: { lodged, handed, disputed } for this gate (gate users) or for me
 * (employees), from the `counts` of `GET /api/mail?limit=1`. `null` until loaded.
 */
export const MailCountsContext = createContext(null);
export const useMailCounts = () => required(useContext(MailCountsContext), 'useMailCounts');

/** Post item details drawer + handover / resolve sheets. */
export const MailUiContext = createContext(null);
export const useMailUi = () => required(useContext(MailUiContext), 'useMailUi');

/**
 * In-app notifications: { unreadCount, refresh(), markRead(id), markAllRead() }.
 * unreadCount is null until the first fetch.
 */
export const NotificationsContext = createContext(null);
export const useNotifications = () => required(useContext(NotificationsContext), 'useNotifications');

/**
 * My visitors (the signed-in user as host): { waiting: number | null, refresh() }, from the `counts` of
 * `GET /api/visits/mine?scope=waiting&limit=1`. `null` until loaded or when the user can't receive visitors.
 */
export const MyVisitorsContext = createContext(null);
export const useMyVisitors = () => required(useContext(MyVisitorsContext), 'useMyVisitors');

/**
 * Expected visitors & deliveries: { today: number | null, refresh(), openNew(kind), openEdit(entry),
 * checkInFrom(entry) }. `today` = still expected today (scoped to me unless I'm a gate user).
 */
export const ExpectedContext = createContext(null);
export const useExpected = () => required(useContext(ExpectedContext), 'useExpected');

export const MaterialUiContext = createContext(null);
export const useMaterialUi = () => required(useContext(MaterialUiContext), 'useMaterialUi');

/** The gate this device works at: { site ('' = one gate / not a gate user), sites, multi, setSite }. */
export const SiteContext = createContext(null);
export const useSite = () => required(useContext(SiteContext), 'useSite');

/** TRACK for this gate: { data, error, refresh, quiet(id), isQuiet(id), sound, setSound }. */
export const TrackContext = createContext(null);
export const useTrack = () => required(useContext(TrackContext), 'useTrack');
