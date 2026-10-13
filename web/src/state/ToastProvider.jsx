import Snackbar from '@mui/material/Snackbar';
import { useCallback, useState } from 'react';
import { ToastContext } from './context';
export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const [open, setOpen] = useState(false);
  const show = useCallback((message) => {
    setToast({ key: Date.now(), message });
    setOpen(true);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <Snackbar
        key={toast?.key}
        open={open}
        message={toast?.message}
        autoHideDuration={3500}
        onClose={(_, reason) => {
          if (reason !== 'clickaway') setOpen(false);
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ bottom: { xs: 'calc(88px + env(safe-area-inset-bottom))', md: 24 } }}
      />
    </ToastContext.Provider>
  );
}
