import AddIcon from '@mui/icons-material/Add';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import BarChartIcon from '@mui/icons-material/BarChart';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import KeyOutlinedIcon from '@mui/icons-material/KeyOutlined';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import ListAltIcon from '@mui/icons-material/ListAlt';
import MailOutlineIcon from '@mui/icons-material/EmailOutlined';
import MarkunreadMailboxOutlinedIcon from '@mui/icons-material/MarkunreadMailboxOutlined';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import PersonOutlineIcon from '@mui/icons-material/PersonOutlined';
import NotificationsNoneOutlinedIcon from '@mui/icons-material/NotificationsNoneOutlined';
import SettingsIcon from '@mui/icons-material/Settings';
import AppBar from '@mui/material/AppBar';
import Badge from '@mui/material/Badge';
import BottomNavigation from '@mui/material/BottomNavigation';
import BottomNavigationAction from '@mui/material/BottomNavigationAction';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Drawer from '@mui/material/Drawer';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import RadarIcon from '@mui/icons-material/Radar';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useUser } from '../auth/context';
import { hasModule, isEmployee, isRecipient, ROLE_LABEL } from '../auth/roles';
import { useIsDesktop } from '../hooks';
import {
  useExpected,
  useInside,
  useMailCounts,
  useMyVisitors,
  useNotifications,
  useSettings,
  useSite,
  useTrack,
} from '../state/context';
import { PushBanner } from './PushAlerts';
import { fileUrl } from '../api/client';
import { fonts, RAIL_WIDTH } from '../theme/tokens';
import { IssueAlerts, MailNotifier } from './mail/IssueAlerts';
import { NotificationBell } from './NotificationBell';
import { HostVisitNotifier, VisitAlerts } from './VisitAlerts';

/**
 * Logo on a white rounded tile (its colours would disappear on the dark rail): the company logo from Settings →
 * Company when there is one (up to 3× as wide as tall), otherwise the Gatebook mark.
 */
export function LogoTile({ size, src }) {
  if (src) {
    return (
      <Box
        aria-hidden
        sx={{
          height: size,
          maxWidth: size * 3,
          px: `${Math.round(size * 0.12)}px`,
          borderRadius: `${Math.round(size * 0.24)}px`,
          bgcolor: '#fff',
          display: 'grid',
          placeItems: 'center',
          flexShrink: 0,
        }}
      >
        <Box component="img" src={fileUrl(src)} alt="" sx={{ maxWidth: '100%', height: '78%', objectFit: 'contain' }} />
      </Box>
    );
  }
  return (
    <Box
      aria-hidden
      sx={{
        width: size,
        height: size,
        borderRadius: `${Math.round(size * 0.24)}px`,
        bgcolor: '#fff',
        display: 'grid',
        placeItems: 'center',
        flexShrink: 0,
      }}
    >
      <Box component="img" src="/logo.png" alt="" sx={{ width: '82%', height: '82%', objectFit: 'contain' }} />
    </Box>
  );
}

function Brand({ compact = false }) {
  const user = useUser();
  const { settings } = useSettings();
  const company = settings?.company;
  const sub = company?.name || (isEmployee(user) ? 'Host desk' : 'Visitor register');
  return (
    <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', minWidth: 0 }}>
      <LogoTile size={compact ? 32 : 38} src={company?.logoUrl} />
      <Box sx={{ minWidth: 0 }}>
        <Typography
          sx={{
            fontFamily: fonts.display,
            fontWeight: 700,
            letterSpacing: '0.14em',
            fontSize: compact ? 18 : 21,
            lineHeight: 1,
            color: 'gb.railInk',
          }}
        >
          GATEBOOK
        </Typography>
        {!compact ? (
          <Typography sx={{ fontSize: 12, color: 'gb.railMuted', mt: 0.25 }} noWrap>
            {sub}
          </Typography>
        ) : null}
      </Box>
    </Stack>
  );
}

