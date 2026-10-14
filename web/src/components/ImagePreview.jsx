import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import { fonts } from '../theme/tokens';

const barBtn = {
  color: '#fff',
  bgcolor: 'rgba(255,255,255,0.12)',
  '&:hover': { bgcolor: 'rgba(255,255,255,0.22)' },
};

/**
 * Full-screen photo viewer (lightbox). `images`: [{ src, label }] — entries without `src` are skipped.
 * Opens at `index`; ← / → or the side arrows move between photos; click the photo to toggle
 * fit ↔ actual size (scroll to pan); Esc, ✕ or a click on the backdrop closes.
 */
export function ImagePreview({ images, index = 0, open, onClose }) {
  const items = (images ?? []).filter((i) => i && i.src);
  // Parents mount this only while open, so each opening starts at `index`, un-zoomed.
  const [page, setPage] = useState(index);
  const [zoom, setZoom] = useState(false);

  const count = items.length;
  const go = (d) => {
    setZoom(false);
    setPage((p) => (p + d + count) % count);
  };

  useEffect(() => {
    if (!open || count < 2) return undefined;
    const onKey = (e) => {
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, count]);

  if (!count) return null;
  const current = items[Math.min(page, count - 1)];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen
      aria-label={current.label}
      slotProps={{
        paper: {
          sx: {
            bgcolor: 'rgba(5,10,8,0.94)',
            backgroundImage: 'none',
            boxShadow: 'none',
          },
        },
      }}
    >
      {/* Top bar: caption, counter, open original, close */}
      <Stack
        direction="row"
        sx={{
          alignItems: 'center',
          gap: 1.5,
          px: { xs: 2, md: 3 },
          py: 1.5,
          color: '#fff',
          flexShrink: 0,
        }}
      >
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography noWrap sx={{ fontWeight: 600 }}>
            {current.label}
          </Typography>
          {count > 1 ? (
            <Typography variant="caption" sx={{ fontFamily: fonts.mono, opacity: 0.7 }}>
              {Math.min(page, count - 1) + 1} / {count}
            </Typography>
          ) : null}
        </Box>
        <IconButton
          component="a"
          href={current.src}
          target="_blank"
          rel="noreferrer"
          aria-label="Open original in a new tab"
          title="Open original"
          sx={barBtn}
        >
          <OpenInNewIcon fontSize="small" />
        </IconButton>
        <IconButton onClick={onClose} aria-label="Close photo" title="Close (Esc)" sx={barBtn}>
          <CloseIcon />
        </IconButton>
      </Stack>

      {/* Stage: click outside the photo closes */}
      <Box
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        sx={{
          position: 'relative',
          flex: 1,
          minHeight: 0,
          overflow: zoom ? 'auto' : 'hidden',
          display: 'grid',
          placeItems: zoom ? 'start center' : 'center',
          px: { xs: 1, md: 9 },
          pb: 2,
        }}
      >
        <Box
          component="img"
          src={current.src}
          alt={current.label}
          onClick={() => setZoom((z) => !z)}
          title={zoom ? 'Click to fit' : 'Click to zoom'}
          sx={{
            display: 'block',
            maxWidth: zoom ? 'none' : '100%',
            maxHeight: zoom ? 'none' : '100%',
            width: zoom ? 'auto' : undefined,
            objectFit: 'contain',
            borderRadius: 1,
            cursor: zoom ? 'zoom-out' : 'zoom-in',
            userSelect: 'none',
            // Zoomed: at least as wide as the stage (enlarges the small stored photos), scroll to pan.
            ...(zoom && { minWidth: '100%' }),
          }}
        />
        {count > 1 ? (
          <>
            <IconButton
              onClick={() => go(-1)}
              aria-label="Previous photo"
              sx={{
                ...barBtn,
                position: 'absolute',
                left: { xs: 8, md: 24 },
                top: '50%',
                transform: 'translateY(-50%)',
              }}
            >
              <ChevronLeftIcon />
            </IconButton>
            <IconButton
              onClick={() => go(1)}
              aria-label="Next photo"
              sx={{
                ...barBtn,
                position: 'absolute',
                right: { xs: 8, md: 24 },
                top: '50%',
                transform: 'translateY(-50%)',
              }}
            >
              <ChevronRightIcon />
            </IconButton>
          </>
        ) : null}
      </Box>
    </Dialog>
  );
}
