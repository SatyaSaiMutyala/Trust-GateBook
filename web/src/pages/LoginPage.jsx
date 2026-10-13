import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { Navigate, useLocation } from 'react-router';
import { errorMessage } from '../api/client';
import { useAuth } from '../auth/context';
import { fonts } from '../theme/tokens';

export function LoginPage() {
  const { status, login } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

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

  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: 'background.default', display: 'flex', alignItems: 'center', py: 4 }}>
      <Grid container sx={{ width: '100%', justifyContent: 'center', px: 2 }}>
        <Grid size={{ xs: 12, sm: 8, md: 5, lg: 4, xl: 3 }}>
          <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
            <Box sx={{ bgcolor: 'gb.rail', color: 'gb.railInk', px: 3, py: 3 }}>
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                <Box
                  sx={{
                    width: 42,
                    height: 42,
                    borderRadius: 1,
                    bgcolor: 'gb.accent',
                    color: 'gb.accentInk',
                    display: 'grid',
                    placeItems: 'center',
                    fontFamily: fonts.display,
                    fontWeight: 700,
                    fontSize: 24,
                  }}
                >
                  G
                </Box>
                <Box>
                  <Typography
                    sx={{
                      fontFamily: fonts.display,
                      fontWeight: 700,
                      letterSpacing: '0.14em',
                      fontSize: 26,
                      lineHeight: 1,
                    }}
                  >
                    GATEBOOK
                  </Typography>
                  <Typography sx={{ color: 'gb.railMuted', fontSize: 13, mt: 0.5 }}>Visitor register</Typography>
                </Box>
              </Stack>
            </Box>
            <Box component="form" onSubmit={submit} noValidate sx={{ p: 3 }}>
              <Typography variant="h2" sx={{ mb: 2.5 }}>
                Sign in
              </Typography>
              <Grid container spacing={2}>
                <Grid size={12}>
                  <TextField
                    label="Email"
                    type="email"
                    autoComplete="username"
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </Grid>
                <Grid size={12}>
                  <TextField
                    label="Password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </Grid>
                {error ? (
                  <Grid size={12}>
                    <Alert severity="error">{error}</Alert>
                  </Grid>
                ) : null}
                <Grid size={12}>
                  <Button type="submit" variant="contained" color="primary" size="large" fullWidth disabled={busy}>
                    {busy ? 'Signing in…' : 'Sign in'}
                  </Button>
                </Grid>
              </Grid>
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
