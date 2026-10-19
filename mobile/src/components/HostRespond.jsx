import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { fonts, MIN_TOUCH, radius, useTheme } from '../theme';
import { useRespondVisit } from '../store/visitActions';
import { Button } from './Button';
import { Field } from './Field';
import { ScaledSheet } from 'react-native-size-matters/extend';

const QUICK_REPLIES = [
  'Send to my office',
  "I'll come to the gate",
  'Ask them to wait 10 minutes',
  'Send to the meeting room',
  'Not available today',
  'Not expecting this visitor',
  'Please reschedule',
];

/**
 * The visited host answers a waiting visitor: optional message to security (quick replies fill it), then
 * Decline / Accept. `note` / `onNote` let a list keep typed notes across live refreshes.
 */
export function HostRespond({ visit, note, onNote, onDone }) {
  const { c } = useTheme();
  const { respond, busyId } = useRespondVisit();
  const [ownNote, setOwnNote] = useState('');
  const value = note ?? ownNote;
  const setValue = onNote ?? setOwnNote;
  const busy = busyId === visit.id;

  const answer = async status => {
    const updated = await respond(visit, status, value);
    if (updated) onDone?.(updated);
  };

  return (
    <View style={styles.wrap}>
      <Field
        label="Message to security (optional)"
        value={value}
        onChangeText={t => setValue(t.slice(0, 200))}
        placeholder="e.g. Send to 2nd floor cabin"
      />
      <View style={styles.chips} accessibilityLabel="Quick replies">
        {QUICK_REPLIES.map(r => {
          const on = value === r;
          return (
            <Pressable
              key={r}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => setValue(r)}
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: on ? c.ink : pressed ? c.sunk : c.surface,
                  borderColor: on ? c.ink : c.line,
                },
              ]}
            >
              <Text style={[styles.chipText, { color: on ? c.onInk : c.ink }]}>
                {r}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.buttons}>
        <Button
          title="Decline"
          variant="danger"
          size="lg"
          disabled={busy}
          onPress={() => answer('declined')}
          style={{ flex: 1 }}
          accessibilityLabel={`Decline ${visit.name}`}
        />
        <Button
          title="Accept, let them in"
          variant="ok"
          size="lg"
          loading={busy}
          onPress={() => answer('accepted')}
          style={{ flex: 2 }}
          accessibilityLabel={`Accept ${visit.name}, let them in`}
        />
      </View>
    </View>
  );
}

const styles = ScaledSheet.create({
  wrap: { gap: '12@ms' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: '8@ms' },
  chip: {
    minHeight: MIN_TOUCH - 4,
    justifyContent: 'center',
    paddingHorizontal: '12@s',
    borderRadius: radius.chip,
    borderWidth: 1,
  },
  chipText: { fontFamily: fonts.bodyMedium, fontSize: '13@ms' },
  buttons: { flexDirection: 'row', gap: '10@ms' },
});
