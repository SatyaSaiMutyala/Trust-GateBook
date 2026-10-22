import AddIcon from '@mui/icons-material/Add';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import RemoveIcon from '@mui/icons-material/Remove';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import { errorMessage } from '../../api/client';
import { materialApi } from '../../api/endpoints';
import { useUser } from '../../auth/context';
import { canOperate } from '../../auth/roles';
import { useIsDesktop } from '../../hooks';
import { RecipientField } from '../../pages/post/RecipientField';
import { useSettings } from '../../state/context';
import { toLocalDateInput } from '../../utils/format';
import { boxesText } from '../../utils/material';
import { PhotoTile } from '../PhotoTile';
import { PhotoList } from './PhotoList';

const EMPLOYEE_WORDING = {
  picked: 'Gets a notification in TruSentinel',
  typed: 'Pick someone from the list.',
  noMatch: (name) => `No employee named “${name}” is on TruSentinel.`,
  none: 'No employees are on TruSentinel yet. An admin can add them in Settings → Users.',
};
const RETURN_QUICK = [
  ['1 day', 1],
  ['3 days', 3],
  ['1 week', 7],
  ['2 weeks', 14],
  ['1 month', 30],
];

/** Number with − / + buttons. */
function Stepper({ label, value, onChange, error, required }) {
  const n = Number(value) || 0;
  return (
    <Box>
      <Typography
        variant="eyebrow"
        sx={{ color: error ? 'error.main' : 'text.secondary', fontSize: '0.78rem', display: 'block', mb: 0.75 }}
      >
        {label}
        {required ? (
          <Box component="span" sx={{ color: 'error.main' }}>
            {' '}
            *
          </Box>
        ) : null}
      </Typography>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <IconButton
          aria-label="One box less"
          onClick={() => onChange(String(Math.max(0, n - 1)))}
          sx={{ border: 1, borderColor: 'divider' }}
        >
          <RemoveIcon />
        </IconButton>
        <TextField
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
          error={error}
          sx={{ width: 96 }}
          slotProps={{
            htmlInput: {
              inputMode: 'numeric',
              'aria-label': label,
              style: { textAlign: 'center', fontSize: 22, fontWeight: 700 },
            },
          }}
        />
        <IconButton
          aria-label="One box more"
          onClick={() => onChange(String(n + 1))}
          sx={{ border: 1, borderColor: 'divider' }}
        >
          <AddIcon />
        </IconButton>
      </Stack>
    </Box>
  );
}

/** Numbered section heading. */
function Section({ n, title, sub, children }) {
  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', mb: 0.25 }}>
        <Typography sx={{ fontWeight: 700, color: 'text.secondary', minWidth: 18 }}>{n}</Typography>
        <Typography sx={{ fontWeight: 700, fontSize: 17 }}>{title}</Typography>
      </Stack>
      {sub ? (
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.25, ml: 3.25 }}>
          {sub}
        </Typography>
      ) : null}
      <Box sx={{ ml: { md: 3.25 } }}>{children}</Box>
    </Box>
  );
}

/**
 * New material gate pass. `opts`: `direction` ('in' | 'out', fixed), `visitId` (the visitor carrying the boxes),
 * `expected` (a pre-registered delivery / visitor with boxes), `onSaved(pass)`.
 */
export function MaterialForm({ open, opts, onClose, onSaved }) {
  const desktop = useIsDesktop();
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" fullScreen={!desktop}>
      {open ? <Form key={JSON.stringify(opts ?? {})} opts={opts ?? {}} onClose={onClose} onSaved={onSaved} /> : null}
    </Dialog>
  );
}

