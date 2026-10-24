import React, { useLayoutEffect, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import { ScaledSheet, moderateScale } from 'react-native-size-matters/extend';
import { fileUrl } from '../api/config';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Field } from '../components/Field';
import { HostStageChip } from '../components/HostStageChip';
import { ImagePreview } from '../components/ImagePreview';
import { Banner } from '../components/Layout';
import { ListError } from '../components/ListFooter';
import { PhotoTile } from '../components/PhotoTile';
import { SelectField } from '../components/SelectField';
import { Sheet } from '../components/Sheet';
import { Thumb } from '../components/Thumb';
import { CHIP_TONE } from '../components/material/MaterialCard';
import {
  errorMessage,
  useGetMaterialQuery,
  useMaterialActionMutation,
  useMaterialUploadMutation,
  useMaterialVisitorsQuery,
} from '../store/api';
import { selectCanCheckIn, selectUser } from '../store/authSlice';
import { useSettings, useToast } from '../store/hooks';
import { fonts, radius, typo, useTheme } from '../theme';
import { captureImage } from '../utils/camera';
import { fmtDateTime, fmtShortDate } from '../utils/format';
import {
  boxesText,
  carrierName,
  mayCancel,
  mpState,
  MP_OPEN,
  outstandingText,
} from '../utils/material';
import { CrossIcon } from '../components/Glyphs';
import { SurfaceStatusBar } from '../components/SurfaceStatusBar';

/** The next step in words: [title, sub, tone]. */
function nextStep(p, user, gate) {
  const mine = p.authorisedBy?.id === user?.id;
  const name = p.authorisedBy?.name ?? 'the employee';
  const who = carrierName(p);
  switch (p.status) {
    case 'awaiting_receipt':
      return mine
        ? [
            `${boxesText(p.boxes)} brought in for you`,
            `${who} brought them. Tap Received once you have them.`,
            'warn',
          ]
        : [
            `Waiting for ${name} to accept`,
            'They have been notified. If they confirmed on paper instead, record it here.',
            'warn',
          ];
    case 'disputed':
      return [`${name} says they have not received it`, p.receiptNote, 'bad'];
    case 'awaiting_approval':
      return mine
        ? [
            'Your approval is needed',
            `${boxesText(p.boxes)} going out with ${who}.`,
            'warn',
          ]
        : [
            `Waiting for ${name} to approve`,
            gate
              ? 'Do not release the boxes yet.'
              : 'They have been asked to approve.',
            'warn',
          ];
    case 'ready':
      return [
        p.mode === 'visitor'
          ? `Count ${boxesText(p.boxes)} when ${who} leaves`
          : `Count ${boxesText(p.boxes)} and release`,
        gate
          ? 'Check the count against the pass before they leave.'
          : 'Security counts the boxes at the gate before the visitor leaves.',
        'accent',
      ];
    case 'awaiting_drop':
      return [
        `Waiting for ${boxesText(p.boxes)} from ${name}`,
        gate
          ? 'Count them when they are handed in.'
          : 'Hand the boxes to security at the gate.',
        'warn',
      ];
    case 'ready_for_pickup':
      return [
        `${boxesText(p.boxes)} at the gate for ${p.pickerName || 'pickup'}`,
        gate
          ? 'Photograph the person collecting and count before handing over.'
          : 'Security will hand them over.',
        'accent',
      ];
    case 'rejected':
      return ['Rejected: do not release', p.approvalNote, 'bad'];
    default:
      if (MP_OPEN.includes(p.status)) {
        const when = p.returnDue ? fmtShortDate(p.returnDue) : '';
        return [
          p.overdue
            ? `Overdue since ${when}`
            : p.direction === 'out'
            ? `Expected back by ${when}`
            : `To go back out by ${when}`,
          `Still ${p.direction === 'out' ? 'out' : 'here'}: ${outstandingText(
            p,
          )}.`,
          p.overdue ? 'bad' : 'accent',
        ];
      }
      return null;
  }
}

