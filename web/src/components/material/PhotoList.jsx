import AddAPhotoOutlinedIcon from '@mui/icons-material/AddAPhotoOutlined';
import CloseIcon from '@mui/icons-material/Close';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useRef, useState } from 'react';
import { downscaleImage } from '../../utils/image';

/**
 * Several photos (challan pages, boxes): thumbnails with remove, and an add tile up to `max`.
 * `value` = `{ blob, url }[]`. Back camera on phones.
 */
export function PhotoList({ title, label, hint, value, onChange, max = 4, required, error, maxEdge = 1400 }) {
  const input = useRef(/** @type {HTMLInputElement | null} */ (null));
  const [busy, setBusy] = useState(false);
  const add = async (e) => {
    const files = [...(e.target.files ?? [])].slice(0, max - value.length);
    e.target.value = '';
    if (!files.length) return;
    setBusy(true);
    const next = [];
    for (const f of files) {
      const blob = await downscaleImage(f, maxEdge);
      next.push({ blob, url: URL.createObjectURL(blob) });
    }
    setBusy(false);
    onChange([...value, ...next]);
  };
  return (
    <Box>
      <Typography
        variant="eyebrow"
        sx={{ color: error ? 'error.main' : 'text.secondary', fontSize: '0.78rem', mb: 0.75, display: 'block' }}
      >
        {title}
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
      <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
        {value.map((p, i) => (
          <Box
            key={p.url}
            sx={{
              position: 'relative',
              width: 96,
              height: 96,
              borderRadius: '10px',
              overflow: 'hidden',
              border: 1,
              borderColor: 'divider',
            }}
          >
            <Box
              component="img"
              src={p.url}
              alt={`${label} ${i + 1}`}
              sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            <IconButton
              size="small"
              aria-label={`Remove ${label} ${i + 1}`}
              onClick={() => onChange(value.filter((_, j) => j !== i))}
              sx={{
                position: 'absolute',
                top: 2,
                right: 2,
                bgcolor: 'rgba(0,0,0,0.55)',
                color: '#fff',
                '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' },
              }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        ))}
        {value.length < max ? (
          <ButtonBase
            onClick={() => input.current?.click()}
            disabled={busy}
            aria-label={label}
            sx={(theme) => ({
              width: 96,
              height: 96,
              borderRadius: '10px',
              border: `2px dashed ${error ? theme.vars.palette.gb.bad : theme.vars.palette.gb.line}`,
              bgcolor: error ? theme.vars.palette.gb.badSoft : theme.vars.palette.gb.sunk,
              color: theme.vars.palette.gb.muted,
              flexDirection: 'column',
              gap: 0.5,
              fontSize: 12,
              fontWeight: 600,
              textAlign: 'center',
              p: 1,
            })}
          >
            <AddAPhotoOutlinedIcon />
            {busy ? 'Adding…' : label}
          </ButtonBase>
        ) : null}
      </Stack>
      {hint ? (
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
          {hint}
        </Typography>
      ) : null}
      <input ref={input} type="file" accept="image/*" capture="environment" multiple hidden onChange={add} />
    </Box>
  );
}
