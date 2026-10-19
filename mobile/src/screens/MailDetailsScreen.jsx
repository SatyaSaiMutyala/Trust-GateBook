import React, { useState } from 'react';
import { BellIcon } from '../components/NotificationBell';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fileUrl } from '../api/config';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { KindTag } from '../components/KindTag';
import { ListError } from '../components/ListFooter';
import { StatusChip } from '../components/StatusChip';
import { NoBackPhoto, Thumb } from '../components/Thumb';
import { ImagePreview, ZoomBadge } from '../components/ImagePreview';
import { useNow } from '../state/useNow';
import { fonts, MIN_TOUCH, radius, typo, useTheme } from '../theme';
import {
  firstName,
  fmtDateTime,
  fmtMinutes,
  fmtTimeOrDate,
  minutesBetween,
} from '../utils/format';
import {
  ScaledSheet,
  moderateScale,
  verticalScale,
} from 'react-native-size-matters/extend';
import { useDispatch, useSelector } from 'react-redux';
import { errorMessage, useGetMailQuery } from '../store/api';
import {
  selectCanHandleMail,
  selectIsGateUser,
  selectUser,
} from '../store/authSlice';
import { disputeNoteSet, selectDisputeNote } from '../store/draftsSlice';
import { useSheets, useToast } from '../store/hooks';
import { useConfirmMail, useRemind } from '../store/mailActions';
import { CrossIcon } from '../components/Glyphs';

function Detail({ label, value, mono }) {
  const { c } = useTheme();
  return (
    <View style={styles.detail}>
      <Text
        style={[typo.eyebrow, { color: c.muted, fontSize: moderateScale(11) }]}
      >
        {label}
      </Text>
      <Text
        style={[
          mono ? typo.mono : typo.body,
          { color: value ? c.ink : c.muted },
        ]}
      >
        {value || '—'}
      </Text>
    </View>
  );
}

/** dot: 'ok' (green), 'done' (ink), 'pending' (dashed), 'bad' (red) */
function Step({ dot, children }) {
  const { c } = useTheme();
  const dotStyle = {
    ok: { backgroundColor: c.ok, borderColor: c.ok },
    done: { backgroundColor: c.ink, borderColor: c.ink },
    bad: { backgroundColor: c.bad, borderColor: c.bad },
    pending: {
      backgroundColor: 'transparent',
      borderColor: c.muted,
      borderStyle: 'dashed',
    },
  }[dot];
  return (
    <View style={styles.step}>
      <View style={[styles.dot, dotStyle]} />
      <Text
        style={[typo.body, { color: dot === 'bad' ? c.bad : c.ink, flex: 1 }]}
      >
        {children}
      </Text>
    </View>
  );
}

