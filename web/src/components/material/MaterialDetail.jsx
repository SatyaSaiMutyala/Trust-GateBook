import CloseIcon from '@mui/icons-material/Close';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import Drawer from '@mui/material/Drawer';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { useUser } from '../../auth/context';
import { canOperate, isGateUser } from '../../auth/roles';
import { useIsDesktop } from '../../hooks';
import { useMaterialUi } from '../../state/context';
import { fonts } from '../../theme/tokens';
import { fmtDate, fmtDateTime } from '../../utils/format';
import {
  boxesText,
  carrierName,
  mayCancel,
  mpState,
  MP_OPEN,
  outstandingText,
  TONE_VARIANT,
} from '../../utils/material';
import { FieldLabel, TimelineItem, VisitorThumb } from '../bits';
import { ImagePreview } from '../ImagePreview';

/** What happens next, with the buttons for whoever has to act. */
export function MaterialActions({ pass: p, size = 'small' }) {
  const user = useUser();
  const { act, remind } = useMaterialUi();
  const gate = canOperate(user);
  const mine = p.authorisedBy?.id === user.id;
  const b = (label, kind, props = {}) => (
    <Button key={kind} size={size} onClick={() => act(kind, p)} {...props}>
      {label}
    </Button>
  );
  const out = [];
  if (p.status === 'awaiting_receipt' && mine) {
    out.push(
      b('Not received', 'receipt-no', { color: 'error' }),
      b('Received', 'receipt-yes', { variant: 'contained', color: 'success' }),
    );
  }
  if (p.status === 'awaiting_approval' && mine) {
    out.push(
      b('Reject', 'reject', { color: 'error' }),
      b('Approve', 'approve', { variant: 'contained', color: 'success' }),
    );
  }
  if (gate) {
    if (p.status === 'ready') out.push(b('Count & release', 'release', { variant: 'contained', color: 'primary' }));
    if (p.status === 'ready_for_pickup')
      out.push(b('Hand over', 'release', { variant: 'contained', color: 'primary' }));
    if (p.status === 'awaiting_drop') out.push(b('Boxes handed in', 'drop', { variant: 'outlined' }));
    if (p.status === 'disputed') out.push(b('Mark received', 'receipt-sec', { variant: 'outlined' }));
    if (p.status === 'awaiting_receipt' && !mine) {
      out.push(
        <Button key="remind" size={size} onClick={() => remind(p)}>
          Remind
        </Button>,
        b('Received on paper', 'receipt-sec', { variant: 'outlined' }),
      );
    }
    if (MP_OPEN.includes(p.status))
      out.push(
        b(p.direction === 'out' ? 'Record boxes back' : 'Record boxes going out', 'return', { variant: 'outlined' }),
      );
  }
  return out.length ? (
    <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
      {out}
    </Stack>
  ) : null;
}

/** The next step in words. */
function nextStep(p, user) {
  const gate = canOperate(user);
  const mine = p.authorisedBy?.id === user.id;
  const name = p.authorisedBy?.name ?? 'the employee';
  const who = carrierName(p);
  switch (p.status) {
    case 'awaiting_receipt':
      return mine
        ? [
            `${boxesText(p.boxes)} brought in for you`,
            `${who}${p.carrier?.company ? ` (${p.carrier.company})` : ''} brought them. Tap Received once you have them.`,
            'warning',
          ]
        : [
            `Waiting for ${name} to accept`,
            'They have been notified. If they confirmed on paper instead, record it here.',
            'warning',
          ];
    case 'disputed':
      return [`${name} says they have not received it`, p.receiptNote, 'error'];
    case 'awaiting_approval':
      return mine
        ? ['Your approval is needed', `${boxesText(p.boxes)} going out with ${who}.`, 'warning']
        : [
            `Waiting for ${name} to approve`,
            gate ? 'Do not release the boxes yet.' : 'They have been asked to approve.',
            'warning',
          ];
    case 'ready':
      return [
        p.mode === 'visitor'
          ? `Count ${boxesText(p.boxes)} when ${who} leaves`
          : `Count ${boxesText(p.boxes)} and release`,
        gate
          ? 'Check the count against the pass before they leave. The exit screen asks for it too.'
          : 'Security counts the boxes at the gate before the visitor leaves.',
        'info',
      ];
    case 'awaiting_drop':
      return [
        `Waiting for ${boxesText(p.boxes)} from ${name}`,
        gate ? 'Count them when they are handed in.' : 'Hand the boxes to security at the gate.',
        'warning',
      ];
    case 'ready_for_pickup':
      return [
        `${boxesText(p.boxes)} at the gate for ${p.pickerName || 'pickup'}`,
        gate
          ? 'When they come, photograph them and count the boxes before handing over.'
          : 'Security will hand them over and photograph the person collecting.',
        'info',
      ];
    case 'rejected':
      return ['Rejected: do not release', p.approvalNote, 'error'];
    default:
      if (MP_OPEN.includes(p.status)) {
        const when = p.returnDue ? fmtDate(p.returnDue) : '';
        return [
          p.overdue
            ? `Overdue since ${when}`
            : p.direction === 'out'
              ? `Expected back by ${when}`
              : `To go back out by ${when}`,
          `Still ${p.direction === 'out' ? 'out' : 'here'}: ${outstandingText(p)}.`,
          p.overdue ? 'error' : 'info',
        ];
      }
      return null;
  }
}

