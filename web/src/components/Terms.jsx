import CheckIcon from '@mui/icons-material/Check';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { errorMessage, fileUrl } from '../api/client';
import { visitsApi } from '../api/endpoints';
import { useUser } from '../auth/context';
import { canOperate } from '../auth/roles';
import { useLocalEmit } from '../realtime/context';
import { useSettings, useToast } from '../state/context';
import { termsSections } from '../utils/terms';

/** The terms text as headed sections. `flat` = no scroll box (pages / previews). */
export function TermsDoc({ body, flat = false }) {
  return (
    <Box
      sx={{
        fontSize: flat ? 14 : 15,
        lineHeight: 1.6,
        ...(flat ? {} : { maxHeight: '58vh', overflowY: 'auto', pr: 1.5 }),
      }}
    >
      {termsSections(body).map((s, i) => (
        <Box key={i} sx={{ mb: 1 }}>
          {s.heading ? (
            <Typography sx={{ fontWeight: 700, fontSize: 15, mt: 1.5, mb: 0.25 }}>{s.heading}</Typography>
          ) : null}
          <Typography sx={{ fontSize: 'inherit', lineHeight: 'inherit' }}>{s.text}</Typography>
        </Box>
      ))}
    </Box>
  );
}

/**
 * The current terms in a dialog. From the check-in form (`onAgree`), it ends with "Visitor agrees".
 */
export function TermsDialog({ open, onClose, onAgree }) {
  const { settings } = useSettings();
  const terms = settings?.terms;
  const logo = settings?.company?.logoUrl;
  if (!terms) return null;
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" aria-labelledby="terms-h">
      <DialogTitle id="terms-h" component="div">
        {logo ? (
          <Box
            component="img"
            src={fileUrl(logo)}
            alt=""
            sx={{ maxHeight: 44, maxWidth: 180, display: 'block', mb: 1 }}
          />
        ) : null}
        <Typography variant="overline" sx={{ display: 'block', color: 'text.secondary', lineHeight: 1.3 }}>
          {terms.company || settings.company?.legalName || 'Visitor terms'} · version {terms.version}
        </Typography>
        <Typography variant="h2" component="h2">
          {terms.title}
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        <TermsDoc body={terms.body} />
      </DialogContent>
      <DialogActions>
        <Button component="a" href="/terms" target="_blank" rel="noopener">
          Open as a page
        </Button>
        <Button onClick={onClose}>Close</Button>
        {onAgree ? (
          <Button variant="contained" color="success" startIcon={<CheckIcon />} onClick={onAgree}>
            Visitor agrees
          </Button>
        ) : null}
      </DialogActions>
    </Dialog>
  );
}

/**
 * "Agreement PDF" for a visit that accepted the terms: open it, or (gate) create it when it is missing.
 * Renders nothing for visits without accepted terms.
 */
export function AgreementButton({ visit, size = 'small', onUpdated }) {
  const user = useUser();
  const toast = useToast();
  const emit = useLocalEmit();
  const [busy, setBusy] = useState(false);
  if (!visit.termsAt) return null;
  if (visit.agreementUrl) {
    return (
      <Button
        size={size}
        variant="outlined"
        startIcon={<PictureAsPdfOutlinedIcon />}
        component="a"
        href={visit.agreementUrl}
        target="_blank"
        rel="noopener"
      >
        Agreement PDF
      </Button>
    );
  }
  if (!canOperate(user)) return null;
  const make = async () => {
    setBusy(true);
    try {
      const v = await visitsApi.makeAgreement(visit.id);
      emit('visit:updated', { visit: v });
      onUpdated?.(v);
      toast('Agreement PDF created');
      if (v.agreementUrl) window.open(v.agreementUrl, '_blank', 'noopener');
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button size={size} variant="outlined" startIcon={<PictureAsPdfOutlinedIcon />} onClick={make} disabled={busy}>
      {busy ? 'Creating…' : 'Create agreement PDF'}
    </Button>
  );
}
