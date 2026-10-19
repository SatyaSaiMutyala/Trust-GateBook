import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { fonts } from '../theme/tokens';
import { fmtDate, fmtDuration, fmtTime } from '../utils/format';
import { hostStage, passNotReturned } from '../utils/visit';
import { HostStageChip, PassBadge, StatusChip, VisitorThumb } from './bits';
import { HostActions } from './HostActions';
/**
 * One visitor. Inside now: host-approval stage (waiting / accepted / no reply / declined) with the gate's next
 * step, duration and "Mark exit". Log mode: dates, status and duration.
 */
export function VisitorCard({ visit: v, status, now, logMode, onOpen, onExit }) {
  const over = status === 'overstay';
  const stage = hostStage(v);
  const meeting = [v.purpose, v.host ? `meeting ${v.host}${v.dept ? ` (${v.dept})` : ''}` : '']
    .filter(Boolean)
    .join(' · ');
  let when;
  if (logMode) {
    when = (
      <>
        {fmtDate(v.inAt)} · <Mono>{fmtTime(v.inAt)}</Mono> → <Mono>{v.outAt ? fmtTime(v.outAt) : '…'}</Mono>
      </>
    );
  } else {
    when = (
      <>
        In <Mono>{fmtTime(v.inAt)}</Mono>
      </>
    );
  }
  return (
    <Paper
      variant="outlined"
      onClick={onOpen}
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onKeyDown={(e) => {
        if (onOpen && (e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
          e.preventDefault();
          onOpen();
        }
      }}
      sx={(theme) => ({
        p: 1.5,
        display: 'flex',
        gap: 1.5,
        alignItems: 'center',
        cursor: onOpen ? 'pointer' : 'default',
        transition: 'border-color .15s',
        '&:hover': onOpen ? { borderColor: theme.vars.palette.gb.muted } : undefined,
        '&:focus-visible': { outline: `2px solid ${theme.vars.palette.gb.accent}`, outlineOffset: 2 },
        ...(over && {
          borderColor: theme.vars.palette.gb.warn,
          boxShadow: `inset 4px 0 0 ${theme.vars.palette.gb.warn}`,
          pl: 2,
        }),
      })}
    >
      <VisitorThumb src={v.photoUrl} name={v.name} size={64} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" sx={{ alignItems: 'center', minWidth: 0, flexWrap: 'wrap', columnGap: 1, rowGap: 0.25 }}>
          <Typography sx={{ fontWeight: 600, fontSize: '1.05rem', lineHeight: 1.25, wordBreak: 'break-word' }}>
            {v.name}
          </Typography>
          <PassBadge badge={v.badge} persons={v.persons} />
        </Stack>
        <Typography
          variant="body2"
          sx={{ color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {meeting}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {when}
        </Typography>
        {logMode && passNotReturned(v) ? (
          <Typography variant="body2" sx={{ color: 'error.main', fontWeight: 600 }}>
            Pass not returned
          </Typography>
        ) : null}
      </Box>
      <Stack spacing={1} sx={{ alignItems: 'flex-end', flexShrink: 0 }}>
        {logMode ? <StatusChip status={status} size="small" /> : null}
        {stage ? <HostStageChip stage={stage} size="small" /> : null}
        <Chip
          variant={over ? 'overstay' : 'duration'}
          size="small"
          label={fmtDuration(v.inAt, v.outAt, now)}
          sx={{ '& .MuiChip-label': { fontFamily: fonts.mono } }}
        />
        {!logMode && onExit ? (
          <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <HostActions visit={v} />
            <Button
              variant="exit"
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onExit();
              }}
            >
              Mark exit
            </Button>
          </Stack>
        ) : null}
      </Stack>
    </Paper>
  );
}
function Mono({ children }) {
  return (
    <Box component="span" sx={{ fontFamily: fonts.mono, fontSize: '0.92em' }}>
      {children}
    </Box>
  );
}