function Form({ opts, onClose, onSaved }) {
  const user = useUser();
  const gate = canOperate(user);
  const { settings } = useSettings();
  const e = opts.expected ?? null;
  const [direction, setDirection] = useState(opts.direction ?? (gate ? (e ? 'in' : '') : 'out'));
  const [who, setWho] = useState(
    opts.visitId ? 'visitor' : e?.kind === 'delivery' ? 'gate' : gate ? 'visitor' : 'visitor',
  );
  const [visitors, setVisitors] = useState(/** @type {any[] | null} */ (null));
  const [visitId, setVisitId] = useState(opts.visitId ?? '');
  const [carrier, setCarrier] = useState({
    name: '',
    company: e?.kind === 'delivery' ? e.company : '',
    phone: '',
    vehicle: '',
  });
  const [carrierPhoto, setCarrierPhoto] = useState(null);
  const [picker, setPicker] = useState({ name: '', company: '', phone: '' });
  const meet = e ? (e.contact ?? e.host) : null;
  const [employee, setEmployee] = useState(
    /** @type {any} */ (meet ? { id: meet.id, name: meet.name, dept: '', location: '' } : null),
  );
  const [employeeText, setEmployeeText] = useState(meet?.name ?? '');
  const [boxes, setBoxes] = useState('');
  const [challanType, setChallanType] = useState(e?.challanType ?? '');
  const [refNo, setRefNo] = useState(e?.challanNo ?? '');
  const [ewaybill, setEwaybill] = useState('');
  const [challan, setChallan] = useState([]);
  const [more, setMore] = useState(false);
  const [returnable, setReturnable] = useState(false);
  const [returnDate, setReturnDate] = useState('');
  const [purpose, setPurpose] = useState('');
  const [items, setItems] = useState([]);
  const [boxPhotos, setBoxPhotos] = useState([]);
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState(null);
  const [field, setField] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    materialApi
      .visitors(ctrl.signal)
      .then(setVisitors)
      .catch(() => setVisitors([]));
    return () => ctrl.abort();
  }, []);

  const isIn = direction === 'in';
  const pickup = who === 'pickup';
  const chosen = visitors?.find((v) => v.id === visitId) ?? null;
  const challans = isIn ? (settings?.mpChallanIn ?? []) : (settings?.mpChallanOut ?? []);
  const purposes = isIn ? (settings?.mpPurposesIn ?? []) : (settings?.mpPurposesOut ?? []);
  const units = settings?.mpUnits ?? ['Nos'];
  const challanRequired = settings?.mpChallanPhotoRequired !== false;
  const carrierPhotoRequired = settings?.mpCarrierPhotoRequired !== false;
  const n = Number(boxes) || 0;
  const needsApproval = gate && !isIn && !!employee && employee.id !== user.id && settings?.mpApprovalInApp !== false;

  const pickVisitor = (id) => {
    setVisitId(id);
    const v = visitors?.find((x) => x.id === id);
    // A visitor brings boxes for the person they visit.
    if (v?.hostId && gate && !employee) {
      setEmployee({ id: v.hostId, name: v.host, dept: '', location: '' });
      setEmployeeText(v.host);
    }
  };
  const setReturn = (on) => {
    setReturnable(on);
    if (on && !returnDate)
      setReturnDate(toLocalDateInput(new Date(Date.now() + (settings?.mpReturnDays ?? 7) * 86_400_000)));
  };

  const submit = async () => {
    setError(null);
    setField(null);
    const fail = (msg, f) => {
      setError(msg);
      setField(f);
    };
    if (!direction) return fail('Choose material IN or OUT.', 'direction');
    if (n < 1) return fail('Enter the number of boxes', 'boxes');
    if (challanRequired && !challan.length) return fail('Take a photo of the challan', 'challan');
    if (returnable && !returnDate) return fail('Pick the date the boxes should be back', 'returnDate');
    if (gate && !isIn && settings?.mpAuthRequiredOut !== false && !employee)
      return fail('Pick the employee sending the boxes', 'employee');
    if (gate && employeeText.trim() && !employee) return fail('Pick the employee from the list.', 'employee');
    if (who === 'visitor' && !visitId) return fail('Pick the visitor', 'visitId');
    if (who === 'gate' && !carrier.name.trim())
      return fail('Enter the name of the person carrying the boxes', 'carrierName');
    if (who === 'gate' && carrierPhotoRequired && !carrierPhoto)
      return fail('Take a photo of the person carrying the boxes', 'carrier');
    if (pickup && !picker.name.trim()) return fail('Enter who will collect the boxes', 'pickerName');
    setBusy(true);
    try {
      const pass = await materialApi.create(
        {
          direction,
          mode: pickup ? 'pickup' : undefined,
          boxes: n,
          visitId: who === 'visitor' ? visitId : undefined,
          authorisedBy: gate ? employee?.id : undefined,
          challanType,
          refNo: refNo.trim(),
          ewaybill: ewaybill.trim(),
          purpose,
          remarks: remarks.trim(),
          returnable: returnable ? 'true' : undefined,
          returnDue: returnable ? new Date(`${returnDate}T18:00`).toISOString() : undefined,
          items: items.filter((i) => i.desc.trim()).length ? items.filter((i) => i.desc.trim()) : undefined,
          ...(who === 'gate'
            ? {
                carrierName: carrier.name.trim(),
                carrierCompany: carrier.company.trim(),
                carrierPhone: carrier.phone.trim(),
              }
            : {}),
          vehicle: carrier.vehicle.trim(),
          ...(pickup
            ? { pickerName: picker.name.trim(), pickerCompany: picker.company.trim(), pickerPhone: picker.phone.trim() }
            : {}),
          expectedId: e?.code,
        },
        {
          challan: challan.map((p) => p.blob),
          boxPhotos: boxPhotos.map((p) => p.blob),
          carrier: who === 'gate' ? carrierPhoto?.blob : null,
        },
      );
      onSaved(pass);
    } catch (err) {
      setError(errorMessage(err));
      setField(err?.field ?? null);
    } finally {
      setBusy(false);
    }
  };

  const submitLabel = !gate
    ? pickup
      ? 'Save and hand to security'
      : 'Save and tell security'
    : needsApproval
      ? 'Save & ask for approval'
      : isIn
        ? employee
          ? 'Save & ask employee to accept'
          : 'Save · received by security'
        : who === 'visitor'
          ? 'Save · count at exit'
          : 'Save · counted, release now';

  let step = 0;
  const next = () => ++step;
  return (
    <>
      <DialogTitle component="div">
        <Typography variant="overline" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.3 }}>
          {gate ? 'New material gate pass' : 'Send material out'}
        </Typography>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          {direction ? <Chip size="small" variant={isIn ? 'inside' : 'pending'} label={isIn ? 'IN' : 'OUT'} /> : null}
          <Typography variant="h2" component="h2">
            Material {direction ? (isIn ? 'IN' : 'OUT') : ''}
            {n ? ` · ${boxesText(n)}` : ''}
          </Typography>
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={3}>
          {e ? (
            <Alert severity="info">
              <b>{e.kind === 'delivery' ? 'Expected delivery' : 'Expected boxes'}.</b>{' '}
              {e.kind === 'delivery'
                ? `Registered by ${e.createdBy?.name} for ${meet?.name}: ${e.boxes ? boxesText(e.boxes) : 'boxes'}${e.challanType ? `, ${e.challanType} ${e.challanNo}` : ''}. Count the boxes, photograph the person and the challan.`
                : `${e.createdBy?.name} said ${e.name} is bringing ${e.boxes ? boxesText(e.boxes) : 'boxes'} for ${meet?.name}. Count them and photograph the challan.`}
            </Alert>
          ) : null}

          {gate && !opts.direction && !e ? (
            <Section n={next()} title="In or out">
              <Stack direction="row" spacing={1.5}>
                {[
                  ['in', 'Material IN', 'Boxes coming in', <ArrowDownwardIcon key="i" />],
                  ['out', 'Material OUT', 'Boxes going out', <ArrowUpwardIcon key="o" />],
                ].map(([k, t, s, icon]) => (
                  <ButtonBase
                    key={/** @type {string} */ (k)}
                    onClick={() => setDirection(/** @type {string} */ (k))}
                    sx={(theme) => ({
                      flex: 1,
                      p: 1.5,
                      borderRadius: '10px',
                      border: 2,
                      justifyContent: 'flex-start',
                      gap: 1.25,
                      textAlign: 'left',
                      borderColor:
                        direction === k
                          ? k === 'in'
                            ? theme.vars.palette.gb.ok
                            : theme.vars.palette.gb.accent
                          : field === 'direction'
                            ? theme.vars.palette.gb.bad
                            : theme.vars.palette.gb.line,
                      bgcolor: direction === k ? (k === 'in' ? 'gb.okSoft' : 'gb.accentSoft') : 'transparent',
                    })}
                  >
                    {icon}
                    <Box>
                      <Typography sx={{ fontWeight: 700 }}>{t}</Typography>
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        {s}
                      </Typography>
                    </Box>
                  </ButtonBase>
                ))}
              </Stack>
            </Section>
          ) : null}

          {direction ? (
            <>
              <Section
                n={next()}
                title={isIn ? 'Who brought them' : 'Who takes the boxes'}
                sub={
                  pickup
                    ? 'Security keeps the boxes until they are collected.'
                    : 'Their photo is placed on the gate pass.'
                }
              >
                {!opts.visitId ? (
                  <ToggleButtonGroup
                    exclusive
                    size="small"
                    value={who}
                    onChange={(_, v) => v && setWho(v)}
                    sx={{ mb: 1.5, flexWrap: 'wrap' }}
                  >
                    <ToggleButton value="visitor">A visitor inside now</ToggleButton>
                    {gate ? <ToggleButton value="gate">Not a visitor</ToggleButton> : null}
                    {!isIn ? <ToggleButton value="pickup">Leave with security for pickup</ToggleButton> : null}
                  </ToggleButtonGroup>
                ) : null}
                {who === 'visitor' ? (
                  visitors && visitors.length === 0 ? (
                    <Alert severity="warning">
                      No visitors are inside right now.{' '}
                      {gate ? 'Use “Not a visitor”.' : 'Use “Leave with security for pickup”.'}
                    </Alert>
                  ) : (
                    <>
                      <TextField
                        select
                        label="Visitor"
                        value={visitId}
                        onChange={(ev) => pickVisitor(ev.target.value)}
                        error={field === 'visitId'}
                        disabled={!!opts.visitId}
                        slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
                      >
                        <MenuItem value="">
                          <em>Pick a visitor who is inside now</em>
                        </MenuItem>
                        {(visitors ?? []).map((v) => (
                          <MenuItem key={v.id} value={v.id}>
                            {v.name}
                            {v.company ? ` · ${v.company}` : ''}
                            {v.badge ? ` · pass ${v.badge}` : ''}
                            {!gate && v.mine ? ' (your visitor)' : ''}
                          </MenuItem>
                        ))}
                      </TextField>
                      {chosen ? (
                        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.75 }}>
                          Visiting {chosen.host}. Their check-in photo goes on the gate pass.
                        </Typography>
                      ) : null}
                    </>
                  )
                ) : null}
                {who === 'gate' ? (
                  <Grid container spacing={1.5}>
                    <Grid size={{ xs: 12, md: 8 }}>
                      <Grid container spacing={1.5}>
                        <Grid size={12}>
                          <TextField
                            label="Name"
                            required
                            placeholder="Person carrying the boxes"
                            value={carrier.name}
                            onChange={(ev) => setCarrier((c) => ({ ...c, name: ev.target.value }))}
                            error={field === 'carrierName'}
                          />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                          <TextField
                            label="Company"
                            placeholder="e.g. Blue Dart, DTDC, Transasia"
                            value={carrier.company}
                            onChange={(ev) => setCarrier((c) => ({ ...c, company: ev.target.value }))}
                          />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                          <TextField
                            label="Mobile"
                            value={carrier.phone}
                            onChange={(ev) =>
                              setCarrier((c) => ({
                                ...c,
                                phone: ev.target.value.replace(/[^\d+\s]/g, '').slice(0, 14),
                              }))
                            }
                            slotProps={{ htmlInput: { inputMode: 'tel' } }}
                          />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                          <TextField
                            label="Vehicle number"
                            value={carrier.vehicle}
                            onChange={(ev) => setCarrier((c) => ({ ...c, vehicle: ev.target.value.toUpperCase() }))}
                          />
                        </Grid>
                      </Grid>
                    </Grid>
                    <Grid size={{ xs: 6, md: 4 }}>
                      <PhotoTile
                        title="Photo of the person"
                        label="Photo of person"
                        hint="Face, shoulders up"
                        aspect="3 / 4"
                        facing="user"
                        required={carrierPhotoRequired}
                        error={field === 'carrier'}
                        value={carrierPhoto}
                        onChange={setCarrierPhoto}
                        maxEdge={640}
                      />
                    </Grid>
                  </Grid>
                ) : null}
                {pickup ? (
                  <Grid container spacing={1.5}>
                    <Grid size={12}>
                      <TextField
                        label="Who will collect"
                        required
                        placeholder="Name of the person collecting"
                        value={picker.name}
                        onChange={(ev) => setPicker((c) => ({ ...c, name: ev.target.value }))}
                        error={field === 'pickerName'}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        label="Company"
                        placeholder="e.g. Transasia, Kukatpally branch"
                        value={picker.company}
                        onChange={(ev) => setPicker((c) => ({ ...c, company: ev.target.value }))}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        label="Their mobile"
                        value={picker.phone}
                        onChange={(ev) =>
                          setPicker((c) => ({ ...c, phone: ev.target.value.replace(/[^\d+\s]/g, '').slice(0, 14) }))
                        }
                      />
                    </Grid>
                    <Grid size={12}>
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        Hand the boxes to security. Security counts them and keeps them at the gate, then photographs
                        the person who collects them and counts again before handing over.
                      </Typography>
                    </Grid>
                  </Grid>
                ) : null}
              </Section>

              {gate ? (
                <Section
                  n={next()}
                  title={isIn ? 'For (employee receiving them)' : 'Sent by (employee)'}
                  sub={
                    isIn
                      ? 'They get a notification and tap Received when they have the boxes.'
                      : 'The employee giving these boxes.'
                  }
                >
                  <RecipientField
                    wording={{ ...EMPLOYEE_WORDING, label: isIn ? 'Employee receiving them' : 'Employee sending them' }}
                    recipient={employee}
                    text={employeeText}
                    onText={(t) => {
                      setEmployeeText(t);
                      if (employee && t !== employee.name) setEmployee(null);
                    }}
                    onPick={(h) => {
                      setEmployee(h);
                      setEmployeeText(h?.name ?? '');
                    }}
                    error={field === 'employee' || field === 'authorisedBy'}
                  />
                  <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.75 }}>
                    {isIn
                      ? employee
                        ? `${employee.name} will be asked to accept ${n ? boxesText(n) : 'the boxes'}. The pass closes when they do.`
                        : 'Without an employee, security receives the boxes.'
                      : employee
                        ? needsApproval
                          ? `${employee.name} gets an Approve / Reject request. Release only after approval.`
                          : `${employee.name} sends these boxes.`
                        : 'Pick the employee sending the boxes.'}
                  </Typography>
                </Section>
              ) : null}

              <Section
                n={next()}
                title="Boxes and challan"
                sub="The photo of the challan records what is in the boxes."
              >
                <Stack spacing={2}>
                  <Stepper
                    label="Number of boxes"
                    required
                    value={boxes}
                    onChange={setBoxes}
                    error={field === 'boxes'}
                  />
                  {challans.length ? (
                    <Box>
                      <Typography
                        variant="eyebrow"
                        sx={{ color: 'text.secondary', fontSize: '0.78rem', display: 'block', mb: 0.75 }}
                      >
                        Challan
                      </Typography>
                      <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
                        {challans.map((c) => (
                          <Chip
                            key={c}
                            label={c}
                            clickable
                            variant={challanType === c ? 'filled' : 'outlined'}
                            color={challanType === c ? 'secondary' : 'default'}
                            onClick={() => setChallanType(challanType === c ? '' : c)}
                          />
                        ))}
                      </Stack>
                    </Box>
                  ) : null}
                  <Grid container spacing={1.5}>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        label="Challan number"
                        placeholder="e.g. TC-2210, DC-5521"
                        value={refNo}
                        onChange={(ev) => setRefNo(ev.target.value.toUpperCase())}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        label="E-way bill number"
                        placeholder="If there is one"
                        value={ewaybill}
                        onChange={(ev) => setEwaybill(ev.target.value.slice(0, 14))}
                      />
                    </Grid>
                  </Grid>
                  <PhotoList
                    title="Photo of the challan"
                    label="Photo of challan"
                    hint="Make sure the details are readable."
                    value={challan}
                    onChange={setChallan}
                    max={4}
                    required={challanRequired}
                    error={field === 'challan'}
                  />
                </Stack>
              </Section>

              <Box>
                <Button onClick={() => setMore((m) => !m)}>
                  {more ? 'Hide' : 'More'}: returnable, purpose, item details, photos of the boxes, remarks
                </Button>
                <Collapse in={more || returnable || field === 'returnDate'}>
                  <Stack spacing={2} sx={{ mt: 1.5 }}>
                    <Box>
                      <FormControlLabel
                        control={<Checkbox checked={returnable} onChange={(ev) => setReturn(ev.target.checked)} />}
                        label={<Typography sx={{ fontWeight: 700 }}>Returnable</Typography>}
                      />
                      <Typography variant="body2" sx={{ color: 'text.secondary', ml: 4, mt: -0.75 }}>
                        {isIn
                          ? 'The boxes will be taken back out (vendor tools, demo kit)'
                          : 'The boxes will come back (repair, demo, branch loan)'}
                      </Typography>
                    </Box>
                    {returnable ? (
                      <Box>
                        <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', mb: 1 }}>
                          {RETURN_QUICK.map(([l, d]) => (
                            <Chip
                              key={l}
                              label={l}
                              clickable
                              variant="outlined"
                              onClick={() =>
                                setReturnDate(toLocalDateInput(new Date(Date.now() + Number(d) * 86_400_000)))
                              }
                            />
                          ))}
                        </Stack>
                        <TextField
                          type="date"
                          label={isIn ? 'To go back out by' : 'Expected back by'}
                          required
                          value={returnDate}
                          onChange={(ev) => setReturnDate(ev.target.value)}
                          error={field === 'returnDate'}
                          sx={{ maxWidth: 240 }}
                          slotProps={{ inputLabel: { shrink: true } }}
                        />
                      </Box>
                    ) : null}
                    {purposes.length ? (
                      <Box>
                        <Typography
                          variant="eyebrow"
                          sx={{ color: 'text.secondary', fontSize: '0.78rem', display: 'block', mb: 0.75 }}
                        >
                          Purpose
                        </Typography>
                        <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
                          {purposes.map((p) => (
                            <Chip
                              key={p}
                              label={p}
                              clickable
                              variant={purpose === p ? 'filled' : 'outlined'}
                              color={purpose === p ? 'secondary' : 'default'}
                              onClick={() => setPurpose(purpose === p ? '' : p)}
                            />
                          ))}
                        </Stack>
                      </Box>
                    ) : null}
                    <Box>
                      <Typography
                        variant="eyebrow"
                        sx={{ color: 'text.secondary', fontSize: '0.78rem', display: 'block', mb: 0.75 }}
                      >
                        Item details (optional)
                      </Typography>
                      <Stack spacing={1}>
                        {items.map((it, i) => (
                          <Stack key={i} direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                            <TextField
                              size="small"
                              placeholder="Item (optional)"
                              value={it.desc}
                              onChange={(ev) =>
                                setItems((l) => l.map((x, j) => (j === i ? { ...x, desc: ev.target.value } : x)))
                              }
                            />
                            <TextField
                              size="small"
                              type="number"
                              value={it.qty}
                              onChange={(ev) =>
                                setItems((l) => l.map((x, j) => (j === i ? { ...x, qty: ev.target.value } : x)))
                              }
                              sx={{ width: { sm: 90 } }}
                              slotProps={{ htmlInput: { min: 0, step: 'any', 'aria-label': 'Quantity' } }}
                            />
                            <TextField
                              size="small"
                              select
                              value={it.unit}
                              onChange={(ev) =>
                                setItems((l) => l.map((x, j) => (j === i ? { ...x, unit: ev.target.value } : x)))
                              }
                              sx={{ width: { sm: 120 } }}
                              slotProps={{ htmlInput: { 'aria-label': 'Unit' } }}
                            >
                              {units.map((u) => (
                                <MenuItem key={u} value={u}>
                                  {u}
                                </MenuItem>
                              ))}
                            </TextField>
                            <TextField
                              size="small"
                              placeholder="Serial / asset no."
                              value={it.serial}
                              onChange={(ev) =>
                                setItems((l) => l.map((x, j) => (j === i ? { ...x, serial: ev.target.value } : x)))
                              }
                            />
                            <IconButton
                              aria-label={`Remove line ${i + 1}`}
                              onClick={() => setItems((l) => l.filter((_, j) => j !== i))}
                            >
                              <DeleteOutlineOutlinedIcon />
                            </IconButton>
                          </Stack>
                        ))}
                        <Button
                          startIcon={<AddIcon />}
                          sx={{ alignSelf: 'flex-start' }}
                          onClick={() =>
                            setItems((l) => [...l, { desc: '', qty: '1', unit: units[0] ?? 'Nos', serial: '' }])
                          }
                        >
                          Add a line
                        </Button>
                      </Stack>
                    </Box>
                    <PhotoList
                      title="Photos of the boxes"
                      label="Photo of boxes"
                      value={boxPhotos}
                      onChange={setBoxPhotos}
                      max={6}
                      maxEdge={1100}
                    />
                    <TextField
                      label="Remarks"
                      placeholder="e.g. Sealed, 2 boxes damaged at a corner"
                      value={remarks}
                      onChange={(ev) => setRemarks(ev.target.value)}
                      multiline
                      minRows={2}
                    />
                  </Stack>
                </Collapse>
              </Box>
            </>
          ) : null}
          {error ? <Alert severity="error">{error}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between', px: 3, py: 1.5, flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {n ? boxesText(n) : 'How many boxes?'}
          {challanType ? ` · ${challanType}` : ''} ·{' '}
          {challan.length
            ? `${challan.length} challan photo${challan.length === 1 ? '' : 's'}`
            : 'no challan photo yet'}
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="contained" color="primary" onClick={submit} disabled={busy || !direction}>
            {busy ? 'Saving…' : submitLabel}
          </Button>
        </Stack>
      </DialogActions>
    </>
  );
}