/** The action buttons for whoever has to act. */
function actionsFor(p, user, gate) {
  const mine = p.authorisedBy?.id === user?.id;
  const a = [];
  if (p.status === 'awaiting_receipt' && mine)
    a.push(
      ['Not received', 'receipt-no', 'danger'],
      ['Received', 'receipt-yes', 'ok'],
    );
  if (p.status === 'awaiting_approval' && mine)
    a.push(['Reject', 'reject', 'danger'], ['Approve', 'approve', 'ok']);
  if (gate) {
    if (p.status === 'ready') a.push(['Count & release', 'release', 'primary']);
    if (p.status === 'ready_for_pickup')
      a.push(['Hand over', 'release', 'primary']);
    if (p.status === 'awaiting_drop')
      a.push(['Boxes handed in', 'drop', 'primary']);
    if (p.status === 'disputed')
      a.push(['Mark received', 'receipt-sec', 'ghost']);
    if (p.status === 'awaiting_receipt' && !mine)
      a.push(
        ['Remind', 'remind', 'ghost'],
        ['Received on paper', 'receipt-sec', 'ghost'],
      );
    if (MP_OPEN.includes(p.status))
      a.push([
        p.direction === 'out' ? 'Record boxes back' : 'Record boxes going out',
        'return',
        'primary',
      ]);
  }
  return a;
}