function Mono({ children }) {
  return (
    <Box component="span" sx={{ fontFamily: fonts.mono, fontSize: '0.92em' }}>
      {children}
    </Box>
  );
}

/** Timeline: made → counted / accepted (IN) or approved → handed in → released (OUT) → returns → cancelled. */
function Steps({ pass: p }) {
  const isIn = p.direction === 'in';
  const rows = [
    [
      'in',
      <>
        <b>Pass made</b> <Mono>{fmtDateTime(p.createdAt)}</Mono> · by{' '}
        {(p.requestedBy ?? p.createdBy)?.name ?? 'security'}
        {p.expectedId ? ` · registered in advance (${p.expectedId})` : ''}
      </>,
    ],
  ];
  if (isIn) {
    if (p.checkedAt)
      rows.push([
        'in',
        <>
          <b>Counted at gate</b> <Mono>{fmtDateTime(p.checkedAt)}</Mono> · {p.checkedBoxes} of {boxesText(p.boxes)} ·{' '}
          {p.checkedBy?.name}
        </>,
      ]);
    if (p.authorisedBy) {
      if (p.receivedAt)
        rows.push([
          'in',
          <>
            <b>Accepted by employee</b> <Mono>{fmtDateTime(p.receivedAt)}</Mono>
            {p.receiptVia === 'security' ? ' (on paper)' : ''}
            {p.receiptNote ? ` · “${p.receiptNote}”` : ''}
          </>,
        ]);
      else if (p.status === 'disputed')
        rows.push([
          'bad',
          <>
            <b>Not received</b> · “{p.receiptNote}”
          </>,
        ]);
      else if (p.status === 'awaiting_receipt')
        rows.push([
          'pending',
          <>
            <b>Waiting for {p.authorisedBy.name}</b>
          </>,
        ]);
    }
  } else {
    if (p.approvedAt)
      rows.push([
        p.status === 'rejected' ? 'bad' : 'in',
        <>
          <b>{p.status === 'rejected' ? 'Rejected' : 'Approved'}</b> <Mono>{fmtDateTime(p.approvedAt)}</Mono> ·{' '}
          {p.approvedBy?.name}
          {p.approvalNote ? ` · “${p.approvalNote}”` : ''}
        </>,
      ]);
    else if (p.status === 'awaiting_approval')
      rows.push([
        'pending',
        <>
          <b>Waiting for {p.authorisedBy?.name} to approve</b>
        </>,
      ]);
    if (p.mode === 'pickup') {
      if (p.droppedAt)
        rows.push([
          'in',
          <>
            <b>Handed in at gate</b> <Mono>{fmtDateTime(p.droppedAt)}</Mono> · {boxesText(p.droppedBoxes ?? p.boxes)} ·{' '}
            {p.droppedBy?.name}
          </>,
        ]);
      else if (p.status === 'awaiting_drop')
        rows.push([
          'pending',
          <>
            <b>Waiting for the boxes</b>
          </>,
        ]);
    }
    if (p.releasedAt)
      rows.push([
        'out',
        <>
          <b>{p.mode === 'pickup' ? 'Collected' : 'Counted & released'}</b> <Mono>{fmtDateTime(p.releasedAt)}</Mono> ·{' '}
          {p.checkedBoxes} of {boxesText(p.boxes)} · {p.releasedBy?.name}
        </>,
      ]);
    else if (p.status === 'ready')
      rows.push([
        'pending',
        <>
          <b>{p.mode === 'visitor' ? 'Count when the visitor leaves' : 'Count and release'}</b>
        </>,
      ]);
  }
  for (const r of p.returns) {
    rows.push([
      'in',
      <>
        <b>{isIn ? 'Taken back out' : 'Back in'}</b> <Mono>{fmtDateTime(r.at)}</Mono> ·{' '}
        {r.lines
          .map((l) => `${l.qty} ${p.items[l.i]?.unit === 'Box' ? (l.qty === 1 ? 'box' : 'boxes') : p.items[l.i]?.desc}`)
          .join(', ')}{' '}
        · {r.by?.name}
        {r.note ? ` · ${r.note}` : ''}
      </>,
    ]);
  }
  if (MP_OPEN.includes(p.status))
    rows.push([
      p.overdue ? 'bad' : 'pending',
      <>
        <b>{p.direction === 'out' ? 'To come back' : 'To go back out'}</b> by {p.returnDue ? fmtDate(p.returnDue) : '—'}
      </>,
    ]);
  if (p.cancelledAt)
    rows.push([
      'bad',
      <>
        <b>Cancelled</b> <Mono>{fmtDateTime(p.cancelledAt)}</Mono> · {p.cancelledBy?.name}
      </>,
    ]);
  return (
    <Stack>
      {rows.map(([kind, content], i) => (
        <TimelineItem key={i} kind={kind} last={i === rows.length - 1}>
          {content}
        </TimelineItem>
      ))}
    </Stack>
  );
}

