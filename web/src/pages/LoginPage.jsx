import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutlined';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router';
import { errorMessage } from '../api/client';
import { brandApi } from '../api/endpoints';
import { useAuth } from '../auth/context';
import { LogoTile } from '../components/AppShell';
import { fonts } from '../theme/tokens';

const TEAL = '#0D9488';
const UI_FONT = '"Segoe UI", system-ui, -apple-system, sans-serif';

/** Login field (AIMS): 2px light-grey border, 12px corners, icon on the left that turns teal on focus. */
const fieldSx = {
  '& .MuiInputLabel-root': {
    fontFamily: UI_FONT,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: '0.5px',
    color: '#374151',
    '&.Mui-focused': { color: '#374151' },
  },
  '& .MuiOutlinedInput-root': {
    minHeight: 46,
    fontFamily: UI_FONT,
    fontSize: 14,
    borderRadius: '12px',
    bgcolor: 'rgba(255,255,255,.8)',
    '& .MuiOutlinedInput-notchedOutline': { borderWidth: 2, borderColor: '#E5E7EB' },
    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#D1D5DB' },
    '&.Mui-focused': { boxShadow: '0 0 0 4px rgba(13,148,136,.1)' },
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: TEAL, borderWidth: 2 },
    '& .MuiInputAdornment-positionStart .MuiSvgIcon-root': { color: '#9CA3AF', transition: 'color .15s ease' },
    '&.Mui-focused .MuiInputAdornment-positionStart .MuiSvgIcon-root': { color: TEAL },
  },
};

/** Soft floating glow behind the card. */
function Orb({ sx }) {
  return <Box aria-hidden sx={{ position: 'absolute', borderRadius: '50%', pointerEvents: 'none', ...sx }} />;
}