/** Count pill in the rail. tone: 'ok' (green), 'warn' (amber). */
function CountBadge({ count, tone = 'ok' }) {
  if (count === null || count === undefined) return null;
  const on = count > 0;
  return (
    <Box
      component="span"
      sx={{
        fontFamily: fonts.mono,
        fontSize: 12,
        fontWeight: 500,
        px: 1,
        py: '1px',
        borderRadius: '20px',
        bgcolor: on ? (tone === 'warn' ? 'gb.accent' : 'gb.ok') : 'rgba(255,255,255,0.08)',
        color: on ? (tone === 'warn' ? 'gb.accentInk' : '#fff') : 'gb.railMuted',
      }}
    >
      {count}
    </Box>
  );
}

function RailGroup({ label }) {
  return (
    <Typography
      sx={{
        px: 1.5,
        pt: 2.5,
        pb: 0.75,
        fontFamily: fonts.display,
        fontWeight: 600,
        fontSize: 12,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: 'gb.railMuted',
      }}
    >
      {label}
    </Typography>
  );
}

function RailLink({ to, icon, label, right, end }) {
  return (
    <ListItemButton
      component={NavLink}
      to={to}
      end={end}
      sx={(theme) => ({
        borderRadius: 1,
        minHeight: 44,
        px: 1.5,
        color: theme.vars.palette.gb.railInk,
        '& .MuiListItemIcon-root': { color: theme.vars.palette.gb.railMuted, minWidth: 34 },
        '&:hover': { backgroundColor: 'rgba(255,255,255,0.05)' },
        '&.active': {
          backgroundColor: 'rgba(255,255,255,0.09)',
          boxShadow: `inset 3px 0 0 ${theme.vars.palette.gb.accent}`,
          '& .MuiListItemIcon-root': { color: theme.vars.palette.gb.accent },
        },
      })}
    >
      <ListItemIcon>{icon}</ListItemIcon>
      <ListItemText primary={label} slotProps={{ primary: { sx: { fontWeight: 600, fontSize: 15 } } }} />
      {right}
    </ListItemButton>
  );
}

/** Post room count: lodged items; amber when there are disputes. Employees: lodged + handed (amber). */
function useMailBadge(employee) {
  const { counts } = useMailCounts();
  if (!counts) return { count: null, tone: 'ok' };
  if (employee) return { count: counts.lodged + counts.handed, tone: 'warn' };
  return { count: counts.lodged, tone: counts.disputed > 0 ? 'warn' : 'ok' };
}

/** TRACK count for the menu: items to act on; amber when any is urgent. */
function useTrackBadge() {
  const { data } = useTrack();
  if (!data) return { count: null, tone: 'ok' };
  return { count: data.counts.total, tone: data.counts.urgent ? 'warn' : 'ok' };
}

/** "This gate" picker (gate users, several gates). `onRail`: light text on the dark rail. */
function GatePicker({ onRail, compact }) {
  const { site, sites, multi, setSite } = useSite();
  if (!multi) return null;
  return (
    <TextField
      select
      size="small"
      label={compact ? undefined : 'This gate'}
      value={site}
      onChange={(e) => setSite(e.target.value)}
      slotProps={{ htmlInput: { 'aria-label': 'This gate' } }}
      sx={
        onRail
          ? {
              '& .MuiInputBase-root': { color: 'gb.railInk', bgcolor: 'rgba(255,255,255,0.06)' },
              '& .MuiInputLabel-root': { color: 'gb.railMuted' },
              '& .MuiSvgIcon-root': { color: 'gb.railMuted' },
              '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' },
              minWidth: compact ? 130 : undefined,
            }
          : undefined
      }
      fullWidth={!compact}
    >
      {sites.map((s) => (
        <MenuItem key={s} value={s}>
          {s}
        </MenuItem>
      ))}
    </TextField>
  );
}