/** The sheet for one action. */
function ActionSheet({ kind, pass: p, onClose }) {
  const { c } = useTheme();
  const toast = useToast();
  const settings = useSettings();
  const [act, actState] = useMaterialActionMutation();
  const [upload, upState] = useMaterialUploadMutation();
  const busy = actState.isLoading || upState.isLoading;
  const [note, setNote] = useState('');
  const [count, setCount] = useState('');
  const [vehicle, setVehicle] = useState(p.carrier?.vehicle ?? '');
  const [pickerVisitId, setPickerVisitId] = useState('');
  const [pickerName, setPickerName] = useState(p.pickerName ?? '');
  const [pickerPhone, setPickerPhone] = useState(p.pickerPhone ?? '');
  const [photo, setPhoto] = useState(null);
  const lines = p.items
    .map((it, i) => ({ ...it, i }))
    .filter(it => it.outstanding > 0);
  const [qty, setQty] = useState(() =>
    Object.fromEntries(lines.map(l => [l.i, String(l.outstanding)])),
  );
  const [error, setError] = useState(null);
  const pickup = kind === 'release' && p.status === 'ready_for_pickup';
  const { data: visitors = [] } = useMaterialVisitorsQuery(undefined, {
    skip: !pickup,
  });

  const done = text => {
    if (text) toast.show(text);
    onClose();
  };
  const run = async (fn, text) => {
    setError(null);
    try {
      const pass = await fn();
      done(typeof text === 'function' ? text(pass) : text);
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const take = async () => {
    try {
      const uri = await captureImage(kind === 'return' ? 'boxes' : 'person');
      if (uri) setPhoto(uri);
    } catch (e) {
      toast.show(errorMessage(e), 'error');
    }
  };

  let title = '';
  let body = null;
  let action = null;
  if (kind === 'approve' || kind === 'reject') {
    const approve = kind === 'approve';
    title = approve ? 'Approve this gate pass?' : 'Reject this gate pass?';
    body = (
      <>
        <Text style={[typo.body, { color: c.ink }]}>
          {boxesText(p.boxes)} going out with {carrierName(p)}.
        </Text>
        <Field
          label={approve ? 'Note for security (optional)' : 'Reason (optional)'}
          value={note}
          onChangeText={setNote}
          multiline
        />
      </>
    );
    action = [
      approve ? 'Approve' : 'Reject',
      approve ? 'ok' : 'destructive',
      () =>
        run(
          () =>
            act({
              id: p.id,
              action: 'decision',
              body: { approve, note: note.trim() },
            }).unwrap(),
          approve ? 'Approved' : 'Rejected. Security has been told.',
        ),
    ];
  } else if (kind.startsWith('receipt')) {
    const k = kind.slice(8);
    title =
      k === 'sec'
        ? `Record that ${p.authorisedBy?.name ?? 'the employee'} received it`
        : k === 'yes'
        ? `I received ${boxesText(p.boxes)}`
        : 'I have not received it';
    body = (
      <>
        {p.challanPhotoUrls?.[0] ? (
          <Image
            source={{ uri: fileUrl(p.challanPhotoUrls[0]) }}
            style={styles.challan}
            resizeMode="contain"
          />
        ) : null}
        <Field
          label={
            k === 'sec'
              ? 'How was it confirmed?'
              : k === 'yes'
              ? 'Note (optional)'
              : 'What is wrong?'
          }
          required={k === 'sec'}
          placeholder={
            k === 'sec'
              ? 'e.g. Signed on the challan copy'
              : k === 'yes'
              ? 'e.g. 2 boxes slightly damaged'
              : 'e.g. Only 3 boxes reached me'
          }
          value={note}
          onChangeText={setNote}
          multiline
        />
      </>
    );
    action = [
      k === 'no' ? 'Tell security' : 'Confirm received',
      k === 'no' ? 'destructive' : 'ok',
      () => {
        if (k === 'sec' && !note.trim())
          return setError('Say how the receipt was confirmed');
        return run(
          () =>
            act({
              id: p.id,
              action: 'receipt',
              body: { ok: k !== 'no', note: note.trim() },
            }).unwrap(),
          k === 'no' ? 'Security has been told' : 'Recorded as received',
        );
      },
    ];
  } else if (kind === 'drop') {
    title = `Boxes handed in by ${p.authorisedBy?.name ?? 'the employee'}`;
    body = (
      <>
        <Text style={[typo.body, { color: c.ink }]}>
          Count the boxes. The pass says {boxesText(p.boxes)}.
        </Text>
        <Field
          label="Boxes counted"
          value={count}
          keyboardType="number-pad"
          mono
          large
          onChangeText={t => setCount(t.replace(/\D/g, ''))}
        />
      </>
    );
    action = [
      'Keep at the gate',
      'primary',
      () =>
        run(
          () =>
            act({
              id: p.id,
              action: 'drop',
              body: { boxes: Number(count) },
            }).unwrap(),
          'Kept at the gate for pickup',
        ),
    ];
  } else if (kind === 'release') {
    title = pickup
      ? 'Hand over to the person collecting'
      : 'Count the boxes and release';
    const n = Number(count);
    body = (
      <>
        {pickup ? (
          <>
            <SelectField
              label="Who is collecting"
              value={pickerVisitId}
              options={[
                { value: '', label: 'Someone not checked in as a visitor' },
                ...visitors.map(v => ({
                  value: v.id,
                  label: `${v.name}${v.company ? ` · ${v.company}` : ''}`,
                })),
              ]}
              onChange={setPickerVisitId}
            />
            {!pickerVisitId ? (
              <>
                <Field
                  label="Name"
                  value={pickerName}
                  onChangeText={setPickerName}
                />
                <Field
                  label="Mobile"
                  value={pickerPhone}
                  keyboardType="phone-pad"
                  mono
                  onChangeText={t =>
                    setPickerPhone(t.replace(/[^\d+\s]/g, '').slice(0, 14))
                  }
                />
                <View style={{ width: moderateScale(140) }}>
                  <PhotoTile
                    label="Photo of the person collecting"
                    sub="Face"
                    uri={photo}
                    aspect={3 / 4}
                    required={settings.mpCarrierPhotoRequired !== false}
                    onPress={take}
                  />
                </View>
              </>
            ) : null}
          </>
        ) : (
          <View style={styles.row}>
            <Thumb url={p.carrier?.photoUrl} name={carrierName(p)} size={48} />
            <Text style={[typo.body, { color: c.ink, flex: 1 }]}>
              {carrierName(p)} · check this is the person taking the boxes.
            </Text>
          </View>
        )}
        <Field
          label={`Count the boxes (pass says ${p.boxes})`}
          value={count}
          keyboardType="number-pad"
          mono
          large
          error={!!count && n !== p.boxes}
          onChangeText={t => setCount(t.replace(/\D/g, ''))}
        />
        <Field
          label="Vehicle number"
          value={vehicle}
          autoCapitalize="characters"
          mono
          onChangeText={t => setVehicle(t.toUpperCase())}
        />
      </>
    );
    action = [
      `Release ${boxesText(p.boxes)}`,
      'primary',
      () => {
        if (n !== p.boxes)
          return setError(
            `Counted ${n || 0} boxes but the pass is for ${boxesText(
              p.boxes,
            )}. Do not release.`,
          );
        if (
          pickup &&
          !pickerVisitId &&
          !photo &&
          settings.mpCarrierPhotoRequired !== false
        )
          return setError('Take a photo of the person collecting');
        return run(
          () =>
            upload({
              id: p.id,
              action: 'release',
              fields: {
                boxes: n,
                vehicle: vehicle.trim() || undefined,
                ...(pickup
                  ? pickerVisitId
                    ? { pickerVisitId }
                    : {
                        pickerName: pickerName.trim(),
                        pickerPhone: pickerPhone.trim(),
                      }
                  : {}),
              },
              photo: pickup && !pickerVisitId ? photo : null,
            }).unwrap(),
          `${boxesText(p.boxes)} released`,
        );
      },
    ];
  } else if (kind === 'return') {
    title =
      p.direction === 'out'
        ? 'Record boxes back'
        : 'Record boxes going back out';
    body = (
      <>
        {lines.map(l => (
          <View key={l.i} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[typo.bodySemi, { color: c.ink }]}>{l.desc}</Text>
              <Text style={[typo.small, { color: c.muted }]}>
                {l.outstanding} outstanding
              </Text>
            </View>
            <Field
              label={l.unit}
              value={qty[l.i]}
              keyboardType="decimal-pad"
              mono
              style={{ width: moderateScale(90) }}
              onChangeText={t =>
                setQty(q => ({ ...q, [l.i]: t.replace(/[^\d.]/g, '') }))
              }
            />
          </View>
        ))}
        <Field
          label="Remarks"
          value={note}
          onChangeText={setNote}
          placeholder="e.g. Came back with goods return challan"
        />
        <View style={{ width: moderateScale(140) }}>
          <PhotoTile
            label="Photo (optional)"
            sub="Boxes back"
            uri={photo}
            aspect={4 / 3}
            onPress={take}
          />
        </View>
      </>
    );
    action = [
      'Save',
      'primary',
      () => {
        const chosen = lines
          .map(l => ({ i: l.i, qty: Number(qty[l.i]) || 0 }))
          .filter(l => l.qty > 0);
        if (!chosen.length) return setError('Enter at least one quantity');
        return run(
          () =>
            upload({
              id: p.id,
              action: 'return',
              fields: {
                lines: JSON.stringify(chosen),
                note: note.trim() || undefined,
              },
              photo,
            }).unwrap(),
          pass =>
            pass.status === 'returned'
              ? 'All back. Pass closed.'
              : 'Recorded. The rest is still outstanding.',
        );
      },
    ];
  }

  return (
    <Sheet visible onClose={onClose}>
      <View style={{ gap: moderateScale(12) }}>
        <Text style={[typo.eyebrow, { color: c.muted }]}>{p.id}</Text>
        <Text accessibilityRole="header" style={[typo.h2, { color: c.ink }]}>
          {title}
        </Text>
        {body}
        {error ? (
          <Text style={[typo.bodyMedium, { color: c.bad }]}>{error}</Text>
        ) : null}
        <View style={styles.row}>
          <Button
            title="Back"
            variant="ghost"
            style={{ flex: 1 }}
            onPress={onClose}
          />
          {action ? (
            <Button
              title={action[0]}
              variant={action[1]}
              style={{ flex: 2 }}
              loading={busy}
              onPress={action[2]}
            />
          ) : null}
        </View>
      </View>
    </Sheet>
  );
}

/** One material gate pass (full screen). Params: `id`. */
export function MaterialDetailsScreen({ navigation, route }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const user = useSelector(selectUser);
  const gate = useSelector(selectCanCheckIn);
  const id = route?.params?.id;
  const {
    data: p,
    error,
    refetch,
    isLoading,
  } = useGetMaterialQuery(id, { skip: !id });
  const [act] = useMaterialActionMutation();
  const [sheet, setSheet] = useState(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [preview, setPreview] = useState(null);
  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const header = (
    <View
      style={[
        styles.head,
        {
          paddingTop: insets.top + moderateScale(8),
          backgroundColor: c.surface,
          borderBottomColor: c.line,
        },
      ]}
    >
      <SurfaceStatusBar />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={() => navigation.goBack()}
        style={styles.close}
      >
        <CrossIcon color={c.ink} size={18} />
      </Pressable>
      {p ? (
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[typo.eyebrow, { color: c.muted }]}>
            Material gate pass
          </Text>
          <Text style={[typo.h2, { color: c.ink }]}>
            {p.direction === 'in' ? 'IN' : 'OUT'} · {boxesText(p.boxes)}
          </Text>
          <Text style={[typo.monoSmall, { color: c.muted }]}>{p.id}</Text>
          <HostStageChip
            stage={{
              label: mpState(p).label,
              tone: CHIP_TONE[mpState(p).tone],
            }}
          />
        </View>
      ) : null}
    </View>
  );
  if (!p) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        {header}
        <View style={{ padding: moderateScale(16) }}>
          {error ? (
            <ListError message={errorMessage(error)} onRetry={refetch} />
          ) : (
            <Text style={[typo.body, { color: c.muted }]}>
              {isLoading ? 'Loading…' : ''}
            </Text>
          )}
        </View>
      </View>
    );
  }
  const next = nextStep(p, user, gate);
  const actions = actionsFor(p, user, gate);
  const images = [
    ...(p.carrier?.photoUrl
      ? [{ url: p.carrier.photoUrl, label: carrierName(p) }]
      : []),
    ...p.challanPhotoUrls.map((url, i) => ({
      url,
      label: `${p.challanType || 'Challan'} ${i + 1}`,
    })),
    ...p.photoUrls.map((url, i) => ({ url, label: `Boxes ${i + 1}` })),
  ];
  const isIn = p.direction === 'in';
  const rows = [
    [
      isIn ? 'Brought in by' : 'Taken out by',
      [
        carrierName(p),
        p.carrier?.company,
        p.carrier?.phone,
        p.carrier?.visitBadge && `pass ${p.carrier.visitBadge}`,
      ]
        .filter(Boolean)
        .join(' · '),
    ],
    [isIn ? 'For' : 'Sent by', p.authorisedBy?.name ?? 'Security'],
    ['Challan', [p.challanType, p.refNo].filter(Boolean).join(' ')],
    ['E-way bill', p.ewaybill],
    [
      'Type',
      `${p.returnable ? 'Returnable' : 'Non-returnable'}${
        p.returnDue ? `, back by ${fmtShortDate(p.returnDue)}` : ''
      }`,
    ],
    ['Purpose', p.purpose],
    ['Vehicle', p.carrier?.vehicle],
    ['Gate', p.site],
    [
      'Made',
      `${fmtDateTime(p.createdAt)} · ${
        (p.requestedBy ?? p.createdBy)?.name ?? ''
      }`,
    ],
    [
      'Accepted',
      p.receivedAt
        ? `${fmtDateTime(p.receivedAt)}${
            p.receiptVia === 'security' ? ' (on paper)' : ''
          }`
        : '',
    ],
    [
      'Approved',
      p.approvedAt
        ? `${fmtDateTime(p.approvedAt)} · ${p.approvedBy?.name ?? ''}`
        : '',
    ],
    [
      'Handed in',
      p.droppedAt
        ? `${fmtDateTime(p.droppedAt)} · ${p.droppedBy?.name ?? ''}`
        : '',
    ],
    [
      'Counted',
      p.checkedAt
        ? `${p.checkedBoxes} of ${p.boxes} · ${fmtDateTime(p.checkedAt)} · ${
            p.checkedBy?.name ?? ''
          }`
        : '',
    ],
    [
      'Released',
      p.releasedAt
        ? `${fmtDateTime(p.releasedAt)} · ${p.releasedBy?.name ?? ''}`
        : '',
    ],
    ...p.returns.map(r => [
      isIn ? 'Taken back out' : 'Back in',
      `${fmtDateTime(r.at)} · ${r.lines
        .map(l => `${l.qty} ${p.items[l.i]?.desc}`)
        .join(', ')}${r.note ? ` · ${r.note}` : ''}`,
    ]),
    ['Remarks', p.remarks],
  ].filter(([, v]) => v);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {header}
      <ScrollView
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {next ? (
          <Banner
            tone={
              next[2] === 'bad' ? 'bad' : next[2] === 'warn' ? 'warn' : 'accent'
            }
          >
            <Text style={[typo.bodySemi, { color: c.ink }]}>{next[0]}</Text>
            {next[1] ? (
              <Text style={[typo.small, { color: c.ink }]}>{next[1]}</Text>
            ) : null}
          </Banner>
        ) : null}
        {actions.length ? (
          <View style={styles.actions}>
            {actions.map(([label, kind, variant]) => (
              <Button
                key={kind + label}
                title={label}
                variant={variant}
                style={{ flexGrow: 1 }}
                onPress={async () => {
                  if (kind !== 'remind') return setSheet(kind);
                  try {
                    await act({ id: p.id, action: 'remind' }).unwrap();
                    toast.show('Reminder sent');
                  } catch (e) {
                    toast.show(errorMessage(e), 'error');
                  }
                  return undefined;
                }}
              />
            ))}
          </View>
        ) : null}
        {images.length ? (
          <ScrollView
            showsVerticalScrollIndicator={false}
            showsHorizontalScrollIndicator={false}
            horizontal
            contentContainerStyle={{ gap: moderateScale(8) }}
          >
            {images.map((img, i) => (
              <Pressable
                key={img.url}
                accessibilityRole="imagebutton"
                accessibilityLabel={`Open ${img.label}`}
                onPress={() => setPreview(i)}
              >
                <Image
                  source={{ uri: fileUrl(img.url) }}
                  style={[styles.photo, { borderColor: c.line }]}
                />
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
        <View
          style={[
            styles.card,
            { backgroundColor: c.surface, borderColor: c.line },
          ]}
        >
          {rows.map(([label, value]) => (
            <View key={label + value} style={{ gap: 2 }}>
              <Text style={[typo.eyebrow, { color: c.muted }]}>{label}</Text>
              <Text style={[typo.body, { color: c.ink }]}>{value}</Text>
            </View>
          ))}
          {p.items.length > 1 ? (
            <View style={{ gap: 2 }}>
              <Text style={[typo.eyebrow, { color: c.muted }]}>
                Item details
              </Text>
              {p.items.slice(1).map((it, i) => (
                <Text
                  key={i}
                  style={[typo.body, { color: c.ink, fontFamily: fonts.body }]}
                >
                  {it.desc} — {it.qty} {it.unit}
                  {it.serial ? ` · ${it.serial}` : ''}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
        {mayCancel(p, user) ? (
          <Button
            title="Cancel pass"
            variant="danger"
            onPress={() => setConfirmCancel(true)}
          />
        ) : null}
      </ScrollView>
      {sheet ? (
        <ActionSheet kind={sheet} pass={p} onClose={() => setSheet(null)} />
      ) : null}
      {preview !== null ? (
        <ImagePreview
          visible
          index={preview}
          images={images}
          onClose={() => setPreview(null)}
        />
      ) : null}
      <ConfirmDialog
        visible={confirmCancel}
        tone="danger"
        title="Cancel this gate pass?"
        message={`${p.id} · ${boxesText(p.boxes)}. Nothing has moved yet.`}
        confirmLabel="Cancel pass"
        cancelLabel="Keep"
        onCancel={() => setConfirmCancel(false)}
        onConfirm={async () => {
          setConfirmCancel(false);
          try {
            await act({ id: p.id, action: 'cancel' }).unwrap();
            toast.show('Gate pass cancelled');
          } catch (e) {
            toast.show(errorMessage(e), 'error');
          }
        }}
      />
    </View>
  );
}

const styles = ScaledSheet.create({
  head: {
    flexDirection: 'row-reverse',
    gap: '12@ms',
    paddingHorizontal: '16@ms',
    paddingBottom: '14@vs',
    borderBottomWidth: 1,
  },
  close: {
    width: '40@ms',
    height: '40@ms',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { padding: '16@ms', gap: '14@ms', paddingBottom: '48@vs' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: '8@ms' },
  photo: {
    width: '96@ms',
    height: '96@ms',
    borderRadius: radius.control,
    borderWidth: 1,
  },
  card: {
    borderWidth: 1,
    borderRadius: radius.panel,
    padding: '14@ms',
    gap: '10@ms',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: '10@ms' },
  challan: { width: '100%', height: '180@vs', borderRadius: radius.control },
});
