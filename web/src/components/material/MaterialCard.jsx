import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useMaterialUi } from '../../state/context';
import { fonts } from '../../theme/tokens';
import { fmtRelative } from '../../utils/format';
import { carrierName, dueText, mpState, MP_OPEN, TONE_VARIANT } from '../../utils/material';
import { VisitorThumb } from '../bits';
import { MaterialActions } from './MaterialDetail';

/** One gate pass: box count (green IN / amber OUT), who carries them, challan, employee, status and actions. */
export function MaterialCard({ pass: p, now }) {
  const { openDetail } = useMaterialUi();
  const isIn = p.direction === 'in';
  const state = mpState(p);
  return (
    <Paper variant="outlined" sx={{ display: 'flex', overflow: 'hidden' }}>
      <ButtonBase
        onClick={() => openDetail(p)}
        aria-label={`Open gate pass ${p.id}`}
        sx={(theme) => ({
          width: 76,
          flexShrink: 0,
          flexDirection: 'column',
          justifyContent: 'center',
          bgcolor: isIn ? theme.vars.palette.gb.okSoft : theme.vars.palette.gb.accentSoft,
          color: isIn ? theme.vars.palette.gb.ok : theme.vars.palette.gb.warn,
        })}
      >
        <Typography sx={{ fontFamily: fonts.mono, fontWeight: 700, fontSize: 26, lineHeight: 1 }}>{p.boxes}</Typography>
        <Typography sx={{ fontSize: 12 }}>{p.boxes === 1 ? 'box' : 'boxes'}</Typography>
        <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em' }}>{isIn ? 'IN' : 'OUT'}</Typography>
      </ButtonBase>
      <Box sx={{ flex: 1, minWidth: 0, p: 1.5, display: 'flex', gap: 1.5, flexWrap: { xs: 'wrap', md: 'nowrap' } }}>
        <ButtonBase onClick={() => openDetail(p)} sx={{ alignSelf: 'flex-start', borderRadius: 1 }}>
          <VisitorThumb src={p.carrier?.photoUrl} name={carrierName(p)} size={48} />
        </ButtonBase>
        <Box sx={{ flex: 1, minWidth: 0 }} onClick={() => openDetail(p)} role="button" tabIndex={-1}>
          <Typography sx={{ fontWeight: 700 }} noWrap>
            {carrierName(p)}
            {p.carrier?.company ? (
              <Box component="span" sx={{ fontWeight: 400, color: 'text.secondary' }}>
                {' '}
                · {p.carrier.company}
              </Box>
            ) : null}
            {p.carrier?.visitBadge ? (
              <Box component="span" sx={{ fontWeight: 400, color: 'text.secondary' }}>
                {' '}
                · pass {p.carrier.visitBadge}
              </Box>
            ) : null}
          </Typography>
          <Typography variant="body2" noWrap>
            {[p.challanType || 'Challan', p.refNo].filter(Boolean).join(' ')} · {isIn ? 'for' : 'from'}{' '}
            {p.authorisedBy?.name ?? 'security'}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', fontFamily: fonts.mono, fontSize: 12 }} noWrap>
            {p.id} · {fmtRelative(p.createdAt, now)}
            {p.mode === 'pickup' ? ' · pickup at gate' : ''}
            {p.returnable ? ' · returnable' : ''}
          </Typography>
        </Box>
        <Stack
          spacing={0.75}
          sx={{ alignItems: { xs: 'flex-start', md: 'flex-end' }, flexShrink: 0, width: { xs: '100%', md: 'auto' } }}
        >
          <Chip size="small" variant={TONE_VARIANT[state.tone]} label={state.label} />
          {MP_OPEN.includes(p.status) && p.returnDue ? (
            <Typography variant="body2" sx={{ color: p.overdue ? 'error.main' : 'text.secondary' }}>
              {dueText(p)}
            </Typography>
          ) : null}
          <MaterialActions pass={p} />
        </Stack>
      </Box>
    </Paper>
  );
}
