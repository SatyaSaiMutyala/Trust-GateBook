import CameraAltOutlinedIcon from '@mui/icons-material/CameraAltOutlined';
import CreditCardOutlinedIcon from '@mui/icons-material/CreditCardOutlined';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { useRef, useState } from 'react';
import { downscaleImage } from '../utils/image';

/**
 * Dashed capture tile. Opens the camera on phones (`capture`), the file picker on desktop.
 * Tapping a filled tile retakes. The picked image is downscaled to JPEG before it is kept.
 * Used by Check in (visitor photo, ID proof) and Log incoming post (cover, delivery person).
 */
export function PhotoTile({
  label,
  hint,
  value,
  onChange,
  aspect,
  facing,
  required,
  error,
  idProof,
  title,
  icon,
  maxEdge,
}) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    const blob = await downscaleImage(file, maxEdge ?? (idProof ? 1800 : 1400));
    setBusy(false);
    onChange({ blob, url: URL.createObjectURL(blob) });
  };

  const Icon = icon ?? (idProof ? CreditCardOutlinedIcon : CameraAltOutlinedIcon);
  return (
    <Box>
      <Typography
        variant="eyebrow"
        sx={{ color: error ? 'error.main' : 'text.secondary', fontSize: '0.78rem', mb: 0.75 }}
      >
        {title ?? (idProof ? 'ID proof' : 'Visitor photo')}
        {required ? (
          <Box component="span" sx={{ color: 'error.main' }}>
            {' '}
            *
          </Box>
        ) : (
          <Box component="span" sx={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>
            {' '}
            (optional)
          </Box>
        )}
      </Typography>
      <ButtonBase
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label={value ? `Retake ${label}` : label}
        sx={(theme) => ({
          width: '100%',
          aspectRatio: aspect,
          borderRadius: '10px',
          overflow: 'hidden',
          position: 'relative',
          border: value
            ? `1px solid ${theme.vars.palette.gb.line}`
            : `2px dashed ${error ? theme.vars.palette.gb.bad : theme.vars.palette.gb.line}`,
          bgcolor: error ? theme.vars.palette.gb.badSoft : theme.vars.palette.gb.sunk,
          color: theme.vars.palette.gb.muted,
          display: 'flex',
          flexDirection: 'column',
          gap: 0.5,
          p: value ? 0 : 1.5,
          textAlign: 'center',
          '&:hover': { borderColor: theme.vars.palette.gb.accent },
          '&:focus-visible': { outline: `2px solid ${theme.vars.palette.gb.accent}`, outlineOffset: 2 },
        })}
      >
        {value ? (
          <>
            <Box
              component="img"
              src={value.url}
              alt={label}
              sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            <Box
              sx={{
                position: 'absolute',
                left: 8,
                bottom: 8,
                px: 1,
                py: 0.25,
                borderRadius: '20px',
                bgcolor: 'rgba(0,0,0,0.6)',
                color: '#fff',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              Tap to retake
            </Box>
          </>
        ) : (
          <>
            <Icon sx={{ fontSize: 34 }} />
            <Typography sx={{ fontWeight: 700, color: 'text.primary', fontSize: { xs: 14, md: 15 } }}>
              {busy ? 'Processing…' : label}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: 12.5 }}>
              {hint}
            </Typography>
          </>
        )}
      </ButtonBase>
      <input ref={inputRef} type="file" accept="image/*" capture={facing} hidden onChange={pick} />
    </Box>
  );
}
