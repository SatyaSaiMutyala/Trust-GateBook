import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from './context';

/** Route guard: signed-in users only; optional role list. */
export function RequireAuth({ children, roles }) {
  const { status, user } = useAuth();
  const location = useLocation();
  if (status === 'loading') {
    return (
      <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', bgcolor: 'background.default' }}>
        <CircularProgress color="primary" />
      </Box>
    );
  }
  if (status !== 'signedIn' || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}