/** Pass details: drawer on desktop, full screen on phone. */
export function MaterialDetail({ pass, open, onClose }) {
  const desktop = useIsDesktop();
  const body = pass ? <Details pass={pass} onClose={onClose} /> : null;
  return desktop ? (
    <Drawer
      anchor="right"
      open={open && !!pass}
      onClose={onClose}
      slotProps={{ paper: { sx: { width: 560, maxWidth: '100vw', bgcolor: 'background.default' } } }}
    >
      {body}
    </Drawer>
  ) : (
    <Dialog
      fullScreen
      open={open && !!pass}
      onClose={onClose}
      slotProps={{ paper: { sx: { bgcolor: 'background.default', borderRadius: 0 } } }}
    >
      {body}
    </Dialog>
  );
}

function Details({ pass: p, onClose }) {
  const user = useUser();
  const { cancel, openPdf } = useMaterialUi();
  const [preview, setPreview] = useState(null);
  const isIn = p.direction === 'in';
  const state = mpState(p);
  const next = nextStep(p, user);
  const images = [
    ...(p.carrier?.photoUrl ? [{ src: p.carrier.photoUrl, label: carrierName(p) }] : []),
    ...p.challanPhotoUrls.map((src, i) => ({ src, label: `${p.challanType || 'Challan'} ${i + 1}` })),
    ...p.photoUrls.map((src, i) => ({ src, label: `Boxes ${i + 1}` })),
  ];
  const openImage = (src) => setPreview(images.findIndex((x) => x.src === src));
  const grid = [
    ['Gate', p.site],
    [
      'Type',
      `${p.returnable ? 'Returnable' : 'Non-returnable'}${p.returnDue ? `, back by ${fmtDate(p.returnDue)}` : ''}`,
    ],
    ['Purpose', p.purpose],
    ['Vehicle', p.carrier?.vehicle],
    ['Boxes counted', p.checkedBoxes != null ? `${p.checkedBoxes} of ${p.boxes}` : ''],
    ['Recorded by', p.createdBy?.name],
    ['Remarks', p.remarks],
  ].filter(([, v]) => v);
  return (
    <Stack sx={{ minHeight: '100%' }}>
      <Box sx={{ p: { xs: 2, md: 3 }, pb: 2, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
          <Box>
            <Typography variant="eyebrow" sx={{ color: 'text.secondary' }}>
              Material gate pass
            </Typography>
            <Typography variant="h2">
              {isIn ? 'IN' : 'OUT'} · {boxesText(p.boxes)}
            </Typography>
            <Typography variant="mono" sx={{ color: 'text.secondary' }}>
              {p.id}
            </Typography>
            <Stack direction="row" sx={{ gap: 1, mt: 1, flexWrap: 'wrap' }}>
              <Chip size="small" variant={TONE_VARIANT[state.tone]} label={state.label} />
              {p.mode === 'pickup' ? <Chip size="small" variant="exited" label="Pickup at gate" /> : null}
            </Stack>
          </Box>
          <IconButton onClick={onClose} aria-label="Close" sx={{ border: 1, borderColor: 'divider' }}>
            <CloseIcon />
          </IconButton>
        </Stack>
      </Box>
      <Stack spacing={2.5} sx={{ p: { xs: 2, md: 3 }, flex: 1 }}>
        {next ? (
          <Alert
            severity={/** @type {any} */ (next[2])}
            action={<MaterialActions pass={p} />}
            sx={{ alignItems: 'center', '& .MuiAlert-action': { pt: 0 } }}
          >
            <b>{next[0]}</b>
            {next[1] ? <Box>{next[1]}</Box> : null}
          </Alert>
        ) : (
          <MaterialActions pass={p} />
        )}
        <Steps pass={p} />
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <FieldLabel>
              {isIn ? 'Brought in by' : p.mode === 'pickup' && !p.releasedAt ? 'To be collected by' : 'Taken out by'}
            </FieldLabel>
            <Stack direction="row" spacing={1.25} sx={{ mt: 0.75, alignItems: 'center' }}>
              <Box
                onClick={() => p.carrier?.photoUrl && openImage(p.carrier.photoUrl)}
                sx={{ cursor: p.carrier?.photoUrl ? 'zoom-in' : 'default' }}
              >
                <VisitorThumb src={p.carrier?.photoUrl} name={carrierName(p)} size={56} />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontWeight: 600 }}>{carrierName(p)}</Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {[p.carrier?.company || p.pickerCompany, p.carrier?.phone || p.pickerPhone]
                    .filter(Boolean)
                    .join(' · ')}
                </Typography>
                {p.carrier?.visitBadge ? (
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    Visitor pass {p.carrier.visitBadge}
                  </Typography>
                ) : null}
              </Box>
            </Stack>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <FieldLabel>{isIn ? 'For' : 'Sent by'}</FieldLabel>
            <Typography sx={{ fontWeight: 600, mt: 0.75 }}>{p.authorisedBy?.name ?? 'Security'}</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {isIn
                ? p.receivedAt
                  ? `accepted ${fmtDateTime(p.receivedAt)}${p.receiptVia === 'security' ? ' (on paper)' : ''}`
                  : p.status === 'disputed'
                    ? 'says not received'
                    : p.authorisedBy
                      ? 'not yet accepted'
                      : 'received by security'
                : p.requestedBy
                  ? `prepared ${fmtDateTime(p.createdAt)}`
                  : p.approvedAt
                    ? `approved ${fmtDateTime(p.approvedAt)}`
                    : 'authorised'}
            </Typography>
          </Grid>
        </Grid>
        <Box>
          <FieldLabel>{[p.challanType || 'Challan', p.refNo].filter(Boolean).join(' ')}</FieldLabel>
          {p.ewaybill ? <Typography variant="body2">E-way bill {p.ewaybill}</Typography> : null}
          {p.challanPhotoUrls.length ? (
            <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', mt: 0.75 }}>
              {p.challanPhotoUrls.map((src) => (
                <Box
                  key={src}
                  component="img"
                  src={src}
                  alt="Challan"
                  onClick={() => openImage(src)}
                  sx={{
                    width: 120,
                    height: 120,
                    objectFit: 'cover',
                    borderRadius: 1,
                    border: 1,
                    borderColor: 'divider',
                    cursor: 'zoom-in',
                  }}
                />
              ))}
            </Stack>
          ) : (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              No challan photo.
            </Typography>
          )}
        </Box>
        {p.items.length > 1 ? (
          <Box>
            <FieldLabel>Item details</FieldLabel>
            {p.items.slice(1).map((it, i) => (
              <Typography key={i} variant="body2">
                {it.desc} — {it.qty} {it.unit}
                {it.serial ? ` · serial ${it.serial}` : ''}
                {p.returnable ? ` · ${it.outstanding} outstanding` : ''}
              </Typography>
            ))}
          </Box>
        ) : null}
        {p.photoUrls.length ? (
          <Box>
            <FieldLabel>Photos of the boxes</FieldLabel>
            <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', mt: 0.75 }}>
              {p.photoUrls.map((src) => (
                <Box
                  key={src}
                  component="img"
                  src={src}
                  alt="Boxes"
                  onClick={() => openImage(src)}
                  sx={{
                    width: 96,
                    height: 96,
                    objectFit: 'cover',
                    borderRadius: 1,
                    border: 1,
                    borderColor: 'divider',
                    cursor: 'zoom-in',
                  }}
                />
              ))}
            </Stack>
          </Box>
        ) : null}
        <Grid
          container
          spacing={2}
          sx={{ bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: '10px', p: 2, m: 0 }}
        >
          {grid.map(([label, value]) => (
            <Grid key={label} size={6} sx={{ minWidth: 0 }}>
              <FieldLabel>{label}</FieldLabel>
              <Typography sx={{ fontWeight: 500, wordBreak: 'break-word' }}>{value}</Typography>
            </Grid>
          ))}
        </Grid>
      </Stack>
      <Stack
        direction="row"
        spacing={1.25}
        sx={{
          p: { xs: 2, md: 3 },
          pt: 2,
          borderTop: 1,
          borderColor: 'divider',
          position: 'sticky',
          bottom: 0,
          bgcolor: 'background.default',
        }}
      >
        {mayCancel(p, user) ? (
          <Button color="error" onClick={() => cancel(p)}>
            Cancel pass
          </Button>
        ) : null}
        <Box sx={{ flex: 1 }} />
        {isGateUser(user) || p.authorisedBy?.id === user.id || p.requestedBy?.id === user.id ? (
          <Button variant="outlined" startIcon={<PictureAsPdfOutlinedIcon />} onClick={() => openPdf(p)}>
            Gate pass PDF
          </Button>
        ) : null}
      </Stack>
      {preview !== null && preview >= 0 ? (
        <ImagePreview open index={preview} onClose={() => setPreview(null)} images={images} />
      ) : null}
    </Stack>
  );
}