function DesktopRail() {
  const user = useUser();
  const employee = isEmployee(user);
  const { count } = useInside();
  const mail = useMailBadge(employee);
  const track = useTrackBadge();
  const { unreadCount: unread } = useNotifications();
  const { waiting: myVisitors } = useMyVisitors();
  const { today: expectedToday } = useExpected();
  return (
    <Drawer
      variant="permanent"
      sx={{ width: RAIL_WIDTH, flexShrink: 0 }}
      slotProps={{
        paper: {
          sx: {
            width: RAIL_WIDTH,
            bgcolor: 'gb.rail',
            color: 'gb.railInk',
            borderRight: 'none',
            borderRadius: 0,
            p: 1.5,
            display: 'flex',
            flexDirection: 'column',
          },
        },
      }}
    >
      <Box sx={{ px: 1, pt: 1, pb: 2.5 }}>
        <Brand />
      </Box>
      {employee ? (
        <List disablePadding sx={{ display: 'grid', gap: 0.5 }}>
          <RailLink
            to="/my-visitors"
            icon={<BadgeOutlinedIcon />}
            label="My visitors"
            right={<CountBadge count={myVisitors} tone="warn" />}
          />
          {hasModule(user, 'expected') ? (
            <RailLink to="/expected" icon={<EventAvailableOutlinedIcon />} label="Expected" />
          ) : null}
          {hasModule(user, 'material') ? (
            <RailLink to="/material" icon={<Inventory2OutlinedIcon />} label="Gate passes" />
          ) : null}
          {hasModule(user, 'incidents') ? (
            <RailLink to="/incidents" icon={<ReportProblemOutlinedIcon />} label="Incidents" />
          ) : null}
          {hasModule(user, 'post') ? (
            <RailLink
              to="/my-post"
              icon={<MarkunreadMailboxOutlinedIcon />}
              label="My post"
              right={<CountBadge count={mail.count} tone="warn" />}
            />
          ) : null}
          <RailLink
            to="/notifications"
            icon={<NotificationsNoneOutlinedIcon />}
            label="Notifications"
            right={<CountBadge count={unread} tone="warn" />}
          />
          <RailLink to="/settings" icon={<PersonOutlineIcon />} label="My account" />
        </List>
      ) : (
        <>
          {hasModule(user, 'visitors') ? (
            <Button
              component={NavLink}
              to="/check-in"
              variant="contained"
              color="primary"
              size="large"
              startIcon={<AddIcon />}
              fullWidth
            >
              Check in
            </Button>
          ) : null}
          <RailGroup label="Register" />
          <List disablePadding sx={{ display: 'grid', gap: 0.5 }}>
            {hasModule(user, 'track') ? (
              <RailLink
                to="/track"
                icon={<RadarIcon />}
                label="TRACK"
                right={<CountBadge count={track.count} tone={track.tone} />}
              />
            ) : null}
            {hasModule(user, 'visitors') ? (
              <RailLink to="/inside" icon={<PeopleAltIcon />} label="Inside now" right={<CountBadge count={count} />} />
            ) : null}
            {hasModule(user, 'post') ? (
              <RailLink
                to="/post"
                icon={<MailOutlineIcon />}
                label="Post room"
                right={<CountBadge count={mail.count} tone={mail.tone} />}
              />
            ) : null}
            {hasModule(user, 'expected') ? (
              <RailLink
                to="/expected"
                icon={<EventAvailableOutlinedIcon />}
                label="Expected"
                right={<CountBadge count={expectedToday} />}
              />
            ) : null}
            {hasModule(user, 'material') ? (
              <RailLink to="/material" icon={<Inventory2OutlinedIcon />} label="Material passes" />
            ) : null}
            {hasModule(user, 'keys') ? <RailLink to="/keys" icon={<KeyOutlinedIcon />} label="Key register" /> : null}
            {hasModule(user, 'incidents') ? (
              <RailLink to="/incidents" icon={<ReportProblemOutlinedIcon />} label="Incidents" />
            ) : null}
            {hasModule(user, 'patrol') ? <RailLink to="/patrol" icon={<ShieldOutlinedIcon />} label="Patrols" /> : null}
            {hasModule(user, 'gen') ? <RailLink to="/generator" icon={<BoltOutlinedIcon />} label="Generator" /> : null}
            {hasModule(user, 'visitors') ? <RailLink to="/log" icon={<ListAltIcon />} label="Visitor log" /> : null}
            {hasModule(user, 'track') ? <RailLink to="/overview" icon={<BarChartIcon />} label="Overview" /> : null}
            {isRecipient(user) ? (
              <>
                <RailLink
                  to="/my-visitors"
                  icon={<BadgeOutlinedIcon />}
                  label="My visitors"
                  right={<CountBadge count={myVisitors} tone="warn" />}
                />
                {hasModule(user, 'post') ? (
                  <RailLink to="/my-post" icon={<MarkunreadMailboxOutlinedIcon />} label="My post" />
                ) : null}
              </>
            ) : null}
            <RailLink
              to="/notifications"
              icon={<NotificationsNoneOutlinedIcon />}
              label="Notifications"
              right={<CountBadge count={unread} tone="warn" />}
            />
          </List>
          <RailGroup label="Admin" />
          <List disablePadding>
            <RailLink to="/settings" icon={<SettingsIcon />} label="Settings" />
          </List>
        </>
      )}
      <Box sx={{ flex: 1 }} />
      <Box sx={{ px: 0.5, pb: 1.5 }}>
        <GatePicker onRail />
      </Box>
      <Box sx={{ px: 0.5, pb: 1 }}>
        <Typography sx={{ fontSize: 13, color: 'gb.railMuted' }}>
          Signed in as{' '}
          <Box component="span" sx={{ color: 'gb.railInk', fontWeight: 600 }}>
            {user.name}
          </Box>
          {` · ${ROLE_LABEL[user.role] ?? user.role}`}
        </Typography>
      </Box>
    </Drawer>
  );
}

