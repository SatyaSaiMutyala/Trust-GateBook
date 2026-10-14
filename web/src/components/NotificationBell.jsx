import NotificationsNoneOutlinedIcon from '@mui/icons-material/NotificationsNoneOutlined';
import Badge from '@mui/material/Badge';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { useNavigate } from 'react-router';
import { useNotifications } from '../state/context';
import { fonts } from '../theme/tokens';

/** Amber unread badge (99+ cap). Shared by the bell and the rail link. */
export function UnreadBadge({ count, children }) {
  return (
    <Badge
      badgeContent={count ?? 0}
      max={99}
      sx={{
        '& .MuiBadge-badge': {
          bgcolor: 'gb.accent',
          color: 'gb.accentInk',
          fontFamily: fonts.mono,
          fontWeight: 600,
          fontSize: 11,
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
          width: 44,
          height: 44,
          color: onRail ? theme.vars.palette.gb.railInk : theme.vars.palette.gb.ink,
          border: onRail ? '1px solid rgba(255,255,255,0.16)' : `1px solid ${theme.vars.palette.gb.line}`,
          bgcolor: onRail ? 'rgba(255,255,255,0.06)' : theme.vars.palette.gb.surface,
          '&:hover': { bgcolor: onRail ? 'rgba(255,255,255,0.12)' : theme.vars.palette.gb.sunk },
        })}
      >
        <UnreadBadge count={unreadCount}>
          <NotificationsNoneOutlinedIcon />
        </UnreadBadge>
      </IconButton>
    </Tooltip>
  );
}
