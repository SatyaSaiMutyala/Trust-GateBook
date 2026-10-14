import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import MailOutlineIcon from '@mui/icons-material/EmailOutlined';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMemo, useState } from 'react';
import { ApiError, errorMessage } from '../../api/client';
import { mailApi } from '../../api/endpoints';
import { useUser } from '../../auth/context';
import { canOperate } from '../../auth/roles';
import { PageHeader } from '../../components/bits';
import { PhotoTile } from '../../components/PhotoTile';
import { useLocalEmit } from '../../realtime/context';
import { useMailDraft, useSettings, useToast } from '../../state/context';
import { fonts } from '../../theme/tokens';
import { CARRIERS } from '../../utils/mail';
import { MailLogged } from './MailLogged';
import { RecipientField } from './RecipientField';

const REQUIRED = ['cover', 'person', 'kind', 'sender', 'broughtBy', 'recipient'];
/** Server field names → form fields to highlight. */
const FIELD_MAP = { recipientId: 'recipient', recipientName: 'recipient' };

export function LogPostPage() {
  const { draft, update, reset, issued, setIssued } = useMailDraft();
  if (issued) {
    return (
      <MailLogged
        item={issued}
        onNext={() => {
          reset();
          setIssued(null);
        }}
      />
    );
  }
  return <LogPostForm draft={draft} update={update} reset={reset} onIssued={setIssued} />;
}

