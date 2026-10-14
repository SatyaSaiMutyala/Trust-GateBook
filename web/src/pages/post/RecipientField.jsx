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
 * "For (receiver)": pick the employee the post is addressed to (type-ahead over `GET /api/hosts?q=…&limit=8`;
 * they get notified and must confirm collection), or type a name for someone not on Gatebook (security
 * informs them by phone). The list opens on focus, so it reads as a picker, and explains itself when empty.
 */
export function RecipientField({ recipient, text, onPick, onText, error }) {
  const q = useDebounced(text.trim(), 250);
  const [result, setResult] = useState({ q: null, options: [], error: null });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    hostsApi
      .list({ q: q || undefined, limit: 8, page: 1, sort: 'name' }, ctrl.signal)
      .then((r) => setResult({ q, options: r.data, error: null }))
      .catch((err) => {
        // Aborted (typing / closing) → ignore; otherwise show why (e.g. server unreachable).
        if (ctrl.signal.aborted) return;
        setResult({ q, options: [], error: err?.message || "Couldn't load employees. You can still type the name." });
      });
    return () => ctrl.abort();
  }, [q, open]);

  const loading = open && result.q !== q;
  const typedOnly = !recipient && text.trim().length > 0;

  return (
    <Box>
      <Autocomplete
        freeSolo
        forcePopupIcon
        openOnFocus
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
        noOptionsText={
          result.error
            ? result.error
            : text.trim()
              ? `No one named “${text.trim()}” can receive post on Gatebook. Keep the typed name — you'll inform them by phone.`
              : "No one can receive post on Gatebook yet. An admin can add Employees or tick “Can also receive post” in Settings → Users. For now, type the receiver's name — you'll inform them by phone."
        }
        loadingText="Loading employees…"
        renderInput={(params) => (
          <TextField
            {...params}
            label="For (receiver)"
            required
            error={error}
            placeholder="Search employees or type a name"
          />
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
            <span>Not on Gatebook — call them to collect it.</span>
          </Stack>
        </FormHelperText>
      ) : (
        <FormHelperText>Pick the employee it is addressed to. Not listed? Type their name.</FormHelperText>
      )}
    </Box>
  );
}