export function LoginPage() {
  const { status, login } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  // Company name + logo (public; blank until Settings → Company is filled in).
  const [brand, setBrand] = useState(null);
  useEffect(() => {
    brandApi
      .get()
      .then(setBrand)
      .catch(() => {});
  }, []);

  if (status === 'signedIn') {
    const from = location.state?.from;
    return <Navigate to={typeof from === 'string' ? from : '/'} replace />;
  }

  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const clear = () => {
    setEmail('');
    setPassword('');
    setError(null);
  };

  return (
    <Box
      sx={{
        position: 'relative',
        overflow: 'hidden',
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        p: 2,
        fontFamily: UI_FONT,
        background: 'linear-gradient(135deg, #0f766e 0%, #0d9488 25%, #14b8a6 50%, #a7f3d0 75%, #f0fdf4 100%)',
        '@keyframes gbFloat': {
          '0%, 100%': { transform: 'translate(0, 0)' },
          '50%': { transform: 'translate(-20px, 24px)' },
        },
        '@keyframes gbPulse': { '0%, 100%': { opacity: 0.35 }, '50%': { opacity: 1 } },
        // faint 60px grid
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(rgba(255,255,255,.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.03) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
          pointerEvents: 'none',
        },
      }}
    >
      <Orb
        sx={{
          width: 600,
          height: 600,
          top: -200,
          right: -160,
          background: 'radial-gradient(circle, rgba(240,199,94,.15) 0%, transparent 70%)',
          animation: 'gbFloat 8s ease-in-out infinite',
        }}
      />
      <Orb
        sx={{
          width: 500,
          height: 500,
          bottom: -180,
          left: -140,
          background: 'radial-gradient(circle, rgba(13,148,136,.25) 0%, transparent 70%)',
          animation: 'gbFloat 10s ease-in-out infinite reverse',
        }}
      />

      <Box
        sx={{
          position: 'relative',
          width: '100%',
          maxWidth: 920,
          minHeight: { md: 540 },
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          borderRadius: '20px',
          overflow: 'hidden',
          boxShadow: '0 25px 60px rgba(0,0,0,.15)',
        }}
      >
        {/* Brand half */}
        <Stack
          sx={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            color: '#fff',
            px: { xs: 3, md: 5 },
            py: { xs: 4, md: 6 },
            background: 'linear-gradient(160deg, #0f766e, #0d9488 40%, #115e59)',
          }}
        >
          <Box sx={{ filter: 'drop-shadow(0 6px 18px rgba(0,0,0,.25))', mb: 2.5 }}>
            <LogoTile size={96} src={brand?.logoUrl} />
          </Box>
          <Typography
            component="h1"
            sx={{
              fontFamily: fonts.display,
              fontWeight: 800,
              fontSize: { xs: 30, md: 38 },
              letterSpacing: '0.09em',
              lineHeight: 1,
              textShadow: '0 2px 4px rgba(0,0,0,.15), 0 4px 12px rgba(0,0,0,.12), 0 0 30px rgba(255,255,255,.12)',
            }}
          >
            GATEBOOK
          </Typography>
          <Stack direction="row" spacing={1} sx={{ my: 2 }} aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <Box
                key={i}
                sx={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  bgcolor: i === 0 ? '#F0C75E' : 'rgba(255,255,255,.7)',
                  animation: `gbPulse 1.6s ease-in-out ${i * 0.2}s infinite`,
                }}
              />
            ))}
          </Stack>
          <Typography sx={{ fontFamily: UI_FONT, fontSize: 12.5, opacity: 0.75, maxWidth: 270, lineHeight: 1.6 }}>
            {brand?.name ? `${brand.name} · ` : ''}Visitor register, post room and gate desk in one place.
          </Typography>
        </Stack>

        {/* Form half */}
        <Box
          component="form"
          onSubmit={submit}
          noValidate
          sx={{
            position: 'relative',
            flex: 1,
            bgcolor: 'rgba(255,255,255,.88)',
            backdropFilter: 'blur(20px)',
            px: { xs: 3, md: 5.25 },
            py: { xs: 4, md: 6 },
            '&::before': {
              content: '""',
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 4,
              background: 'linear-gradient(90deg, #0d9488, #14b8a6, #f0c75e, #fbbf24)',
            },
          }}
        >
          <Stack
            direction="row"
            spacing={0.75}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              px: 1.5,
              py: 0.5,
              mb: 2,
              borderRadius: '20px',
              background: 'linear-gradient(135deg, #ecfdf5, #d1fae5)',
              border: '1px solid #a7f3d0',
              color: TEAL,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '1px',
            }}
          >
            <ShieldOutlinedIcon sx={{ fontSize: 14 }} />
            <span>SECURE</span>
          </Stack>
          <Typography
            component="h2"
            sx={{ fontFamily: UI_FONT, fontSize: 28, fontWeight: 800, color: '#1a1a1a', lineHeight: 1.2 }}
          >
            Sign{' '}
            <Box component="span" sx={{ color: TEAL }}>
              In
            </Box>
          </Typography>
          <Typography sx={{ fontFamily: UI_FONT, fontSize: 13, color: '#6b7280', mt: 0.5, mb: 3.5 }}>
            Use the email and password your admin gave you.
          </Typography>

          <Stack spacing={2.25}>
            <TextField
              label="Email"
              type="email"
              autoComplete="username"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              sx={fieldSx}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <PersonOutlineIcon fontSize="small" />
                    </InputAdornment>
                  ),
                },
              }}
            />
            <TextField
              label="Password"
              type={showPw ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              sx={fieldSx}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <LockOutlinedIcon fontSize="small" />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        size="small"
                        edge="end"
                        onClick={() => setShowPw((v) => !v)}
                        aria-label={showPw ? 'Hide password' : 'Show password'}
                        sx={{ color: '#9CA3AF', '&:hover': { color: TEAL, bgcolor: 'transparent' } }}
                      >
                        {showPw ? <VisibilityOffOutlinedIcon fontSize="small" /> : <VisibilityOutlinedIcon fontSize="small" />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />
            {error ? (
              <Box
                role="alert"
                sx={{
                  px: 1.75,
                  py: 1.25,
                  borderRadius: '12px',
                  bgcolor: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#b91c1c',
                  fontFamily: UI_FONT,
                  fontSize: 13,
                }}
              >
                {error}
              </Box>
            ) : null}
            <Stack direction="row" spacing={1.25} sx={{ pt: 0.5 }}>
              <Button
                type="submit"
                disabled={busy}
                sx={{
                  flex: 2,
                  minHeight: 48,
                  borderRadius: '12px',
                  color: '#fff',
                  fontFamily: UI_FONT,
                  fontSize: 15,
                  fontWeight: 700,
                  background: 'linear-gradient(135deg, #0d9488, #14b8a6 50%, #f0c75e)',
                  backgroundSize: '200% 100%',
                  backgroundPosition: '0% 0%',
                  transition: 'background-position .35s ease, transform .15s ease, box-shadow .15s ease',
                  '&:hover': {
                    backgroundPosition: '100% 0%',
                    transform: 'translateY(-1px)',
                    boxShadow: '0 8px 25px rgba(13,148,136,.3)',
                  },
                  '&.Mui-disabled': { color: '#fff', opacity: 0.7 },
                }}
              >
                {busy ? 'Signing in…' : 'Sign In'}
              </Button>
              <Button
                type="button"
                onClick={clear}
                disabled={busy}
                sx={{
                  flex: 1,
                  minHeight: 48,
                  borderRadius: '12px',
                  border: '2px solid #e5e7eb',
                  color: '#6b7280',
                  bgcolor: 'transparent',
                  fontFamily: UI_FONT,
                  fontSize: 14,
                  fontWeight: 600,
                  '&:hover': { borderColor: '#d1d5db', bgcolor: 'rgba(255,255,255,.6)' },
                }}
              >
                Clear
              </Button>
            </Stack>
          </Stack>

          <Stack
            direction="row"
            spacing={0.75}
            sx={{ mt: 3.5, alignItems: 'center', color: '#9ca3af', fontFamily: UI_FONT, fontSize: 11 }}
          >
            <LockOutlinedIcon sx={{ fontSize: 13 }} />
            <span>Authorized access only · Trust Gatebook</span>
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}