/** Phone tabs; `module` hides a tab the person has no access to. */
const GATE_TABS = [
  { value: '/track', label: 'TRACK', icon: <RadarIcon />, module: 'track' },
  { value: '/inside', label: 'Inside now', icon: <PeopleAltIcon />, module: 'visitors' },
  { value: '/check-in', label: 'Check in', icon: <AddIcon />, raised: true, module: 'visitors' },
  { value: '/post', label: 'Post', icon: <MailOutlineIcon />, module: 'post' },
  { value: '/log', label: 'Log', icon: <ListAltIcon />, module: 'visitors' },
  { value: '/settings', label: 'Account', icon: <PersonOutlineIcon /> },
];
const EMPLOYEE_TABS = [
  { value: '/my-visitors', label: 'Visitors', icon: <BadgeOutlinedIcon /> },
  { value: '/expected', label: 'Expected', icon: <EventAvailableOutlinedIcon />, module: 'expected' },
  { value: '/my-post', label: 'My post', icon: <MarkunreadMailboxOutlinedIcon />, module: 'post' },
  { value: '/material', label: 'Gate passes', icon: <Inventory2OutlinedIcon />, module: 'material' },
  { value: '/settings', label: 'Account', icon: <PersonOutlineIcon /> },
];

function TabBadge({ count, tone, children }) {
  return (
    <Badge
      badgeContent={count ?? 0}
      max={999}
      sx={{
        '& .MuiBadge-badge': {
          bgcolor: tone === 'warn' ? 'gb.accent' : 'gb.ok',
          color: tone === 'warn' ? 'gb.accentInk' : '#fff',
          fontFamily: fonts.mono,
          fontSize: 11,
        },
      }}
    >
      {children}
    </Badge>
  );
}

