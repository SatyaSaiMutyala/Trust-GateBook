import NotificationsNoneOutlinedIcon from '@mui/icons-material/NotificationsNoneOutlined';
import Badge from '@mui/material/Badge';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { useNavigate } from 'react-router';
import { useNotifications } from '../state/context';
import { fonts } from '../theme/tokens';

/** Red unread badge with a white ring (AIMS bell dot), 99+ cap. */
export function UnreadBadge({ count, children }) {
  return (
    <Badge
      badgeContent={count ?? 0}
      max={99}
      sx={{
        '& .MuiBadge-badge': {
          bgcolor: 'gb.bad',
          color: '#fff',
          border: '2px solid #fff',
          fontFamily: fonts.mono,
          fontWeight: 600,
          fontSize: 10,
          height: 19,
          minWidth: 19,
        },
      }}
    >
      {children}
    </Badge>
  );
}

/** Bell → /notifications. `onRail` styles it for the dark phone top bar. */
export function NotificationBell({ onRail = false }) {
  const navigate = useNavigate();
  const { unreadCount } = useNotifications();
  const label = unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications';
  return (
    <Tooltip title="Notifications">
      <IconButton
        aria-label={label}
        onClick={() => navigate('/notifications')}
        sx={(theme) => ({
          width: onRail ? 40 : 34,
          height: onRail ? 40 : 34,
          color: onRail ? theme.vars.palette.gb.railInk : theme.vars.palette.gb.ink,
          border: onRail ? '1px solid rgba(255,255,255,0.16)' : `1px solid ${theme.vars.palette.gb.line}`,
          bgcolor: onRail ? 'rgba(255,255,255,0.06)' : theme.vars.palette.gb.surface,
          '&:hover': { bgcolor: onRail ? 'rgba(255,255,255,0.12)' : theme.vars.palette.gb.accentSoft },
          '& .MuiSvgIcon-root': { fontSize: onRail ? 22 : 19 },
        })}
      >
        <UnreadBadge count={unreadCount}>
          <NotificationsNoneOutlinedIcon />
        </UnreadBadge>
      </IconButton>
    </Tooltip>
  );
}
