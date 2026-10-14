import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { fonts } from '../theme/tokens';
import { initials } from '../utils/format';
/** Amber pill, mono text: "Pass 12". */
export function PassBadge({ badge, persons }) {
  return (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', flexShrink: 0 }}>
      <Chip variant="pass" label={badge ? `Pass ${badge}` : 'No pass'} />
      {persons && persons > 1 ? (
        <Typography variant="mono" sx={{ color: 'text.secondary', fontSize: '0.78rem' }}>
          +{persons - 1}
        </Typography>
      ) : null}
    </Stack>
  );
}
const Dot = () => (
  <Box
    component="span"
    sx={{
      width: 7,
      height: 7,
      borderRadius: '50%',
      bgcolor: 'currentColor',
      ml: '8px !important',
    }}
  />
);
/** Green "Inside" (dot), amber "Overstay" (dot), grey "Exited". */
export function StatusChip({ status, size }) {
  const label = status === 'inside' ? 'Inside' : status === 'overstay' ? 'Overstay' : 'Exited';
  return (
    <Chip
      variant={status}
      size={size}
      label={label}
      icon={status === 'exited' ? undefined : <Dot />}
      sx={{ '& .MuiChip-icon': { color: 'inherit', mr: '-4px' } }}
    />
  );
}
/** Photo, or initials on a sunk square. */
export function VisitorThumb({ src, name, size = 64, width, height, radius = 1 }) {
  const [failed, setFailed] = useState(null);
  const w = width ?? size;
  const h = height ?? size;
  const showImg = !!src && failed !== src;
  return (
    <Box
      sx={{
        width: w,
        height: h,
        flexShrink: 0,
        borderRadius: radius,
        overflow: 'hidden',
        bgcolor: 'gb.sunk',
        border: 1,
        borderColor: 'divider',
        display: 'grid',
        placeItems: 'center',
      }}
    >
      {showImg ? (
        <Box
          component="img"
          src={src}
          alt=""
          loading="lazy"
          onError={() => setFailed(src)}
          sx={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
        />
      ) : (
        <Typography
          sx={{
            fontFamily: fonts.display,
            fontWeight: 700,
            fontSize: Math.max(12, Math.round(Math.min(w, h) * 0.34)),
            color: 'text.secondary',
          }}
        >
          {initials(name) || '?'}
        </Typography>
      )}
    </Box>
  );
}
export function PageHeader({ eyebrow, title, right, eyebrowColor }) {
  return (
    <Stack
      direction="row"
      sx={{
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 2,
        mb: { xs: 2, md: 3 },
        flexWrap: 'wrap',
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="eyebrow" sx={{ color: eyebrowColor ?? 'text.secondary', mb: 0.5 }}>
          {eyebrow}
        </Typography>
        <Typography variant="h1">{title}</Typography>
      </Box>
      {right ? <Box sx={{ flexShrink: 0 }}>{right}</Box> : null}
    </Stack>
  );
}
export function Panel({ title, action, children, sx, ...rest }) {
  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, height: '100%', ...sx }} {...rest}>
      {title || action ? (
        <Stack
          direction="row"
          sx={{
            alignItems: 'center',
            justifyContent: 'space-between',
            mb: 1.5,
            gap: 1,
          }}
        >
          {title ? <Typography variant="h4">{title}</Typography> : <span />}
          {action}
        </Stack>
      ) : null}
      {children}
    </Paper>
  );
}
export function EmptyState({ title, text, action }) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: { xs: 4, md: 6 },
        textAlign: 'center',
        borderStyle: 'dashed',
        bgcolor: 'transparent',
      }}
    >
      <Typography variant="h2" sx={{ mb: 1 }}>
        {title}
      </Typography>
      <Typography sx={{ color: 'text.secondary', maxWidth: 440, mx: 'auto' }}>{text}</Typography>
      {action ? <Box sx={{ mt: 2.5 }}>{action}</Box> : null}
    </Paper>
  );
}
/** Small uppercase label used for detail grids. */
export function FieldLabel({ children }) {
  return (
    <Typography
      variant="eyebrow"
      sx={{
        color: 'text.secondary',
        fontSize: '0.75rem',
        letterSpacing: '0.1em',
      }}
    >
      {children}
    </Typography>
  );
}

/** Photo filling its box (details drawers). */
/**
 * Photo filling its box. With `onOpen` it becomes a button (zoom cursor + corner badge) that
 * opens the full-screen preview.
 */
export function FillThumb({ src, name, contain, onOpen }) {
  const img = (
    <Box
      component="img"
      src={src}
      alt={name}
      sx={{
        width: '100%',
        height: '100%',
        objectFit: contain ? 'contain' : 'cover',
        borderRadius: 1,
        border: 1,
        borderColor: 'divider',
        bgcolor: 'gb.sunk',
        display: 'block',
      }}
    />
  );
  if (!onOpen) return img;
  return (
    <Box
      component="button"
      type="button"
      onClick={onOpen}
      aria-label={`Open full photo: ${name}`}
      title="Open full photo"
      sx={{
        all: 'unset',
        boxSizing: 'border-box',
        position: 'relative',
        display: 'block',
        width: '100%',
        height: '100%',
        cursor: 'zoom-in',
        borderRadius: 1,
        '&:hover img': { filter: 'brightness(0.92)' },
        '&:focus-visible': {
          outline: '2px solid',
          outlineColor: 'primary.main',
          outlineOffset: 2,
        },
      }}
    >
      {img}
      <Box
        aria-hidden
        sx={{
          position: 'absolute',
          right: 6,
          bottom: 6,
          width: 26,
          height: 26,
          borderRadius: 0.75,
          bgcolor: 'rgba(0,0,0,0.55)',
          color: '#fff',
          display: 'grid',
          placeItems: 'center',
          fontSize: 15,
          lineHeight: 1,
        }}
      >
        ⤢
      </Box>
    </Box>
  );
}
/** Timeline row: `in` green dot, `out` ink dot, `pending` dashed ring, `bad` red dot. */
export function TimelineItem({ kind, last, children }) {
  return (
    <Stack direction="row" spacing={1.5}>
      <Stack sx={{ alignItems: 'center', pt: 0.6 }}>
        <Box
          sx={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            flexShrink: 0,
            ...(kind === 'in' && { bgcolor: 'success.main' }),
            ...(kind === 'out' && { bgcolor: 'gb.ink' }),
            ...(kind === 'pending' && {
              border: '2px dashed',
              borderColor: 'text.secondary',
            }),
            ...(kind === 'bad' && { bgcolor: 'error.main' }),
          }}
        />
        {!last ? (
          <Box
            sx={{
              width: 2,
              flex: 1,
              bgcolor: 'divider',
              my: 0.5,
              minHeight: 18,
            }}
          />
        ) : null}
      </Stack>
      <Typography variant="body2" sx={{ pb: last ? 0 : 2, lineHeight: 1.6 }}>
        {children}
      </Typography>
    </Stack>
  );
}
