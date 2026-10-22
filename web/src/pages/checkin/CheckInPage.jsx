import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import FormHelperText from '@mui/material/FormHelperText';
import Grid from '@mui/material/Grid';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useEffect, useMemo, useState } from 'react';
import { ApiError, errorMessage } from '../../api/client';
import { visitsApi } from '../../api/endpoints';
import { useUser } from '../../auth/context';
import { canOperate } from '../../auth/roles';
import { PageHeader } from '../../components/bits';
import { PhotoTile } from '../../components/PhotoTile';
import { TermsDialog } from '../../components/Terms';
import { useDebounced, useNow } from '../../hooks';
import { useLocalEmit } from '../../realtime/context';
import { useCheckInDraft, useSettings, useToast } from '../../state/context';
import { fonts } from '../../theme/tokens';
import { ID_TYPES } from '../../types';
import { digitsOnly, fmtTime } from '../../utils/format';
import { RecipientField } from '../post/RecipientField';
import { ExpectedBanner, ExpectedPhoneMatch, ExpectedTodayStrip } from './ExpectedHints';
import { PassIssued } from './PassIssued';
import { ReturningVisitor } from './ReturningVisitor';

const REQUIRED = ['photo', 'phone', 'name', 'purpose', 'host', 'badge'];
/** Server error fields → form fields. */
const FIELD_MAP = { hostId: 'host' };

/** "Whom to meet": a picked employee is asked to accept in the app; a typed name is confirmed by phone. */
const HOST_WORDING = {
  label: 'Whom to meet',
  picked: 'Gets a notification and accepts or declines in TruSentinel',
  typed: 'Not on TruSentinel — call them to confirm before letting the visitor in.',
  idle: 'Pick the employee being visited. Not listed? Type their name.',
  noMatch: (name) => `No employee named “${name}” is on TruSentinel. Keep the typed name — you'll confirm by phone.`,
  none: "No employees are on TruSentinel yet. An admin can add them in Settings → Users. For now, type the name — you'll confirm by phone.",
};

export function CheckInPage() {
  const { draft, update, reset, issued, setIssued } = useCheckInDraft();
  if (issued) {
    return (
      <PassIssued
        visit={issued}
        onNext={() => {
          reset();
          setIssued(null);
        }}
      />
    );
  }
  return <CheckInForm draft={draft} update={update} reset={reset} onIssued={setIssued} />;
}

function LiveClock() {
  const now = useNow(10_000);
  return (
    <Typography sx={{ fontFamily: fonts.mono, fontWeight: 500, fontSize: { xs: 20, md: 26 }, color: 'text.secondary' }}>
      {fmtTime(now)}
    </Typography>
  );
}

