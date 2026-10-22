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
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import LogoutIcon from '@mui/icons-material/Logout';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import AppBar from '@mui/material/AppBar';
import Badge from '@mui/material/Badge';
import BottomNavigation from '@mui/material/BottomNavigation';
import BottomNavigationAction from '@mui/material/BottomNavigationAction';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import Stack from '@mui/material/Stack';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import RadarIcon from '@mui/icons-material/Radar';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useState } from 'react';
import { useAuth, useUser } from '../auth/context';
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
import { fonts, RAIL_BG, RAIL_COLLAPSED, RAIL_WIDTH, TOPBAR_HEIGHT } from '../theme/tokens';
import { initials } from '../utils/format';
import { IssueAlerts, MailNotifier } from './mail/IssueAlerts';
import { NotificationBell } from './NotificationBell';
import { HostVisitNotifier, VisitAlerts } from './VisitAlerts';

/**
 * Logo on a white rounded tile (its colours would disappear on the dark rail): the company logo from Settings →
 * Company when there is one (up to 3× as wide as tall), otherwise the TruSentinel mark.
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

/** Wordmark: "TruSentinel" over the company name (AIMS rail lockup). */
function Brand({ compact = false }) {
  const user = useUser();
  const { settings } = useSettings();
  const company = settings?.company;
  const sub = company?.name || (isEmployee(user) ? 'Host desk' : 'Visitor register');
  return (
    <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', minWidth: 0 }}>
      <LogoTile size={compact ? 32 : 40} src={company?.logoUrl} />
      <Box sx={{ minWidth: 0 }}>
        <Typography
          sx={{ fontWeight: 800, letterSpacing: '0.02em', fontSize: compact ? 18 : 20, lineHeight: 1, color: '#fff' }}
        >
          TruSentinel
        </Typography>
        <Typography
          noWrap
          sx={{
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: '0.155em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,.58)',
            mt: 0.5,
          }}
        >
          {sub}
        </Typography>
      </Box>
    </Stack>
  );
}

/** Count pill in the rail (AIMS nav badge). tone: 'ok' (green), 'warn' (gold). */
function CountBadge({ count, tone = 'ok' }) {
  if (count === null || count === undefined) return null;
  const on = count > 0;
  const warn = tone === 'warn';
  return (
    <Box
      component="span"
      sx={{
        fontFamily: fonts.mono,
        fontSize: 11,
        fontWeight: 600,
        px: 0.875,
        py: '1px',
        borderRadius: '20px',
        flexShrink: 0,
        bgcolor: on ? (warn ? 'rgba(255,200,31,.2)' : 'rgba(51,204,85,.2)') : 'rgba(255,255,255,0.08)',
        color: on ? (warn ? '#FFD45C' : '#4FDD6E') : 'gb.railMuted',
      }}
    >
      {count}
    </Box>
  );
}

/** Small dot on a collapsed rail icon when its count is above zero. */
function CountDot({ count, tone }) {
  if (!count) return null;
  return (
    <Box
      component="span"
      sx={{
        position: 'absolute',
        top: 4,
        right: 4,
        width: 8,
        height: 8,
        borderRadius: '50%',
        bgcolor: tone === 'warn' ? 'gb.gold' : '#4FDD6E',
        boxShadow: '0 0 0 2px #0E3529',
      }}
    />
  );
}

