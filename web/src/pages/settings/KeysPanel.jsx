import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '../../api/client';
import { keysApi } from '../../api/endpoints';
import { Panel } from '../../components/bits';
import { KeySheets } from '../../components/keys/KeySheets';
import { useKeysChanges } from '../../realtime/context';
import { useToast } from '../../state/context';
import { fonts } from '../../theme/tokens';

/** Settings → Keys: the keys kept at the gate (add, edit, take out of use). Admins. */
export function KeysPanel() {
  const toast = useToast();
  const [keys, setKeys] = useState(null);
  const [error, setError] = useState(null);
  const [sheet, setSheet] = useState(null);
  const load = useCallback(() => {
    keysApi
      .board()
      .then((r) => {
        setKeys(r.keys);
        setError(null);
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useKeysChanges(load);

  return (
    <Panel
      title="Keys"
      action={
        <Button size="small" variant="outlined" onClick={() => setSheet({ kind: 'edit' })}>
          + Add key
        </Button>
      }
    >
      <Typography variant="body2" sx={{ color: 'text.secondary', mt: -0.5, mb: 1.5 }}>
        Every key kept at the gate desk. Security issues and takes them back in the Key register.
      </Typography>
      {error ? <Alert severity="error">{error}</Alert> : null}
      {keys && keys.length === 0 ? (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          No keys yet. Add the first one.
        </Typography>
      ) : null}
      <Stack spacing={0.5}>
        {(keys ?? []).map((k) => (
          <Stack
            key={k.id}
            direction="row"
            spacing={1.5}
            sx={{ alignItems: 'center', py: 0.75, borderTop: 1, borderColor: 'divider', opacity: k.active ? 1 : 0.55 }}
          >
            <Typography sx={{ fontFamily: fonts.mono, fontWeight: 700, minWidth: 64 }}>{k.number}</Typography>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 600 }} noWrap>
                {k.name}
                {k.restricted ? <LockOutlinedIcon sx={{ fontSize: 15, ml: 0.5, verticalAlign: '-2px' }} /> : null}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }} noWrap>
                {[k.location, k.site, k.copies > 1 ? `${k.copies} copies` : ''].filter(Boolean).join(' · ')}
              </Typography>
            </Box>
            {!k.active ? <Chip size="small" variant="exited" label="Not in use" /> : null}
            {k.out.length ? <Chip size="small" variant="pending" label={`${k.out.length} out`} /> : null}
            <Button size="small" onClick={() => setSheet({ kind: 'edit', key: k })}>
              Edit
            </Button>
          </Stack>
        ))}
      </Stack>
      <KeySheets
        sheet={sheet}
        onClose={() => setSheet(null)}
        onDone={(k, s) => {
          toast(s.key ? `Key ${k.number} saved` : `Key ${k.number} added`);
          load();
        }}
      />
    </Panel>
  );
}
