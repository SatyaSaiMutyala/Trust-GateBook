import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import { fonts } from '../../theme/tokens';
import { MAIL_STATUS } from '../../utils/mail';

/** Small uppercase kind tag: ink background, surface text. */
export function KindTag({ kind }) {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-block',
        px: 0.75,
        py: '1px',
        borderRadius: '4px',
        bgcolor: 'gb.ink',
        color: 'gb.surface',
        fontFamily: fonts.display,
        fontWeight: 700,
        fontSize: 11.5,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        lineHeight: 1.6,
        whiteSpace: 'nowrap',
      }}
    >
      {kind || 'Post'}
    </Box>
  );
}

export function MailStatusChip({ status, size = 'small' }) {
  const s = MAIL_STATUS[status] ?? { label: status, variant: 'exited' };
  return <Chip variant={s.variant} size={size} label={s.label} />;
}