function RailGroup({ label, open }) {
  if (!open) return <Box sx={{ mx: 1.5, my: 1.25, borderTop: '1px solid rgba(255,255,255,.09)' }} />;
  return (
    <Typography
      sx={{
        px: 1.25,
        pt: 2,
        pb: 0.75,
        fontFamily: fonts.mono,
        fontWeight: 600,
        fontSize: 10,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: 'gb.railMuted',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </Typography>
  );
}

/**
 * Rail row (AIMS nav row): coloured icon tile + uppercase label + count. Active = sky-blue tint with a bar in the
 * item's own colour on the left. Collapsed (`open` false): the icon tile only.
 */
function RailLink({ to, icon, label, color, badge, end, open }) {
  return (
    <ListItemButton
      component={NavLink}
      to={to}
      end={end}
      aria-label={open ? undefined : label}
      sx={{
        '--ic': color,
        position: 'relative',
        gap: 1.5,
        px: open ? 1.25 : 0,
        py: open ? 0.75 : 0.5,
        mb: '3px',
        minHeight: 44,
        justifyContent: open ? 'flex-start' : 'center',
        borderRadius: '10px',
        border: '1px solid transparent',
        color: '#E2EDE8',
        transition: 'background-color .12s ease',
        '&:hover': { backgroundColor: 'rgba(255,255,255,.07)' },
        '&.active': open
          ? {
              backgroundColor: 'rgba(46,177,255,.16)',
              borderColor: 'rgba(46,177,255,.35)',
              color: '#fff',
              '&::before': {
                content: '""',
                position: 'absolute',
                left: -9,
                top: 6,
                bottom: 6,
                width: 4,
                borderRadius: '0 4px 4px 0',
                backgroundColor: 'var(--ic)',
              },
            }
          : { backgroundColor: 'transparent', '& .rail-ico': { backgroundColor: 'color-mix(in srgb, var(--ic) 26%, transparent)' } },
      }}
    >
      <Box
        className="rail-ico"
        sx={{
          position: 'relative',
          width: 34,
          height: 34,
          flexShrink: 0,
          borderRadius: '9px',
          display: 'grid',
          placeItems: 'center',
          color: 'var(--ic)',
          backgroundColor: 'rgba(255,255,255,.06)',
          filter: 'brightness(1.18) saturate(1.15)',
          '& .MuiSvgIcon-root': { fontSize: 19 },
        }}
      >
        {icon}
        {!open && badge ? <CountDot count={badge.count} tone={badge.tone} /> : null}
      </Box>
      {open ? (
        <>
          <Typography
            noWrap
            sx={{ flex: 1, fontSize: 11, fontWeight: 600, letterSpacing: '0.9px', textTransform: 'uppercase', color: 'inherit' }}
          >
            {label}
          </Typography>
          {badge ? <CountBadge count={badge.count} tone={badge.tone} /> : null}
        </>
      ) : null}
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

/** "This gate" picker (gate users, several gates). `onRail`: light text on the dark phone bar. */
function GatePicker({ onRail, compact }) {
  const { site, sites, multi, setSite } = useSite();
  if (!multi) return null;
  return (
    <TextField
      select
      size="small"
      value={site}
      onChange={(e) => setSite(e.target.value)}
      slotProps={{ htmlInput: { 'aria-label': 'This gate' } }}
      sx={{
        minWidth: compact ? 130 : 160,
        width: 'auto',
        ...(onRail && {
          '& .MuiInputBase-root': { color: 'gb.railInk', bgcolor: 'rgba(255,255,255,0.06)' },
          '& .MuiSvgIcon-root': { color: 'gb.railMuted' },
          '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' },
        }),
      }}
    >
      {sites.map((s) => (
        <MenuItem key={s} value={s}>
          {s}
        </MenuItem>
      ))}
    </TextField>
  );
}

/** Menu colours per section (AIMS gives every menu its own icon colour). */
const C = {
  track: '#FF8C1A',
  inside: '#12C48B',
  post: '#2288EE',
  expected: '#FFC400',
  material: '#976BFF',
  keys: '#F5A300',
  incidents: '#FF5D5D',
  patrol: '#33CC55',
  gen: '#0EA5A5',
  log: '#5FD3F3',
  overview: '#7FB3FF',
  myVisitors: '#4FD1A5',
  myPost: '#FF7FB6',
  notifications: '#FF9E4A',
  settings: '#93A8B8',
};

/** Sidebar items for this user: `[group, items]`. */
function useRailItems() {
  const user = useUser();
  const employee = isEmployee(user);
  const { count } = useInside();
  const mail = useMailBadge(employee);
  const track = useTrackBadge();
  const { unreadCount: unread } = useNotifications();
  const { waiting: myVisitors } = useMyVisitors();
  const { today: expectedToday } = useExpected();
  const has = (m) => hasModule(user, m);
  const notifications = {
    to: '/notifications',
    icon: <NotificationsNoneOutlinedIcon />,
    label: 'Notifications',
    color: C.notifications,
    badge: { count: unread, tone: 'warn' },
  };
  if (employee) {
    return [
      [
        'My desk',
        [
          {
            to: '/my-visitors',
            icon: <BadgeOutlinedIcon />,
            label: 'My visitors',
            color: C.myVisitors,
            badge: { count: myVisitors, tone: 'warn' },
          },
          has('expected') && { to: '/expected', icon: <EventAvailableOutlinedIcon />, label: 'Expected', color: C.expected },
          has('material') && { to: '/material', icon: <Inventory2OutlinedIcon />, label: 'Gate passes', color: C.material },
          has('incidents') && {
            to: '/incidents',
            icon: <ReportProblemOutlinedIcon />,
            label: 'Incidents',
            color: C.incidents,
          },
          has('post') && {
            to: '/my-post',
            icon: <MarkunreadMailboxOutlinedIcon />,
            label: 'My post',
            color: C.myPost,
            badge: { count: mail.count, tone: 'warn' },
          },
          notifications,
        ],
      ],
      ['Account', [{ to: '/settings', icon: <PersonOutlineIcon />, label: 'My account', color: C.settings }]],
    ];
  }
  return [
    [
      'Register',
      [
        has('track') && { to: '/track', icon: <RadarIcon />, label: 'TRACK', color: C.track, badge: track },
        has('visitors') && {
          to: '/inside',
          icon: <PeopleAltIcon />,
          label: 'Inside now',
          color: C.inside,
          badge: { count, tone: 'ok' },
        },
        has('post') && { to: '/post', icon: <MailOutlineIcon />, label: 'Post room', color: C.post, badge: mail },
        has('expected') && {
          to: '/expected',
          icon: <EventAvailableOutlinedIcon />,
          label: 'Expected',
          color: C.expected,
          badge: { count: expectedToday, tone: 'ok' },
        },
        has('material') && { to: '/material', icon: <Inventory2OutlinedIcon />, label: 'Material passes', color: C.material },
        has('keys') && { to: '/keys', icon: <KeyOutlinedIcon />, label: 'Key register', color: C.keys },
        has('incidents') && { to: '/incidents', icon: <ReportProblemOutlinedIcon />, label: 'Incidents', color: C.incidents },
        has('patrol') && { to: '/patrol', icon: <ShieldOutlinedIcon />, label: 'Patrols', color: C.patrol },
        has('gen') && { to: '/generator', icon: <BoltOutlinedIcon />, label: 'Generator', color: C.gen },
        has('visitors') && { to: '/log', icon: <ListAltIcon />, label: 'Visitor log', color: C.log },
        has('track') && { to: '/overview', icon: <BarChartIcon />, label: 'Overview', color: C.overview },
        isRecipient(user) && {
          to: '/my-visitors',
          icon: <BadgeOutlinedIcon />,
          label: 'My visitors',
          color: C.myVisitors,
          badge: { count: myVisitors, tone: 'warn' },
        },
        isRecipient(user) &&
          has('post') && { to: '/my-post', icon: <MarkunreadMailboxOutlinedIcon />, label: 'My post', color: C.myPost },
        notifications,
      ],
    ],
    ['Admin', [{ to: '/settings', icon: <SettingsIcon />, label: 'Settings', color: C.settings }]],
  ];
}

const PIN_KEY = 'gb.rail.pinned';
/** Remembered pin; without one, the menu starts open on wide screens and as icons below 1200 px. */
function readPinned() {
  const wide = typeof window === 'undefined' || window.innerWidth >= 1200;
  try {
    const v = localStorage.getItem(PIN_KEY);
    return v === null ? wide : v === '1';
  } catch {
    return wide;
  }
}

/**
 * Desktop sidebar (AIMS rail): dark green gradient, 258px; unpinned it collapses to 66px of icons and opens over
 * the page while hovered. The pin is remembered on this browser.
 */
function DesktopRail() {
  const user = useUser();
  const groups = useRailItems();
  const [pinned, setPinned] = useState(readPinned);
  const [hover, setHover] = useState(false);
  const open = pinned || hover;
  const togglePin = () => {
    setPinned((p) => {
      try {
        localStorage.setItem(PIN_KEY, p ? '0' : '1');
      } catch {
        /* storage blocked: keep it for this visit only */
      }
      return !p;
    });
    setHover(false);
  };
  return (
    <Box sx={{ width: pinned ? RAIL_WIDTH : RAIL_COLLAPSED, flexShrink: 0, transition: 'width .16s ease' }}>
      <Box
        component="nav"
        aria-label="Main menu"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        sx={{
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          zIndex: 1200,
          width: open ? RAIL_WIDTH : RAIL_COLLAPSED,
          transition: 'width .16s ease',
          overflow: 'hidden',
          background: RAIL_BG,
          color: 'gb.railInk',
          display: 'flex',
          flexDirection: 'column',
          boxShadow:
            hover && !pinned
              ? '6px 0 24px rgba(16,21,28,.22)'
              : '2px 0 16px -8px rgba(0,0,0,.45), inset -1px 0 0 rgba(255,255,255,.055)',
        }}
      >
        <Stack
          direction="row"
          sx={{
            height: TOPBAR_HEIGHT + 6,
            px: open ? 1.75 : 1.5,
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
            flexShrink: 0,
            background: 'linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,.018))',
            borderBottom: '1px solid rgba(255,255,255,.09)',
          }}
        >
          {open ? <Brand /> : <LogoTile size={40} src={null} />}
          {open ? (
            <IconButton
              size="small"
              onClick={togglePin}
              aria-pressed={pinned}
              aria-label={pinned ? 'Unpin menu (collapse to icons)' : 'Pin menu open'}
              title={pinned ? 'Collapse menu' : 'Keep menu open'}
              sx={{
                color: pinned ? 'gb.gold' : 'gb.railMuted',
                transform: pinned ? 'rotate(45deg)' : 'none',
                transition: 'transform .15s ease, color .12s ease',
                '&:hover': { color: 'gb.gold', bgcolor: 'rgba(255,255,255,.07)' },
              }}
            >
              <PushPinOutlinedIcon fontSize="small" />
            </IconButton>
          ) : null}
        </Stack>
        <Box sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', px: 1.25, pt: 1.5, pb: 1 }}>
          {!isEmployee(user) && hasModule(user, 'visitors') ? (
            <Button
              component={NavLink}
              to="/check-in"
              variant="contained"
              color="primary"
              aria-label="Check in"
              startIcon={open ? <AddIcon /> : null}
              fullWidth
              sx={{
                minHeight: 40,
                mb: 0.5,
                px: open ? 2 : 0,
                minWidth: 0,
                borderRadius: '9px',
                border: '1.5px solid',
                borderColor: 'gb.gold',
                fontWeight: 700,
                letterSpacing: '.02em',
                boxShadow: '0 1px 2px rgba(16,21,28,.10), 0 3px 8px rgba(15,118,110,.18)',
                '&:hover': { bgcolor: 'gb.accentDark', borderColor: 'gb.gold', transform: 'translateY(-1px)' },
                '&.active': { bgcolor: 'gb.accentDark' },
              }}
            >
              {open ? 'Check in' : <AddIcon />}
            </Button>
          ) : null}
          {groups.map(([group, items]) => (
            <Box key={group}>
              <RailGroup label={group} open={open} />
              <List disablePadding>
                {items.filter(Boolean).map((it) => (
                  <RailLink key={it.to} {...it} open={open} />
                ))}
              </List>
            </Box>
          ))}
        </Box>
        <Stack
          direction="row"
          spacing={1}
          sx={{
            alignItems: 'center',
            justifyContent: open ? 'flex-start' : 'center',
            px: 2,
            py: 1.5,
            borderTop: '1px solid rgba(255,255,255,.09)',
            color: 'gb.railMuted',
            fontFamily: fonts.mono,
            fontSize: 11,
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          <VerifiedUserOutlinedIcon sx={{ fontSize: 15 }} />
          {open ? <span>TruSentinel</span> : null}
        </Stack>
      </Box>
    </Box>
  );
}

/** Page names for the top bar breadcrumb: `[group, page]`. */
const CRUMBS = {
  '/check-in': ['Register', 'Check in'],
  '/track': ['Register', 'TRACK'],
  '/inside': ['Register', 'Inside now'],
  '/post': ['Register', 'Post room'],
  '/post/new': ['Post room', 'Log incoming post'],
  '/expected': ['Register', 'Expected visitors'],
  '/material': ['Register', 'Material passes'],
  '/keys': ['Register', 'Key register'],
  '/incidents': ['Register', 'Incidents'],
  '/patrol': ['Register', 'Patrols'],
  '/generator': ['Register', 'Generator'],
  '/log': ['Register', 'Visitor log'],
  '/overview': ['Register', 'Overview'],
  '/my-visitors': ['My desk', 'My visitors'],
  '/my-post': ['My desk', 'My post'],
  '/notifications': ['Inbox', 'Notifications'],
  '/settings': ['Admin', 'Settings'],
};

function UserMenu() {
  const user = useUser();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [anchor, setAnchor] = useState(null);
  const { unreadCount } = useNotifications();
  const role = ROLE_LABEL[user.role] ?? user.role;
  const go = (to) => {
    setAnchor(null);
    navigate(to);
  };
  const avatar = (size) => (
    <Box
      aria-hidden
      sx={{
        width: size,
        height: size,
        borderRadius: '50%',
        bgcolor: 'primary.main',
        color: '#fff',
        display: 'grid',
        placeItems: 'center',
        fontWeight: 700,
        fontSize: size * 0.38,
        flexShrink: 0,
        boxShadow: `0 0 0 2px #fff, 0 0 0 3.5px ${'#FFC81F'}`,
      }}
    >
      {initials(user.name) || '?'}
    </Box>
  );
  return (
    <>
      <ButtonBase
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-haspopup="menu"
        aria-expanded={anchor ? 'true' : undefined}
        aria-label={`Account menu, ${user.name}`}
        sx={{
          gap: 1,
          pl: 0.75,
          pr: 1.5,
          py: 0.5,
          borderRadius: '14px',
          bgcolor: 'gb.accentSoft',
          border: '1px solid rgba(15,118,110,.28)',
          '&:hover': { borderColor: 'primary.main' },
        }}
      >
        {avatar(30)}
        <Box sx={{ textAlign: 'left', display: { xs: 'none', lg: 'block' } }}>
          <Typography sx={{ fontSize: 13, fontWeight: 700, lineHeight: 1.2 }} noWrap>
            {user.name}
          </Typography>
          <Typography sx={{ fontSize: 11, color: 'gb.faint', lineHeight: 1.2 }} noWrap>
            {role}
          </Typography>
        </Box>
        <KeyboardArrowDownIcon sx={{ fontSize: 18, color: 'gb.muted' }} />
      </ButtonBase>
      <Menu
        anchorEl={anchor}
        open={!!anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: { sx: { mt: 1, width: 300, borderRadius: '18px', boxShadow: '0 18px 46px rgba(16,21,28,.16)' } },
        }}
      >
        <Stack direction="row" spacing={1.5} sx={{ px: 2.5, py: 2, alignItems: 'center' }}>
          {avatar(48)}
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 16, fontWeight: 700 }} noWrap>
              {user.name}
            </Typography>
            <Typography sx={{ fontSize: 12, color: 'gb.faint' }} noWrap>
              {role} · {user.email}
            </Typography>
          </Box>
        </Stack>
        <Divider />
        <MenuItem onClick={() => go('/settings')} sx={{ py: 1.25, px: 2.5, gap: 1.5 }}>
          <PersonOutlineIcon sx={{ fontSize: 18, color: 'primary.main' }} />
          {isEmployee(user) ? 'My account' : 'My account & settings'}
        </MenuItem>
        <MenuItem onClick={() => go('/notifications')} sx={{ py: 1.25, px: 2.5, gap: 1.5 }}>
          <NotificationsNoneOutlinedIcon sx={{ fontSize: 18, color: 'primary.main' }} />
          <Box sx={{ flex: 1 }}>Notifications</Box>
          {unreadCount ? (
            <Box
              component="span"
              sx={{ fontFamily: fonts.mono, fontSize: 11, px: 1, borderRadius: '20px', bgcolor: 'gb.badSoft', color: 'gb.bad' }}
            >
              {unreadCount}
            </Box>
          ) : null}
        </MenuItem>
        <Divider />
        <MenuItem
          onClick={() => {
            setAnchor(null);
            logout();
          }}
          sx={{ py: 1.25, px: 2.5, gap: 1.5, color: 'gb.bad', '&:hover': { bgcolor: 'gb.badSoft' } }}
        >
          <LogoutIcon sx={{ fontSize: 18 }} />
          Sign out
        </MenuItem>
      </Menu>
    </>
  );
}

/** Desktop top bar (AIMS topbar): breadcrumb, gate picker, date, bell, user chip. */
function TopBar() {
  const { pathname } = useLocation();
  const user = useUser();
  const key = Object.keys(CRUMBS)
    .filter((k) => pathname === k || pathname.startsWith(`${k}/`))
    .sort((a, b) => b.length - a.length)[0];
  const [group, page] = CRUMBS[key] ?? ['', ''];
  const shownGroup = isEmployee(user) && group === 'Admin' ? 'Account' : group;
  const shownPage = isEmployee(user) && key === '/settings' ? 'My account' : page;
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  return (
    <Box
      component="header"
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 1100,
        height: TOPBAR_HEIGHT,
        px: 2.5,
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        bgcolor: 'background.paper',
        borderBottom: '1px solid',
        borderColor: 'divider',
        boxShadow: '0 4px 12px -8px rgba(16,21,28,.22)',
      }}
    >
      <Stack direction="row" spacing={0.75} sx={{ alignItems: 'baseline', minWidth: 0 }}>
        {shownGroup ? (
          <>
            <Typography sx={{ fontSize: 12.5, color: 'gb.faint' }} noWrap>
              {shownGroup}
            </Typography>
            <Typography sx={{ fontSize: 12.5, color: 'gb.faint' }}>›</Typography>
          </>
        ) : null}
        <Typography sx={{ fontSize: 14, fontWeight: 600 }} noWrap>
          {shownPage}
        </Typography>
      </Stack>
      <Box sx={{ flex: 1 }} />
      <GatePicker compact />
      <Typography variant="mono" sx={{ fontSize: 11.5, color: 'gb.muted', display: { xs: 'none', lg: 'block' } }}>
        {today}
      </Typography>
      <NotificationBell />
      <Box sx={{ width: '1px', height: 26, bgcolor: 'divider' }} />
      <UserMenu />
    </Box>
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
          bgcolor: tone === 'warn' ? 'gb.gold' : 'gb.ok',
          color: tone === 'warn' ? 'gb.ink' : '#fff',
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
      <AppBar position="sticky" elevation={0} sx={{ background: RAIL_BG, color: 'gb.railInk' }}>
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
          background: 'linear-gradient(180deg, #134A38 0%, #0A2620 100%)',
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
                        border: '3px solid',
                        borderColor: 'gb.gold',
                        boxShadow: '0 6px 16px rgba(0,0,0,0.35)',
                      }}
                    >
                      <AddIcon sx={{ fontSize: 28 }} />
                    </Box>
                  }
                  sx={{ '&.Mui-selected': { color: 'gb.gold' } }}
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
        {desktop ? <TopBar /> : <PhoneChrome />}
        <Box
          component="main"
          sx={{
            flex: 1,
            width: '100%',
            maxWidth: 1600,
            mx: 'auto',
            px: { xs: 1.75, md: 2.5 },
            pt: { xs: 2, md: 2.5 },
            pb: { xs: 'calc(96px + env(safe-area-inset-bottom))', md: 3 },
          }}
        >
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