/** A labelled photo: fixed `aspect`, or `fill` to stretch to the column height. */
function Photo({ url, label, contain, aspect, onPress, fill = false }) {
  const { c } = useTheme();
  const src = fileUrl(url);
  return (
    <View style={[{ gap: moderateScale(4) }, fill && { flex: 1 }]}>
      <Text
        style={[typo.eyebrow, { color: c.muted, fontSize: moderateScale(11) }]}
      >
        {label}
      </Text>
      {src ? (
        <Pressable
          onPress={onPress}
          accessibilityRole="imagebutton"
          accessibilityLabel={label}
          accessibilityHint="Opens the full photo"
          style={({ pressed }) => [
            styles.photo,
            {
              ...(fill ? { flex: 1 } : { aspectRatio: aspect }),
              backgroundColor: c.sunk,
              borderColor: c.line,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Image
            source={{ uri: src }}
            style={StyleSheet.absoluteFill}
            resizeMode={contain ? 'contain' : 'cover'}
          />
          <ZoomBadge />
        </Pressable>
      ) : (
        <Thumb
          url={null}
          name={label}
          fill
          style={fill ? { flex: 1 } : { aspectRatio: aspect }}
        />
      )}
    </View>
  );
}

/**
 * Photos for the full-screen preview, in order Front · Back · Delivery person, skipping missing ones
 * (items logged before back photos were required have no back).
 */
export function mailPhotos(item) {
  return [
    {
      key: 'front',
      url: item.coverPhotoUrl,
      label: `Cover — front · ${item.kind}`,
    },
    {
      key: 'back',
      url: item.coverBackPhotoUrl,
      label: `Cover — back · ${item.kind}`,
    },
    {
      key: 'person',
      url: item.personPhotoUrl,
      label: `Delivery person${item.broughtBy ? ` · ${item.broughtBy}` : ''}`,
    },
  ].filter(p => !!p.url);
}

/** Preview index for a tapped photo (0 if it isn't in the list). */
export function photoIndex(item, key) {
  return Math.max(
    0,
    mailPhotos(item).findIndex(p => p.key === key),
  );
}

export function MailDetailsScreen({ navigation, route }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const user = useSelector(selectUser);
  const gate = useSelector(selectIsGateUser);
  const canAct = useSelector(selectCanHandleMail);
  const dispatch = useDispatch();
  const { openHandover, openResolve } = useSheets();
  const { remind, remindingId } = useRemind();
  const { confirm, busyId } = useConfirmMail();
  const now = useNow(30000);
  const id = route.params.id;
  const {
    data: item = null,
    error: loadError,
    refetch: load,
  } = useGetMailQuery(id);
  const error = loadError ? errorMessage(loadError) : null;
  const disputeNote = useSelector(selectDisputeNote(id));
  const setDisputeNote = note => dispatch(disputeNoteSet({ id, note }));

  const close = () =>
    navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Main');

  const header = (
    <View
      style={[
        styles.top,
        {
          paddingTop: insets.top + verticalScale(8),
          backgroundColor: c.surface,
          borderBottomColor: c.line,
        },
      ]}
    >
      <View style={{ flex: 1, gap: moderateScale(4) }}>
        {item ? (
          <View style={styles.row}>
            <KindTag kind={item.kind} />
            <Text style={[typo.monoSmall, { color: c.muted }]}>{item.id}</Text>
          </View>
        ) : null}
        <Text
          accessibilityRole="header"
          numberOfLines={2}
          style={[typo.h1, { color: c.ink }]}
        >
          {item ? `For ${item.recipientName}` : 'Post item'}
        </Text>
        {item ? <StatusChip state={item.status} /> : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={close}
        hitSlop={8}
        style={[styles.close, { borderColor: c.line }]}
      >
        <CrossIcon color={c.ink} size={16} />
      </Pressable>
    </View>
  );

  // Full-screen photo viewer: index into the item's photos, or null when closed.
  const [preview, setPreview] = useState(null);

  if (!item) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        {header}
        <View style={{ padding: moderateScale(16) }}>
          {error ? (
            <ListError message={error} onRetry={load} />
          ) : (
            <ActivityIndicator color={c.muted} size="large" />
          )}
        </View>
      </View>
    );
  }

  const isMine = item.recipient?.id === user?.id;
  const who = firstName(item.recipientName);
  const phone = item.recipient?.phone;

  const callReceiver = async () => {
    const url = `tel:${phone.replace(/[^\d+]/g, '')}`;
    try {
      await Linking.openURL(url);
    } catch {
      toast.show('Calling is not available on this device.', 'error');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {header}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + verticalScale(24) },
        ]}
      >
        {/* Same arrangement as when logging: front over back on the left, delivery person on the right
            stretched to the height of the two covers. */}
        <View style={styles.photoGrid}>
          <View style={styles.photoCol}>
            <Photo
              url={item.coverPhotoUrl}
              label="Front"
              contain
              aspect={4 / 3}
              onPress={() => setPreview(photoIndex(item, 'front'))}
            />
            {item.coverBackPhotoUrl ? (
              <Photo
                url={item.coverBackPhotoUrl}
                label="Back"
                contain
                aspect={4 / 3}
                onPress={() => setPreview(photoIndex(item, 'back'))}
              />
            ) : (
              <View style={{ gap: moderateScale(4) }}>
                <Text
                  style={[
                    typo.eyebrow,
                    { color: c.muted, fontSize: moderateScale(11) },
                  ]}
                >
                  Back
                </Text>
                <NoBackPhoto />
              </View>
            )}
          </View>
          <View style={styles.photoCol}>
            <Photo
              url={item.personPhotoUrl}
              label="Delivery person"
              fill
              onPress={() => setPreview(photoIndex(item, 'person'))}
            />
          </View>
        </View>

        <View
          style={[
            styles.card,
            { backgroundColor: c.surface, borderColor: c.line },
          ]}
        >
          <Step dot="ok">
            <Text style={{ fontFamily: fonts.bodySemi }}>Received</Text>{' '}
            <Text style={{ fontFamily: fonts.mono }}>
              {fmtDateTime(item.receivedAt)}
            </Text>
            {item.receivedBy ? ` · Logged by ${item.receivedBy.name}` : ''}
          </Step>
          {item.notifiedAt ? (
            <Step dot="ok">
              {who} notified
              {item.notifiedAt ? ` ${fmtTimeOrDate(item.notifiedAt, now)}` : ''}
              {item.remindedAt
                ? ` · Reminder sent ${fmtTimeOrDate(item.remindedAt, now)}`
                : ''}
            </Step>
          ) : (
            <Step dot="pending">
              {item.recipient
                ? "Receiver can't sign in to Gatebook"
                : 'Receiver not on Gatebook'}{' '}
              · Inform by phone
            </Step>
          )}
          {item.handedAt ? (
            <Step dot="done">
              <Text style={{ fontFamily: fonts.bodySemi }}>Handed over</Text>{' '}
              <Text style={{ fontFamily: fonts.mono }}>
                {fmtDateTime(item.handedAt)}
              </Text>
              {item.collectedBy ? ` · To ${item.collectedBy}` : ''}
              {item.handedBy ? ` · by ${item.handedBy.name}` : ''}
              {item.handedNote ? ` · ${item.handedNote}` : ''}
            </Step>
          ) : (
            <Step dot="pending">
              Waiting to be collected ·{' '}
              {fmtMinutes(minutesBetween(item.receivedAt, now))} since it
              arrived
            </Step>
          )}
          {item.status === 'handed' ? (
            <Step dot="pending">Waiting for {who} to confirm</Step>
          ) : null}
          {item.confirmedAt && item.status === 'confirmed' ? (
            <Step dot="ok">
              {who} confirmed collection {fmtTimeOrDate(item.confirmedAt, now)}
            </Step>
          ) : null}
          {item.status === 'disputed' || item.status === 'resolved' ? (
            <Step dot="bad">
              {who} says they did not get it
              {item.disputeNote ? ` · “${item.disputeNote}”` : ''}
            </Step>
          ) : null}
          {item.resolvedAt ? (
            <Step dot="done">
              <Text style={{ fontFamily: fonts.bodySemi }}>Resolved</Text>{' '}
              {fmtTimeOrDate(item.resolvedAt, now)}
              {item.resolveNote ? ` · ${item.resolveNote}` : ''}
              {item.resolvedBy ? ` · by ${item.resolvedBy.name}` : ''}
            </Step>
          ) : null}
        </View>

        <View
          style={[
            styles.card,
            styles.grid,
            { backgroundColor: c.surface, borderColor: c.line },
          ]}
        >
          <Detail label="From (sender)" value={item.sender} />
          <Detail label="Brought by" value={item.carrier} />
          <Detail label="Delivery person" value={item.broughtBy} />
          <Detail label="Their mobile" value={item.broughtPhone} mono />
          <Detail label="Tracking / ref no." value={item.refNo} mono />
          <Detail label="Pieces" value={String(item.pieces)} mono />
          <Detail
            label="For"
            value={
              gate && phone
                ? `${item.recipientName} · ${phone}`
                : item.recipientName
            }
          />
          <Detail label="Department" value={item.dept} />
          <Detail label="Remarks" value={item.notes} />
        </View>

        {gate && canAct && item.status === 'lodged' ? (
          <View style={styles.actions}>
            {item.notifiedAt ? (
              <Button
                title="Remind"
                icon={<BellIcon color={c.ink} size={16} />}
                variant="ghost"
                onPress={() => remind(item)}
                loading={remindingId === item.id}
                style={styles.actionBtn}
              />
            ) : null}
            {phone ? (
              <Button
                title="Call receiver"
                variant="ghost"
                onPress={callReceiver}
                style={styles.actionBtn}
                accessibilityLabel={`Call ${item.recipientName}`}
              />
            ) : null}
            <Button
              title="Handed over"
              variant="ok"
              size="lg"
              onPress={() => openHandover(item)}
              style={styles.fullBtn}
            />
          </View>
        ) : null}
        {gate && canAct && item.status === 'disputed' ? (
          <Button title="Resolve" size="lg" onPress={() => openResolve(item)} />
        ) : null}
        {isMine && item.status === 'handed' ? (
          <View style={{ gap: moderateScale(10) }}>
            <Field
              label="If you did not get it, tell security why"
              value={disputeNote}
              onChangeText={setDisputeNote}
              multiline
              maxLength={300}
            />
            <View style={styles.actions}>
              <Button
                title="I did not get it"
                variant="danger"
                onPress={() => confirm(item, false, disputeNote)}
                loading={busyId === item.id}
                style={styles.actionBtn}
              />
              <Button
                title="Yes, I collected it"
                variant="ok"
                onPress={() => confirm(item, true)}
                loading={busyId === item.id}
                style={styles.actionBtn}
              />
            </View>
          </View>
        ) : null}
      </ScrollView>
      <ImagePreview
        visible={preview !== null}
        index={preview ?? 0}
        onClose={() => setPreview(null)}
        images={mailPhotos(item)}
      />
    </View>
  );
}

