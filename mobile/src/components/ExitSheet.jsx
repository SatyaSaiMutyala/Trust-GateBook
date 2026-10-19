import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  errorMessage,
  useExitVisitMutation,
  useMaterialUploadMutation,
} from '../store/api';
import { ExitMaterial } from './material/VisitMaterial';
import { useToast } from '../store/hooks';
import { fonts, MIN_TOUCH, typo, useTheme } from '../theme';
import { fmtDuration, fmtTime, fmtDateTime } from '../utils/format';
import { Button } from './Button';
import { ChipSelect } from './ChipSelect';
import { DateTimeField } from './DateTimeField';
import { Field } from './Field';
import { PassBadge } from './PassBadge';
import { Thumb } from './Thumb';
import {
  ScaledSheet,
  moderateScale,
  verticalScale,
} from 'react-native-size-matters/extend';
const QUICK = [
  { label: 'Now', mins: 0 },
  { label: '5 min ago', mins: 5 },
  { label: '15 min ago', mins: 15 },
  { label: '30 min ago', mins: 30 },
];
/** Record (or, for admins, correct) a visitor's exit. Opened through `useSheets().openExit(visit)`. */
export function ExitSheet({ visit, onClose }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [exitVisit] = useExitVisitMutation();
  const correcting = visit.outAt !== null;
  const [openedAt] = useState(() => Date.now());
  const [outAt, setOutAt] = useState(() =>
    visit.outAt ? new Date(visit.outAt) : new Date(),
  );
  const [quick, setQuick] = useState(correcting ? '' : 'Now');
  const [collected, setCollected] = useState(visit.passReturned ?? true);
  const [note, setNote] = useState(visit.exitNote ?? '');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  // Material OUT going with the visitor: counted here, released after the exit.
  const [counts, setCounts] = useState({});
  const [readyPasses, setReadyPasses] = useState([]);
  const [releaseMaterial] = useMaterialUploadMutation();
  const inAt = new Date(visit.inAt);
  const localError =
    outAt.getTime() < inAt.getTime()
      ? `Exit time is before check-in (${fmtTime(inAt)}).`
      : outAt.getTime() > openedAt + 5 * 60000
      ? 'Exit time is in the future.'
      : null;
  const confirm = async () => {
    if (localError) {
      setError(localError);
      return;
    }
    const wrong = correcting
      ? null
      : readyPasses.find(p => Number(counts[p.id]) !== p.boxes);
    if (wrong) {
      setError(
        `Count the boxes for ${wrong.id}: the pass says ${
          wrong.boxes
        } boxes, you counted ${counts[wrong.id] || 0}.`,
      );
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // "Now" is resolved on the server so a slow phone clock does not matter.
      const body = { exitNote: note.trim() };
      if (quick !== 'Now') body.outAt = outAt.toISOString();
      if (visit.badge) body.passReturned = collected;
      const res = await exitVisit({ id: visit.id, ...body }).unwrap();
      const dur = fmtDuration(res.visit.inAt, res.visit.outAt);
      const released = [];
      for (const p of correcting ? [] : readyPasses) {
        try {
          await releaseMaterial({
            id: p.id,
            action: 'release',
            fields: { boxes: p.boxes },
          }).unwrap();
          released.push(p.boxes);
        } catch (e) {
          toast.show(`${p.id} not released: ${errorMessage(e)}`, 'error');
        }
      }
      toast.show(
        `${res.visit.name} checked out · ${dur}${
          res.visit.badge && res.visit.passReturned === false
            ? ' · pass not returned'
            : ''
        }${
          released.length
            ? ` · ${released.reduce((a, b) => a + b, 0)} boxes released`
            : ''
        }`,
      );
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.root}
      >
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: c.overlay }]}
          onPress={onClose}
          accessibilityLabel="Cancel"
        />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: c.surface,
              paddingBottom: insets.bottom + verticalScale(16),
            },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: c.line }]} />
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: moderateScale(16) }}
          >
            <View style={styles.head}>
              <Thumb url={visit.photoUrl} name={visit.name} size={48} />
              <View style={{ flex: 1, gap: moderateScale(2) }}>
                <Text
                  accessibilityRole="header"
                  style={[typo.eyebrow, { color: c.muted }]}
                >
                  {correcting ? 'Correct exit time' : 'Record exit'}
                </Text>
                <Text style={[typo.h2, { color: c.ink }]} numberOfLines={1}>
                  {visit.name}
                </Text>
                <View style={styles.row}>
                  <PassBadge badge={visit.badge} />
                  <Text style={[typo.monoSmall, { color: c.muted }]}>
                    In {fmtTime(visit.inAt)}
                  </Text>
                </View>
              </View>
            </View>

            <DateTimeField
              label="Exit time"
              mode="datetime"
              value={outAt}
              minimumDate={inAt}
              maximumDate={new Date(openedAt + 5 * 60000)}
              error={!!localError}
              onChange={d => {
                setOutAt(d);
                setQuick('');
              }}
            />
            {correcting ? (
              <Text style={[typo.small, { color: c.muted }]}>
                Currently recorded: {fmtDateTime(visit.outAt)}
              </Text>
            ) : null}
            <ChipSelect
              accessibilityLabel="Quick exit time"
              options={QUICK.map(q => q.label)}
              value={quick}
              onChange={label => {
                const q = QUICK.find(x => x.label === label);
                setQuick(label);
                setOutAt(new Date(Date.now() - q.mins * 60000));
              }}
            />

            {visit.badge ? (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: collected }}
                accessibilityLabel={`Pass ${visit.badge} collected back`}
                onPress={() => setCollected(v => !v)}
                style={styles.check}
              >
                <View
                  style={[
                    styles.box,
                    {
                      borderColor: collected ? c.accent : c.line,
                      backgroundColor: collected ? c.accent : c.surface,
                    },
                  ]}
                >
                  {collected ? (
                    <Text
                      style={{ color: c.accentInk, fontFamily: fonts.bodySemi }}
                    >
                      ✓
                    </Text>
                  ) : null}
                </View>
                <Text style={[typo.body, { color: c.ink }]}>
                  Pass{' '}
                  <Text style={{ fontFamily: fonts.mono }}>{visit.badge}</Text>{' '}
                  collected back
                </Text>
              </Pressable>
            ) : null}

            {!correcting ? (
              <ExitMaterial
                visit={visit}
                counts={counts}
                setCounts={setCounts}
                onPasses={setReadyPasses}
              />
            ) : null}
            <Field
              label="Exit remarks"
              value={note}
              onChangeText={setNote}
              placeholder="Optional"
              multiline
              maxLength={300}
            />

            {error || localError ? (
              <Text
                accessibilityLiveRegion="polite"
                style={[typo.bodyMedium, { color: c.bad }]}
              >
                {error ?? localError}
              </Text>
            ) : null}

            <View style={styles.actions}>
              <Button
                title="Cancel"
                variant="ghost"
                onPress={onClose}
                style={{ flex: 1 }}
              />
              <Button
                title="Confirm exit"
                onPress={confirm}
                loading={saving}
                style={{ flex: 1.4 }}
                size="lg"
              />
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
const styles = ScaledSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: '16@ms',
    borderTopRightRadius: '16@ms',
    paddingHorizontal: '20@s',
    paddingTop: '8@vs',
    maxHeight: '92%',
  },
  grabber: {
    alignSelf: 'center',
    width: '40@s',
    height: '4@vs',
    borderRadius: '2@ms',
    marginBottom: '12@vs',
  },
  head: { flexDirection: 'row', gap: '12@ms', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: '8@ms' },
  check: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: '12@ms',
    minHeight: MIN_TOUCH,
  },
  box: {
    width: '26@ms',
    height: '26@ms',
    borderRadius: '6@ms',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { flexDirection: 'row', gap: '12@ms', marginTop: '4@vs' },
});
