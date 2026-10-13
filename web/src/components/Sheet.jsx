import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import Drawer from '@mui/material/Drawer';
import { useIsDesktop } from '../hooks';

/** Bottom sheet on phone, centred dialog on desktop (Exit, Handover, Resolve). */
export function Sheet({ open, onClose, children, maxWidth = 'xs' }) {
  const desktop = useIsDesktop();
  if (desktop) {
    return (
      <Dialog open={open} onClose={onClose} fullWidth maxWidth={maxWidth}>
        {children}
      </Dialog>
    );
  }
  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      slotProps={{ paper: { sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '92vh' } } }}
    >
      <Box sx={{ width: 40, height: 4, borderRadius: 2, bgcolor: 'divider', mx: 'auto', mt: 1.25 }} />
      {children}
    </Drawer>
  );
}