function CheckInForm({ draft, update, reset, onIssued }) {
  const user = useUser();
  const { settings } = useSettings();
  const termsOn = !!settings?.terms?.required;
  const [termsOpen, setTermsOpen] = useState(false);
  const toast = useToast();
  const emit = useLocalEmit();
  const [invalid, setInvalid] = useState(() => new Set());
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);
  const allowed = canOperate(user);

  const set = (field) => (e) => {
    let v = e.target.value;
    if (field === 'phone') v = v.replace(/[^\d+]/g, '').slice(0, 14);
    if (field === 'idLast4') v = digitsOnly(v).slice(0, 4);
    if (field === 'vehicle') v = v.toUpperCase();
    if (field === 'badge')
      v = v
        .toUpperCase()
        .replace(/[^A-Z0-9-]/g, '')
        .slice(0, 12);
    update({ [field]: v });
    if (invalid.has(field)) {
      const next = new Set(invalid);
      next.delete(field);
      setInvalid(next);
    }
  };
  const err = (f) => invalid.has(f);

  // ---- badge check (debounced) --------------------------------------------------
  const badgeKey = useDebounced(draft.badge, 350);
  const [badgeCheck, setBadgeCheck] = useState({ key: '', inUse: null });
  useEffect(() => {
    if (!badgeKey) return;
    const ctrl = new AbortController();
    visitsApi
      .badgeCheck(badgeKey, ctrl.signal)
      .then((inUse) => setBadgeCheck({ key: badgeKey, inUse }))
      .catch(() => {});
    return () => ctrl.abort();
  }, [badgeKey]);
  const currentBadgeKey = draft.badge;
  const badgeHolder = badgeCheck.key === currentBadgeKey && currentBadgeKey ? badgeCheck.inUse : null;
  const badgeMessage = badgeHolder
    ? `Pass ${badgeHolder.badge} is with ${badgeHolder.name} (inside since ${fmtTime(badgeHolder.inAt)}).`
    : null;

  // ---- returning visitor -------------------------------------------------------
  const phoneDigits = digitsOnly(draft.phone);
  const lookupPhone = useDebounced(phoneDigits.length >= 10 ? phoneDigits.slice(-10) : '', 350);

  const purposes = useMemo(() => {
    const list = settings?.purposes ?? [];
    return draft.purpose && !list.includes(draft.purpose) ? [...list, draft.purpose] : list;
  }, [settings, draft.purpose]);
  const departments = useMemo(() => {
    const list = settings?.departments ?? [];
    return draft.dept && !list.includes(draft.dept) ? [...list, draft.dept] : list;
  }, [settings, draft.dept]);

  const fillFrom = (v) => {
    update({
      name: v.name || draft.name,
      company: v.company ?? '',
      host: v.host ?? '',
      // Same employee as last time (the server re-checks they can still receive visitors).
      hostPick: v.hostId
        ? { id: v.hostId, name: v.host, dept: v.dept ?? '', location: v.hostLocation ?? '', phone: '' }
        : null,
      dept: v.dept ?? '',
      vehicle: v.vehicle ?? '',
      idType: v.idType || 'Aadhaar',
      idLast4: v.idLast4 ?? '',
    });
    toast('Details filled from last visit. Take a fresh photo.');
  };

  const submit = async (e) => {
    e.preventDefault();
    setFormError(null);
    // Photo and pass number can be made optional in Settings → Visitors.
    const required = REQUIRED.filter(
      (f) =>
        !(f === 'photo' && settings?.visitorPhotoRequired === false) &&
        !(f === 'badge' && settings?.visitorPassRequired === false),
    );
    const missing = new Set(required.filter((f) => !draft[f] || (typeof draft[f] === 'string' && !draft[f].trim())));
    if (termsOn && !draft.terms) missing.add('terms');
    if (draft.phone && phoneDigits.length < 10) missing.add('phone');
    if (missing.size) {
      setInvalid(missing);
      setFormError('Fill the highlighted fields.');
      return;
    }
    if (badgeMessage) {
      setInvalid(new Set(['badge']));
      setFormError(`${badgeMessage} Use another pass or check them out first.`);
      return;
    }
    const persons = Math.min(50, Math.max(1, Number.parseInt(draft.persons, 10) || 1));
    setBusy(true);
    try {
      const visit = await visitsApi.checkIn(
        {
          badge: draft.badge.trim(),
          phone: draft.phone.trim(),
          name: draft.name.trim(),
          company: draft.company.trim(),
          persons,
          purpose: draft.purpose,
          ...(draft.hostPick ? { hostId: draft.hostPick.id } : { host: draft.host.trim() }),
          ...(draft.expected ? { expectedId: draft.expected.code } : {}),
          dept: draft.dept,
          idType: draft.idType,
          idLast4: draft.idLast4,
          vehicle: draft.vehicle.trim(),
          items: draft.items.trim(),
          notes: draft.notes.trim(),
          ...(termsOn ? { termsAccepted: !!draft.terms } : {}),
        },
        draft.photo?.blob ?? null,
        draft.idPhoto?.blob ?? null,
      );
      emit('visit:created', { visit });
      toast(
        visit.hostStatus === 'waiting'
          ? `Checked in · ${visit.host} notified`
          : visit.hostVia === 'preapproved'
            ? `Checked in · pre-approved by ${visit.host}, send them in`
            : `Checked in · call ${visit.host} to confirm`,
      );
      setInvalid(new Set());
      reset();
      onIssued(visit);
    } catch (error) {
      if (error instanceof ApiError && error.field) setInvalid(new Set([FIELD_MAP[error.field] ?? error.field]));
      else if (error instanceof ApiError && error.code === 'already_inside') setInvalid(new Set(['phone']));
      else if (error instanceof ApiError && error.code === 'badge_in_use') setInvalid(new Set(['badge']));
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
      <PageHeader eyebrow="New entry" title="Check in a visitor" right={<LiveClock />} />
      {!allowed ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          Your account can view the register but cannot check visitors in.
        </Alert>
      ) : null}
      {draft.expected ? (
        <ExpectedBanner entry={draft.expected} onUnlink={() => update({ expected: null })} />
      ) : (
        <ExpectedTodayStrip />
      )}

      <Box component="form" onSubmit={submit} noValidate>
        <Grid container spacing={3}>
          {/* Photo column */}
          <Grid size={{ xs: 12, md: 4, lg: 3 }}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 6, md: 12 }}>
                <PhotoTile
                  label="Take visitor photo"
                  hint="Face, shoulders up"
                  aspect="3 / 4"
                  facing="user"
                  required={settings?.visitorPhotoRequired !== false}
                  error={err('photo')}
                  value={draft.photo}
                  onChange={(photo) => {
                    update({ photo });
                    if (invalid.has('photo')) setInvalid(new Set([...invalid].filter((f) => f !== 'photo')));
                  }}
                />
              </Grid>
              <Grid size={{ xs: 6, md: 12 }}>
                <PhotoTile
                  label="Photo of ID proof"
                  hint="Back camera, card flat"
                  aspect="16 / 10"
                  facing="environment"
                  idProof
                  value={draft.idPhoto}
                  onChange={(idPhoto) => update({ idPhoto })}
                />
              </Grid>
            </Grid>
          </Grid>

          {/* Form */}
          <Grid size={{ xs: 12, md: 8, lg: 9 }}>
            <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="Mobile number"
                    required
                    value={draft.phone}
                    onChange={set('phone')}
                    error={err('phone')}
                    placeholder="98765 43210"
                    slotProps={{
                      htmlInput: { inputMode: 'tel', autoComplete: 'off', style: { fontFamily: fonts.mono } },
                    }}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="Visitor name"
                    required
                    value={draft.name}
                    onChange={set('name')}
                    error={err('name')}
                  />
                </Grid>

                {lookupPhone && !draft.expected ? (
                  <Grid size={12}>
                    <ExpectedPhoneMatch phone={lookupPhone} />
                  </Grid>
                ) : null}
                {lookupPhone ? (
                  <Grid size={12}>
                    <ReturningVisitor phone={lookupPhone} onFill={fillFrom} />
                  </Grid>
                ) : null}

                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="Coming from"
                    value={draft.company}
                    onChange={set('company')}
                    placeholder="Company / place"
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="No. of persons"
                    type="number"
                    value={draft.persons}
                    onChange={set('persons')}
                    slotProps={{ htmlInput: { min: 1, max: 50, inputMode: 'numeric' } }}
                  />
                </Grid>

                <Grid size={12}>
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 600,
                      fontSize: '0.8rem',
                      color: err('purpose') ? 'error.main' : 'text.secondary',
                      mb: 0.75,
                    }}
                  >
                    Purpose{' '}
                    <Box component="span" sx={{ color: 'error.main' }}>
                      *
                    </Box>
                  </Typography>
                  <Stack
                    direction="row"
                    sx={{
                      flexWrap: 'wrap',
                      gap: 1,
                      p: err('purpose') ? 1 : 0,
                      borderRadius: 1,
                      bgcolor: err('purpose') ? 'gb.badSoft' : 'transparent',
                    }}
                    role="radiogroup"
                    aria-label="Purpose"
                  >
                    {purposes.map((p) => {
                      const on = draft.purpose === p;
                      return (
                        <Chip
                          key={p}
                          role="radio"
                          aria-checked={on}
                          label={p}
                          clickable
                          onClick={() => set('purpose')({ target: { value: on ? '' : p } })}
                          variant={on ? 'filled' : 'outlined'}
                          color={on ? 'secondary' : 'default'}
                          sx={{ height: 38, fontSize: 14, px: 0.5, bgcolor: on ? undefined : 'background.paper' }}
                        />
                      );
                    })}
                  </Stack>
                </Grid>

                <Grid size={{ xs: 12, sm: 6 }}>
                  <RecipientField
                    wording={HOST_WORDING}
                    recipient={draft.hostPick}
                    text={draft.host}
                    error={err('host')}
                    onPick={(h) => {
                      if (h) update({ hostPick: h, host: h.name, dept: h.dept || draft.dept });
                      else update({ hostPick: null });
                      if (invalid.has('host')) setInvalid(new Set([...invalid].filter((f) => f !== 'host')));
                    }}
                    onText={(t) => {
                      update({ host: t, hostPick: null });
                      if (invalid.has('host')) setInvalid(new Set([...invalid].filter((f) => f !== 'host')));
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

                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField select label="ID shown" value={draft.idType} onChange={set('idType')}>
                    {ID_TYPES.map((t) => (
                      <MenuItem key={t} value={t}>
                        {t}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="ID last 4 digits"
                    value={draft.idLast4}
                    onChange={set('idLast4')}
                    disabled={draft.idType === 'None'}
                    slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 4, style: { fontFamily: fonts.mono } } }}
                  />
                </Grid>

                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="Vehicle number"
                    value={draft.vehicle}
                    onChange={set('vehicle')}
                    placeholder="TS 09 AB 1234"
                    slotProps={{ htmlInput: { style: { fontFamily: fonts.mono, textTransform: 'uppercase' } } }}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="Items carried in"
                    value={draft.items}
                    onChange={set('items')}
                    placeholder="Laptop, samples…"
                  />
                </Grid>

                <Grid size={12}>
                  <TextField
                    label="Pass number"
                    required={settings?.visitorPassRequired !== false}
                    value={draft.badge}
                    onChange={set('badge')}
                    error={err('badge') || !!badgeMessage}
                    placeholder="12"
                    slotProps={{
                      htmlInput: {
                        maxLength: 12,
                        autoComplete: 'off',
                        autoCapitalize: 'characters',
                        style: {
                          fontFamily: fonts.mono,
                          fontSize: 26,
                          fontWeight: 500,
                          letterSpacing: '0.08em',
                          paddingBlock: 12,
                        },
                      },
                    }}
                  />
                  {badgeMessage ? (
                    <FormHelperText error sx={{ fontSize: 14 }}>
                      {badgeMessage}
                    </FormHelperText>
                  ) : null}
                </Grid>

                <Grid size={12}>
                  <TextField label="Remarks" value={draft.notes} onChange={set('notes')} multiline minRows={2} />
                </Grid>

                {termsOn ? (
                  <Grid size={12}>
                    <Box
                      sx={(theme) => ({
                        display: 'grid',
                        gridTemplateColumns: 'auto 1fr',
                        gap: 1,
                        alignItems: 'start',
                        p: 1.5,
                        borderRadius: '10px',
                        border: '1.5px solid',
                        borderColor: err('terms') ? 'error.main' : draft.terms ? theme.vars.palette.gb.ok : 'divider',
                        bgcolor: draft.terms ? 'gb.okSoft' : 'transparent',
                      })}
                    >
                      <Checkbox
                        checked={!!draft.terms}
                        color="success"
                        onChange={(e) => {
                          update({ terms: e.target.checked });
                          if (invalid.has('terms')) setInvalid(new Set([...invalid].filter((f) => f !== 'terms')));
                        }}
                        slotProps={{
                          input: {
                            'aria-describedby': 'ci-termshint',
                            'aria-label': 'Visitor agrees to the terms and conditions',
                          },
                        }}
                        sx={{ p: 0.5 }}
                      />
                      <Box>
                        <Typography component="span" sx={{ fontWeight: 700 }}>
                          Visitor agrees to the{' '}
                        </Typography>
                        <Link
                          component="button"
                          type="button"
                          onClick={() => setTermsOpen(true)}
                          sx={{ fontWeight: 700, verticalAlign: 'baseline' }}
                        >
                          Terms &amp; conditions
                        </Link>
                        <Typography component="span" sx={{ fontWeight: 700 }}>
                          , including confidentiality{' '}
                        </Typography>
                        <Typography component="span" sx={{ color: 'error.main' }}>
                          *
                        </Typography>
                        <Typography id="ci-termshint" variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
                          Show or read the terms to the visitor. Checking in with their photo records their agreement,
                          and the photo is placed on a confidentiality agreement saved as a PDF.
                        </Typography>
                        {err('terms') ? (
                          <Typography variant="body2" sx={{ color: 'error.main', mt: 0.5 }}>
                            The visitor must agree to the terms before check-in.
                          </Typography>
                        ) : null}
                      </Box>
                    </Box>
                    <TermsDialog
                      open={termsOpen}
                      onClose={() => setTermsOpen(false)}
                      onAgree={() => {
                        update({ terms: true });
                        setInvalid(new Set([...invalid].filter((f) => f !== 'terms')));
                        setTermsOpen(false);
                      }}
                    />
                  </Grid>
                ) : null}

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
                      {busy ? 'Saving…' : 'Check in & issue pass'}
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
