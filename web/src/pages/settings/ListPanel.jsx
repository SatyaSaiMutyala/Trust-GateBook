import AddIcon from '@mui/icons-material/Add';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import FormHelperText from '@mui/material/FormHelperText';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { errorMessage } from '../../api/client';
import { Panel } from '../../components/bits';

/** Removable tags + add field. Removing the last entry is refused. */
export function ListPanel({ title, description, items, editable, onSave, addLabel }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const save = async (next) => {
    setBusy(true);
    setError(null);
    try {
      await onSave(next);
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async (e) => {
    e.preventDefault();
    const v = value.trim().replace(/\s+/g, ' ');
    if (!v) return;
    if (items.some((i) => i.toLowerCase() === v.toLowerCase())) {
      setError(`"${v}" is already in the list.`);
      return;
    }
    if (await save([...items, v])) setValue('');
  };

  const remove = (item) => {
    if (items.length <= 1) {
      setError('Keep at least one.');
      return;
    }
    void save(items.filter((i) => i !== item));
  };

  return (
    <Panel title={title}>
      {description ? (
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: -0.5, mb: 1.5 }}>
          {description}
        </Typography>
      ) : null}
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1, mb: editable ? 2 : 0 }}>
        {items.map((item) => (
          <Chip
            key={item}
            label={item}
            onDelete={editable && !busy ? () => remove(item) : undefined}
            sx={{ bgcolor: 'gb.sunk', border: 1, borderColor: 'divider', height: 32, fontSize: 14 }}
          />
        ))}
      </Stack>
      {editable ? (
        <Stack component="form" onSubmit={add} direction="row" spacing={1}>
          <TextField
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            placeholder={addLabel}
            slotProps={{ htmlInput: { 'aria-label': addLabel, maxLength: 60 } }}
          />
          <Button type="submit" variant="outlined" startIcon={<AddIcon />} disabled={busy || !value.trim()}>
            Add
          </Button>
        </Stack>
      ) : null}
      {error ? (
        <FormHelperText error sx={{ mt: 1, fontSize: 13.5 }}>
          {error}
        </FormHelperText>
      ) : null}
    </Panel>
  );
}
