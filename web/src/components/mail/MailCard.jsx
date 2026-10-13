import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useUser } from '../../auth/context';
import { canOperate } from '../../auth/roles';
import { useMailUi } from '../../state/context';
import { fonts } from '../../theme/tokens';
import { fmtMinutes } from '../../utils/format';
import { fromLine, hasRecipientUser, whenShort } from '../../utils/mail';
import { VisitorThumb } from '../bits';
import { KindTag, MailStatusChip } from './MailBits';

/**
 * Post room card: 72 px cover, kind tag, receiver, sender line, ref / received / waiting time,
 * status chip and actions (lodged: Remind + Handed over; disputed: Resolve). Disputed cards get a red inset.
 * `employee` mode shows "Collect at the gate" and no gate actions.
 */
export function MailCard({ item: m, now, employee = false }) {
  const user = useUser();
  const { openDetails, openHandover, openResolve, remind } = useMailUi();
  const act = !employee && canOperate(user);
  const disputed = m.status === 'disputed';
  const stop = (fn) => (e) => {
    e.stopPropagation();
    fn();
  };

  return (
    <Paper
      variant="outlined"
      role="button"
      tabIndex={0}
      onClick={() => openDetails(m)}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
          e.preventDefault();
          openDetails(m);
        }
      }}
      sx={(theme) => ({
        p: 1.5,
        display: 'flex',
        gap: 1.5,
        alignItems: 'flex-start',
        cursor: 'pointer',
        '&:hover': { borderColor: theme.vars.palette.gb.muted },
        '&:focus-visible': { outline: `2px solid ${theme.vars.palette.gb.accent}`, outlineOffset: 2 },
        ...(disputed && {
          borderColor: theme.vars.palette.gb.bad,
          boxShadow: `inset 4px 0 0 ${theme.vars.palette.gb.bad}`,
          pl: 2,
        }),
      })}
    >
      <VisitorThumb src={m.coverPhotoUrl} name={m.kind || 'Post'} size={72} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" sx={{ alignItems: 'center', flexWrap: 'wrap', columnGap: 1, rowGap: 0.25 }}>
          <KindTag kind={m.kind} />
          <Typography sx={{ fontSize: '1.02rem', lineHeight: 1.3 }}>
            For <b>{m.recipientName}</b>
            {m.dept ? ` (${m.dept})` : ''}
          </Typography>
        </Stack>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.25, wordBreak: 'break-word' }}>
          {fromLine(m)}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.25 }}>
          {m.refNo ? (
            <Box component="span" sx={{ fontFamily: fonts.mono, fontSize: '0.92em', color: 'text.primary' }}>
              {m.refNo} ·{' '}
            </Box>
          ) : null}
          Received {whenShort(m.receivedAt, now)}
          {m.status === 'lodged' ? (
            <Box component="span" sx={{ color: 'warning.main', fontWeight: 600 }}>
              {' '}
              · {fmtMinutes((now - new Date(m.receivedAt).getTime()) / 60000)} ago
            </Box>
          ) : null}
          {m.collectedBy && m.status !== 'lodged' ? ` · given to ${m.collectedBy}` : ''}
        </Typography>
        {employee && m.status === 'lodged' ? (
          <Typography variant="body2" sx={{ fontWeight: 600, mt: 0.5 }}>
            Collect at the gate
          </Typography>
        ) : null}
      </Box>
      <Stack spacing={1} sx={{ alignItems: 'flex-end', flexShrink: 0, maxWidth: { xs: 132, sm: 'none' } }}>
        <MailStatusChip status={m.status} />
        {act && m.status === 'lodged' ? (
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: 'flex-end' }}>
            {hasRecipientUser(m) ? (
              <Button
                size="small"
                variant="outlined"
                startIcon={<NotificationsActiveOutlinedIcon />}
                onClick={stop(() => remind(m))}
              >
                Remind
              </Button>
            ) : null}
            <Button size="small" variant="contained" color="success" onClick={stop(() => openHandover(m))}>
              Handed over
            </Button>
          </Stack>
        ) : null}
        {act && disputed ? (
          <Button size="small" variant="contained" color="primary" onClick={stop(() => openResolve(m))}>
            Resolve
          </Button>
        ) : null}
      </Stack>
    </Paper>
  );
}
