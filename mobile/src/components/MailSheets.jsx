import React, { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import {
  errorMessage,
  useHandoverMailMutation,
  useResolveMailMutation,
} from '../store/api';
import { useToast } from '../store/hooks';
import { fonts, typo, useTheme } from '../theme';
import { fmtTime } from '../utils/format';
import { Button } from './Button';
import { ChipSelect } from './ChipSelect';
import { Field } from './Field';
import { mailFromLine } from './MailCard';
import { Sheet } from './Sheet';
import { Thumb } from './Thumb';
import { moderateScale } from 'react-native-size-matters/extend';

function ItemHead({ item, eyebrow }) {
  const { c } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: moderateScale(12),
        alignItems: 'center',
      }}
    >
      <Thumb url={item.coverPhotoUrl} name={item.kind} size={48} />
      <View style={{ flex: 1, gap: moderateScale(2) }}>
        <Text
          accessibilityRole="header"
          style={[typo.eyebrow, { color: c.muted }]}
        >
          {eyebrow}
        </Text>
        <Text style={[typo.h2, { color: c.ink }]} numberOfLines={2}>
          {item.kind} for {item.recipientName}
        </Text>
        <Text style={[typo.small, { color: c.muted }]} numberOfLines={2}>
          {mailFromLine(item)}
          {item.refNo ? ` · ${item.refNo}` : ''}
        </Text>
      </View>
    </View>
  );
}

/** Record a handover. Opened through `useSheets().openHandover(item)`. */
export function HandoverSheet({ item, onClose }) {
  const { c } = useTheme();
  const toast = useToast();
  const [handover] = useHandoverMailMutation();
  const inPerson = `${item.recipientName} in person`;
  const behalf = 'Someone on their behalf';
  const [mode, setMode] = useState(inPerson);
  const [collectedBy, setCollectedBy] = useState(item.recipientName);
  const [note, setNote] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const fieldRef = useRef(null);

  const confirm = async () => {
    if (!collectedBy.trim()) {
      setError('Write who collected it.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await handover({
        id: item.id,
        collectedBy: collectedBy.trim(),
        note: note.trim() || undefined,
      }).unwrap();
      toast.show(
        res.item.status === 'handed'
          ? `Handed over · ${res.item.recipientName} asked to confirm`
          : `Handed over to ${res.item.collectedBy}`,
      );
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet onClose={onClose}>
      <ItemHead item={item} eyebrow="Hand over" />
      <ChipSelect
        accessibilityLabel="Who is collecting"
        options={[inPerson, behalf]}
        value={mode}
        onChange={v => {
          setMode(v);
          if (v === inPerson) setCollectedBy(item.recipientName);
          else {
            setCollectedBy('');
            setTimeout(() => fieldRef.current?.focus(), 50);
          }
        }}
      />
      <Field
        ref={fieldRef}
        label="Collected by"
        required
        value={collectedBy}
        onChangeText={t => {
          setCollectedBy(t);
          setError(null);
        }}
        autoCapitalize="words"
        error={!!error && !collectedBy.trim()}
      />
      <Field
        label="Remarks"
        value={note}
        onChangeText={setNote}
        placeholder="e.g. Signed in register, ID seen"
        multiline
        maxLength={300}
      />
      <Text style={[typo.small, { color: c.muted }]}>
        {item.recipient
          ? `${item.recipientName} will be asked to confirm on their phone that they received it.`
          : `${item.recipientName} is not on Gatebook, so there is no confirmation step.`}
      </Text>
      {error ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[typo.bodyMedium, { color: c.bad }]}
        >
          {error}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: moderateScale(12) }}>
        <Button
          title="Cancel"
          variant="ghost"
          onPress={onClose}
          style={{ flex: 1 }}
        />
        <Button
          title="Confirm handover"
          variant="ok"
          onPress={confirm}
          loading={saving}
          style={{ flex: 1.4 }}
          size="lg"
        />
      </View>
    </Sheet>
  );
}

/** Resolve a disputed item. Opened through `useSheets().openResolve(item)`. */
export function ResolveSheet({ item, onClose }) {
  const { c } = useTheme();
  const toast = useToast();
  const [resolve] = useResolveMailMutation();
  const [note, setNote] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const confirm = async () => {
    if (!note.trim()) {
      setError('Write what was found or done');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await resolve({ id: item.id, note: note.trim() }).unwrap();
      toast.show(`Issue resolved · ${res.item.recipientName}`);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet onClose={onClose}>
      <ItemHead item={item} eyebrow="Resolve issue" />
      <Text style={[typo.body, { color: c.ink }]}>
        Handed to {item.collectedBy || '—'}
        {item.handedAt ? ` at ${fmtTime(item.handedAt)}` : ''}
        {item.disputeNote ? (
          <Text style={{ fontFamily: fonts.bodySemi, color: c.bad }}>
            {' '}
            · “{item.disputeNote}”
          </Text>
        ) : null}
      </Text>
      <Field
        label="What was found or done"
        required
        value={note}
        onChangeText={t => {
          setNote(t);
          setError(null);
        }}
        multiline
        maxLength={500}
        error={!!error}
      />
      {error ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[typo.bodyMedium, { color: c.bad }]}
        >
          {error}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: moderateScale(12) }}>
        <Button
          title="Cancel"
          variant="ghost"
          onPress={onClose}
          style={{ flex: 1 }}
        />
        <Button
          title="Mark resolved"
          onPress={confirm}
          loading={saving}
          style={{ flex: 1.4 }}
          size="lg"
        />
      </View>
    </Sheet>
  );
}
