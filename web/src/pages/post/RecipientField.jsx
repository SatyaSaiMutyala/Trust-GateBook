import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import FormHelperText from '@mui/material/FormHelperText';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import { hostsApi } from '../../api/endpoints';
import { useDebounced } from '../../hooks';
import { fonts } from '../../theme/tokens';
import { initials } from '../../utils/format';

/**
 * "For (receiver)" type-ahead over `GET /api/hosts?q=…&limit=8`. Picking a person sets the recipient
 * (and lets the caller fill Department); free text means "not on Gatebook".
 */
export function RecipientField({ recipient, text, onPick, onText, error }) {
  const q = useDebounced(text.trim(), 250);
  const [result, setResult] = useState({ q: null, options: [] });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    hostsApi
      .list({ q: q || undefined, limit: 8, page: 1, sort: 'name' }, ctrl.signal)
      .then((r) => setResult({ q, options: r.data }))
      .catch(() => {});
    return () => ctrl.abort();
  }, [q, open]);

  const loading = open && result.q !== q;
  const typedOnly = !recipient && text.trim().length > 0;

  return (
    <Box>
      <Autocomplete
        freeSolo
        open={open}
        onOpen={() => setOpen(true)}
        onClose={() => setOpen(false)}
        options={result.options}
        loading={loading}
        filterOptions={(x) => x}
        value={recipient}
        inputValue={text}
        getOptionLabel={(o) => (typeof o === 'string' ? o : o.name)}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        onChange={(_, v) => {
          if (v && typeof v === 'object') onPick(v);
          else onPick(null);
        }}
        onInputChange={(_, v, reason) => {
          if (reason === 'input' || reason === 'clear') onText(v);
        }}
        renderOption={(props, o) => {
          const { key, ...rest } = props;
          return (
            <Box component="li" key={key} {...rest} sx={{ gap: 1.5 }}>
              <Box
                sx={{
                  width: 34,
                  height: 34,
                  borderRadius: '50%',
                  bgcolor: 'gb.sunk',
                  border: 1,
                  borderColor: 'divider',
                  display: 'grid',
                  placeItems: 'center',
                  fontFamily: fonts.display,
                  fontWeight: 700,
                  color: 'text.secondary',
                  flexShrink: 0,
                }}
              >
                {initials(o.name)}
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontWeight: 600 }}>{o.name}</Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {[o.dept, o.location].filter(Boolean).join(' · ') || '—'}
                </Typography>
              </Box>
            </Box>
          );
        }}
        noOptionsText={text.trim() ? 'No one on Gatebook matches. Keep typing the name.' : 'Type a name or department'}
        renderInput={(params) => (
          <TextField {...params} label="For (receiver)" required error={error} placeholder="Name or department" />
        )}
      />
      {recipient ? (
        <FormHelperText component="div" sx={{ color: 'success.main' }}>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            <NotificationsActiveOutlinedIcon sx={{ fontSize: 16 }} />
            <span>Gets a notification and must confirm collection</span>
          </Stack>
        </FormHelperText>
      ) : typedOnly ? (
        <FormHelperText component="div" sx={{ color: 'warning.main' }}>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            <PhoneOutlinedIcon sx={{ fontSize: 16 }} />
            <span>Not on Gatebook. Inform them by phone.</span>
          </Stack>
        </FormHelperText>
      ) : null}
    </Box>
  );
}