function LogPostForm({ draft, update, reset, onIssued }) {
  const user = useUser();
  const { settings } = useSettings();
  const toast = useToast();
  const emit = useLocalEmit();
  const [invalid, setInvalid] = useState(() => new Set());
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);
  const allowed = canOperate(user);

  const clearInvalid = (field) => {
    if (!invalid.has(field)) return;
    const next = new Set(invalid);
    next.delete(field);
    setInvalid(next);
  };
  const setField = (field, value) => {
    update({ [field]: value });
    clearInvalid(field);
  };
  const set = (field) => (e) => {
    let v = e.target.value;
    if (field === 'refNo') v = v.toUpperCase();
    if (field === 'broughtPhone') v = v.replace(/[^\d+]/g, '').slice(0, 14);
    if (field === 'pieces') v = v.replace(/\D/g, '').slice(0, 2);
    setField(field, v);
  };
  const err = (f) => invalid.has(f);

  const kinds = useMemo(() => {
    const list = settings?.mailKinds ?? [];
    return draft.kind && !list.includes(draft.kind) ? [...list, draft.kind] : list;
  }, [settings, draft.kind]);
  const departments = useMemo(() => {
    const list = settings?.departments ?? [];
    return draft.dept && !list.includes(draft.dept) ? [...list, draft.dept] : list;
  }, [settings, draft.dept]);

  const submit = async (e) => {
    e.preventDefault();
    setFormError(null);
    const missing = new Set(
      REQUIRED.filter((f) => {
        if (f === 'recipient') return !draft.recipient && !draft.recipientText.trim();
        const v = draft[f];
        return !v || (typeof v === 'string' && !v.trim());
      }),
    );
    if (missing.size) {
      setInvalid(missing);
      setFormError('Fill the highlighted fields and take both photos.');
      return;
    }
    const pieces = Math.min(99, Math.max(1, Number.parseInt(draft.pieces, 10) || 1));
    setBusy(true);
    try {
      const item = await mailApi.create(
        {
          kind: draft.kind,
          sender: draft.sender.trim(),
          refNo: draft.refNo.trim(),
          carrier: draft.carrier.trim(),
          broughtBy: draft.broughtBy.trim(),
          broughtPhone: draft.broughtPhone.trim(),
          pieces,
          ...(draft.recipient ? { recipientId: draft.recipient.id } : { recipientName: draft.recipientText.trim() }),
          dept: draft.dept,
          notes: draft.notes.trim(),
        },
        draft.cover.blob,
        draft.person.blob,
      );
      emit('mail:created', { item });
      toast(item.notifiedAt ? `Logged · ${item.recipientName} notified` : `Logged · call ${item.recipientName}`);
      setInvalid(new Set());
      reset();
      onIssued(item);
    } catch (error) {
      if (error instanceof ApiError && error.field) setInvalid(new Set([FIELD_MAP[error.field] ?? error.field]));
      setFormError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const clear = () => {
    reset();
    setInvalid(new Set());
    setFormError(null);
  };

  return (
    <>
      <PageHeader eyebrow="Post room" title="Log incoming post" />
      {!allowed ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          Your account can view the post room but cannot log items.
        </Alert>
      ) : null}

      <Box component="form" onSubmit={submit} noValidate>
        <Grid container spacing={3}>
          {/* Photo column */}
          <Grid size={{ xs: 12, md: 4, lg: 3 }}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 6, md: 12 }}>
                <PhotoTile
                  title="Cover"
                  label="Photo of the cover"
                  hint="Show the address label and tracking number"
                  aspect="4 / 3"
                  facing="environment"
                  icon={MailOutlineIcon}
                  maxEdge={1800}
                  required
                  error={err('cover')}
                  value={draft.cover}
                  onChange={(cover) => setField('cover', cover)}
                />
              </Grid>
              <Grid size={{ xs: 6, md: 12 }}>
                <PhotoTile
                  title="Delivery person"
                  label="Photo of delivery person"
                  hint="Face, shoulders up"
                  aspect="3 / 4"
                  facing="user"
                  icon={LocalShippingOutlinedIcon}
                  required
                  error={err('person')}
                  value={draft.person}
                  onChange={(person) => setField('person', person)}
                />
              </Grid>
            </Grid>
          </Grid>

          {/* Form */}
          <Grid size={{ xs: 12, md: 8, lg: 9 }}>
            <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
              <Grid container spacing={2}>
                <Grid size={12}>
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 600,
                      fontSize: '0.8rem',
                      color: err('kind') ? 'error.main' : 'text.secondary',
                      mb: 0.75,
                    }}
                  >
                    Type{' '}
                    <Box component="span" sx={{ color: 'error.main' }}>
                      *
                    </Box>
                  </Typography>
                  <Stack
                    direction="row"
                    role="radiogroup"
                    aria-label="Type"
                    sx={{
                      flexWrap: 'wrap',
                      gap: 1,
                      p: err('kind') ? 1 : 0,
                      borderRadius: 1,
                      bgcolor: err('kind') ? 'gb.badSoft' : 'transparent',
                    }}
                  >
                    {kinds.map((k) => {
                      const on = draft.kind === k;
                      return (
                        <Chip
                          key={k}
                          role="radio"
                          aria-checked={on}
                          label={k}
                          clickable
                          onClick={() => setField('kind', on ? '' : k)}
                          variant={on ? 'filled' : 'outlined'}
                          color={on ? 'secondary' : 'default'}
                          sx={{ height: 38, fontSize: 14, px: 0.5, bgcolor: on ? undefined : 'background.paper' }}
                        />
                      );
                    })}
                  </Stack>
                </Grid>

                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="From (sender)"
                    required
                    value={draft.sender}
                    onChange={set('sender')}
                    error={err('sender')}
                    placeholder="Income Tax Department"
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="Tracking / reference no."
                    value={draft.refNo}
                    onChange={set('refNo')}
                    slotProps={{
                      htmlInput: { autoComplete: 'off', style: { fontFamily: fonts.mono, textTransform: 'uppercase' } },
                    }}
                  />
                </Grid>

                <Grid size={{ xs: 12, sm: 6 }}>
                  <Autocomplete
                    freeSolo
                    options={CARRIERS}
                    inputValue={draft.carrier}
                    onInputChange={(_, v) => setField('carrier', v)}
                    renderInput={(params) => (
                      <TextField {...params} label="Brought by" placeholder="Post / courier company" />
                    )}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="Delivery person's name"
                    required
                    value={draft.broughtBy}
                    onChange={set('broughtBy')}
                    error={err('broughtBy')}
                  />
                </Grid>

                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="Delivery person's mobile"
                    value={draft.broughtPhone}
                    onChange={set('broughtPhone')}
                    slotProps={{
                      htmlInput: { inputMode: 'tel', autoComplete: 'off', style: { fontFamily: fonts.mono } },
                    }}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="No. of pieces"
                    value={draft.pieces}
                    onChange={set('pieces')}
                    slotProps={{ htmlInput: { inputMode: 'numeric', 'aria-label': 'Number of pieces (1–99)' } }}
                  />
                </Grid>

                <Grid size={{ xs: 12, sm: 6 }}>
                  <RecipientField
                    recipient={draft.recipient}
                    text={draft.recipientText}
                    error={err('recipient')}
                    onPick={(host) => {
                      if (host) update({ recipient: host, recipientText: host.name, dept: host.dept || draft.dept });
                      else update({ recipient: null });
                      clearInvalid('recipient');
                    }}
                    onText={(v) => {
                      update({
                        recipientText: v,
                        recipient: draft.recipient && draft.recipient.name === v ? draft.recipient : null,
                      });
                      clearInvalid('recipient');
                    }}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    select
                    label="Department"
                    value={draft.dept}
                    onChange={set('dept')}
                    slotProps={{ select: { displayEmpty: true } }}
                  >
                    <MenuItem value="">
                      <em>Not set</em>
                    </MenuItem>
                    {departments.map((d) => (
                      <MenuItem key={d} value={d}>
                        {d}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>

                <Grid size={12}>
                  <TextField label="Remarks" value={draft.notes} onChange={set('notes')} multiline minRows={2} />
                </Grid>

                {formError ? (
                  <Grid size={12}>
                    <Alert severity="error">{formError}</Alert>
                  </Grid>
                ) : null}

                <Grid size={12}>
                  <Stack direction="row" spacing={1.5} sx={{ justifyContent: 'flex-end' }}>
                    <Button variant="outlined" size="large" onClick={clear} disabled={busy}>
                      Clear
                    </Button>
                    <Button
                      type="submit"
                      variant="contained"
                      color="primary"
                      size="large"
                      disabled={busy || !allowed}
                      sx={{ flex: { xs: 1, sm: 'none' } }}
                    >
                      {busy ? 'Saving…' : 'Log & notify receiver'}
                    </Button>
                  </Stack>
                </Grid>
              </Grid>
            </Paper>
          </Grid>
        </Grid>
      </Box>
    </>
  );
}