const styles = ScaledSheet.create({
  top: {
    flexDirection: 'row',
    gap: '12@ms',
    paddingHorizontal: '16@s',
    paddingBottom: '14@vs',
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: 'flex-start',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: '8@ms' },
  close: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: radius.control,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { padding: '16@ms', gap: '14@ms' },
  photos: { flexDirection: 'row', gap: '12@ms', alignItems: 'flex-start' },
  // Two equal columns; `stretch` lets the person photo match the stacked covers' height.
  photoGrid: { flexDirection: 'row', gap: '12@ms', alignItems: 'stretch' },
  photoCol: { flex: 1, minWidth: 0, gap: '12@ms' },
  photo: { borderRadius: radius.control, borderWidth: 1, overflow: 'hidden' },
  card: {
    borderWidth: 1,
    borderRadius: radius.panel,
    padding: '16@ms',
    gap: '14@ms',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: '12@s',
    rowGap: '14@vs',
  },
  detail: { flexBasis: '46%', flexGrow: 1, gap: '2@ms' },
  step: { flexDirection: 'row', gap: '12@ms', alignItems: 'flex-start' },
  dot: {
    width: '12@ms',
    height: '12@ms',
    borderRadius: '6@ms',
    borderWidth: 2,
    marginTop: '5@vs',
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: '10@ms' },
  actionBtn: { flexGrow: 1, flexBasis: '40%' },
  fullBtn: { flexBasis: '100%' },
});
