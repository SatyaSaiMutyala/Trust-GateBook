import AddIcon from '@mui/icons-material/Add';
import BarChartIcon from '@mui/icons-material/BarChart';
import ListAltIcon from '@mui/icons-material/ListAlt';
import MailOutlineIcon from '@mui/icons-material/EmailOutlined';
import MarkunreadMailboxOutlinedIcon from '@mui/icons-material/MarkunreadMailboxOutlined';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import PersonOutlineIcon from '@mui/icons-material/PersonOutlined';
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
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useUser } from '../auth/context';
import { isEmployee, isRecipient, ROLE_LABEL } from '../auth/roles';
import { useIsDesktop } from '../hooks';
import { useInside, useMailCounts } from '../state/context';
import { fonts, RAIL_WIDTH } from '../theme/tokens';
import { IssueAlerts, MailNotifier } from './mail/IssueAlerts';

function Brand({ compact = false }) {
  return (
    <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', minWidth: 0 }}>
      <Box
        aria-hidden
        sx={{
          width: compact ? 30 : 34,
          height: compact ? 30 : 34,
          borderRadius: 1,
          bgcolor: 'gb.accent',
          color: 'gb.accentInk',
          display: 'grid',
          placeItems: 'center',
          fontFamily: fonts.display,
          fontWeight: 700,
          fontSize: compact ? 17 : 19,
          flexShrink: 0,
        }}
      >
        G
      </Box>
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
          <Typography sx={{ fontSize: 12, color: 'gb.railMuted', mt: 0.25 }}>Visitor register</Typography>
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

function DesktopRail() {
  const user = useUser();
  const employee = isEmployee(user);
  const { count } = useInside();
  const mail = useMailBadge(employee);
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
            to="/my-post"
            icon={<MarkunreadMailboxOutlinedIcon />}
            label="My post"
            right={<CountBadge count={mail.count} tone="warn" />}
          />
          <RailLink to="/settings" icon={<PersonOutlineIcon />} label="My account" />
        </List>
      ) : (
        <>
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
          <RailGroup label="Register" />
          <List disablePadding sx={{ display: 'grid', gap: 0.5 }}>
            <RailLink to="/inside" icon={<PeopleAltIcon />} label="Inside now" right={<CountBadge count={count} />} />
            <RailLink
              to="/post"
              icon={<MailOutlineIcon />}
              label="Post room"
              right={<CountBadge count={mail.count} tone={mail.tone} />}
            />
            <RailLink to="/log" icon={<ListAltIcon />} label="Visitor log" />
            <RailLink to="/overview" icon={<BarChartIcon />} label="Overview" />
            {isRecipient(user) ? (
              <RailLink to="/my-post" icon={<MarkunreadMailboxOutlinedIcon />} label="My post" />
            ) : null}
          </List>
          <RailGroup label="Admin" />
          <List disablePadding>
            <RailLink to="/settings" icon={<SettingsIcon />} label="Settings" />
          </List>
        </>
      )}
      <Box sx={{ flex: 1 }} />
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

const GATE_TABS = [
  { value: '/inside', label: 'Inside now', icon: <PeopleAltIcon /> },
  { value: '/post', label: 'Post', icon: <MailOutlineIcon /> },
  { value: '/check-in', label: 'Check in', icon: <AddIcon />, raised: true },
  { value: '/log', label: 'Log', icon: <ListAltIcon /> },
  { value: '/settings', label: 'Account', icon: <PersonOutlineIcon /> },
];
const EMPLOYEE_TABS = [
  { value: '/my-post', label: 'My post', icon: <MarkunreadMailboxOutlinedIcon /> },
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
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const tabs = employee ? EMPLOYEE_TABS : GATE_TABS;
  const current = tabs.find((t) => pathname === t.value || pathname.startsWith(`${t.value}/`))?.value ?? false;
  const badgeFor = (t) => {
    if (t.value === '/inside') return { count, tone: 'ok' };
    if (t.value === '/post' || t.value === '/my-post') return mail;
    return null;
  };
  return (
    <>
      <AppBar position="sticky" elevation={0} sx={{ bgcolor: 'gb.rail', color: 'gb.railInk', backgroundImage: 'none' }}>
        <Toolbar sx={{ gap: 1.5, justifyContent: 'space-between', minHeight: 60, px: 2 }}>
          <Brand compact />
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
          {!employee ? <IssueAlerts /> : null}
          {isRecipient(user) ? <MailNotifier /> : null}
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