function PhoneChrome() {
  const user = useUser();
  const employee = isEmployee(user);
  const { count } = useInside();
  const mail = useMailBadge(employee);
  const track = useTrackBadge();
  const { waiting: myVisitors } = useMyVisitors();
  const { today: expectedToday } = useExpected();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const tabs = (employee ? EMPLOYEE_TABS : GATE_TABS).filter(
    (t) => !t.module || hasModule(user, /** @type {any} */ (t.module)),
  );
  const current = tabs.find((t) => pathname === t.value || pathname.startsWith(`${t.value}/`))?.value ?? false;
  const badgeFor = (t) => {
    if (t.value === '/track') return track;
    if (t.value === '/inside') return { count, tone: 'ok' };
    if (t.value === '/expected') return { count: expectedToday, tone: 'ok' };
    if (t.value === '/my-visitors') return { count: myVisitors, tone: 'warn' };
    if (t.value === '/post' || t.value === '/my-post') return mail;
    return null;
  };
  return (
    <>
      <AppBar position="sticky" elevation={0} sx={{ bgcolor: 'gb.rail', color: 'gb.railInk', backgroundImage: 'none' }}>
        <Toolbar sx={{ gap: 1.5, justifyContent: 'space-between', minHeight: 60, px: 2 }}>
          <Brand compact />
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <GatePicker onRail compact />
            <NotificationBell onRail />
          </Stack>
        </Toolbar>
      </AppBar>
      <Box
        component="nav"
        sx={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: (t) => t.zIndex.appBar,
          bgcolor: 'gb.rail',
          pb: 'env(safe-area-inset-bottom)',
          borderTop: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <BottomNavigation
          showLabels
          value={current}
          onChange={(_, v) => navigate(v)}
          sx={{ bgcolor: 'transparent', height: 64 }}
        >
          {tabs.map((t) => {
            if (t.raised) {
              return (
                <BottomNavigationAction
                  key={t.value}
                  value={t.value}
                  label={t.label}
                  icon={
                    <Box
                      sx={{
                        width: 52,
                        height: 52,
                        mt: '-26px',
                        mb: '2px',
                        borderRadius: '50%',
                        bgcolor: 'gb.accent',
                        color: 'gb.accentInk',
                        display: 'grid',
                        placeItems: 'center',
                        border: '4px solid',
                        borderColor: 'gb.rail',
                        boxShadow: '0 6px 16px rgba(0,0,0,0.35)',
                      }}
                    >
                      <AddIcon sx={{ fontSize: 28 }} />
                    </Box>
                  }
                  sx={{ '&.Mui-selected': { color: 'gb.accent' } }}
                />
              );
            }
            const b = badgeFor(t);
            return (
              <BottomNavigationAction
                key={t.value}
                value={t.value}
                label={t.label}
                icon={
                  b ? (
                    <TabBadge count={b.count} tone={b.tone}>
                      {t.icon}
                    </TabBadge>
                  ) : (
                    t.icon
                  )
                }
              />
            );
          })}
        </BottomNavigation>
      </Box>
    </>
  );
}

export function AppShell() {
  const desktop = useIsDesktop();
  const user = useUser();
  const employee = isEmployee(user);
  return (
    <Box sx={{ display: 'flex', minHeight: '100dvh', bgcolor: 'background.default' }}>
      {desktop ? <DesktopRail /> : null}
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {!desktop ? <PhoneChrome /> : null}
        <Box
          component="main"
          sx={{
            flex: 1,
            width: '100%',
            maxWidth: 1440,
            mx: 'auto',
            px: { xs: 2, md: 4 },
            pt: { xs: 2.5, md: 4 },
            pb: { xs: 'calc(96px + env(safe-area-inset-bottom))', md: 6 },
          }}
        >
          {desktop ? (
            <Stack direction="row" sx={{ justifyContent: 'flex-end', mt: -2, mb: 1 }}>
              <NotificationBell />
            </Stack>
          ) : null}
          <PushBanner />
          {!employee && hasModule(user, 'visitors') ? <VisitAlerts /> : null}
          {!employee && hasModule(user, 'post') ? <IssueAlerts /> : null}
          {isRecipient(user) ? <MailNotifier /> : null}
          {isRecipient(user) ? <HostVisitNotifier /> : null}
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
