import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { errorMessage, fileUrl } from '../api/client';
import { termsApi } from '../api/endpoints';
import { TermsDoc } from '../components/Terms';

/**
 * `/terms` (no sign-in): the visitor terms, for a visitor to read on a screen at the gate or their own phone.
 * `?v=` shows an earlier version.
 */
export function TermsPage() {
  const [params] = useSearchParams();
  const raw = params.get('v');
  const v = raw && /^\d+$/.test(raw) ? Number(raw) : null;
  const [state, setState] = useState({ key: null, data: null, error: null });
  const key = String(v);
  useEffect(() => {
    const ctrl = new AbortController();
    termsApi
      .public(v, ctrl.signal)
      .then((data) => setState({ key, data, error: null }))
      .catch((err) => {
        if (err?.name !== 'AbortError') setState({ key, data: null, error: errorMessage(err) });
      });
    return () => ctrl.abort();
  }, [v, key]);
  const t = state.key === key ? state.data : null;
  const error = state.key === key ? state.error : null;

  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: 'background.default', py: { xs: 2, md: 5 }, px: 2 }}>
      <Paper
        variant="outlined"
        sx={{ maxWidth: 760, mx: 'auto', p: { xs: 2.5, md: 4 }, overflow: 'hidden', position: 'relative' }}
      >
        <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 5, bgcolor: 'gb.accent' }} />
        {error ? <Alert severity="error">{error}</Alert> : null}
        {!t && !error ? (
          <Box sx={{ py: 6, display: 'grid', placeItems: 'center' }}>
            <CircularProgress />
          </Box>
        ) : null}
        {t ? (
          <>
            {t.logoUrl ? (
              <Box
                component="img"
                src={fileUrl(t.logoUrl)}
                alt=""
                sx={{ maxHeight: 48, maxWidth: 200, display: 'block', mb: 1.5 }}
              />
            ) : null}
            <Typography variant="overline" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.3 }}>
              {t.company || 'Visitor terms'} · version {t.version}
            </Typography>
            <Typography variant="h1" component="h1" sx={{ fontSize: { xs: 26, md: 32 }, mb: 2 }}>
              {t.title}
            </Typography>
            {t.version !== t.current ? (
              <Alert severity="info" sx={{ mb: 2 }}>
                This is an earlier version. The terms in force now are version {t.current}.
              </Alert>
            ) : null}
            <TermsDoc body={t.body} flat />
          </>
        ) : null}
      </Paper>
    </Box>
  );
}
