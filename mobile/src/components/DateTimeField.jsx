import React, { useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import DateTimePicker, {
  DateTimePickerAndroid,
} from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, MIN_TOUCH, radius, typo, useTheme } from '../theme';
import { fmtDate, fmtDateTime } from '../utils/format';
import { Button } from './Button';
import { FieldShell } from './Field';
import { ScaledSheet, verticalScale } from 'react-native-size-matters/extend';
/**
 * Pressable field that opens the native picker: on Android the system dialogs (date, then time),
 * on iOS a bottom sheet with an inline/spinner picker and a Done button.
 */
export function DateTimeField({
  label,
  value,
  onChange,
  mode,
  minimumDate,
  maximumDate,
  error,
  bare,
}) {
  const { c, dark } = useTheme();
  const insets = useSafeAreaInsets();
  const [iosOpen, setIosOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const openPicker = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value,
        mode: 'date',
        minimumDate,
        maximumDate,
        onValueChange: (_e, picked) => {
          if (mode === 'date') {
            onChange(picked);
            return;
          }
          DateTimePickerAndroid.open({
            value: picked,
            mode: 'time',
            is24Hour: false,
            onValueChange: (_e2, time) => {
              const d = new Date(picked);
              d.setHours(time.getHours(), time.getMinutes(), 0, 0);
              onChange(d);
            },
          });
        },
      });
    } else {
      setDraft(value);
      setIosOpen(true);
    }
  };
  const text = mode === 'date' ? fmtDate(value) : fmtDateTime(value);
  const button = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${text}`}
      accessibilityHint="Opens a date picker"
      onPress={openPicker}
      style={({ pressed }) => [
        styles.box,
        {
          backgroundColor: pressed ? c.sunk : c.surface,
          borderColor: error ? c.bad : c.line,
          borderWidth: error ? 2 : 1,
        },
      ]}
    >
      <Text style={[styles.text, { color: c.ink }]}>{text}</Text>
    </Pressable>
  );
  return (
    <>
      {bare ? (
        button
      ) : (
        <FieldShell label={label} error={error}>
          {button}
        </FieldShell>
      )}
      {Platform.OS === 'ios' ? (
        <Modal
          visible={iosOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setIosOpen(false)}
        >
          <View style={styles.root}>
            <Pressable
              style={[StyleSheet.absoluteFill, { backgroundColor: c.overlay }]}
              onPress={() => setIosOpen(false)}
            />
            <View
              style={[
                styles.sheet,
                {
                  backgroundColor: c.surface,
                  paddingBottom: insets.bottom + verticalScale(12),
                },
              ]}
            >
              <Text style={[typo.h2, { color: c.ink }]}>{label}</Text>
              <DateTimePicker
                value={draft}
                mode={mode}
                display={mode === 'date' ? 'inline' : 'spinner'}
                minimumDate={minimumDate}
                maximumDate={maximumDate}
                themeVariant={dark ? 'dark' : 'light'}
                accentColor={c.accent}
                locale="en-IN"
                onValueChange={(_e, d) => setDraft(d)}
              />
              <View style={styles.actions}>
                <Button
                  title="Cancel"
                  variant="ghost"
                  onPress={() => setIosOpen(false)}
                  style={{ flex: 1 }}
                />
                <Button
                  title="Done"
                  onPress={() => {
                    onChange(draft);
                    setIosOpen(false);
                  }}
                  style={{ flex: 1 }}
                />
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </>
  );
}
const styles = ScaledSheet.create({
  box: {
    minHeight: MIN_TOUCH,
    borderRadius: radius.control,
    paddingHorizontal: '12@s',
    justifyContent: 'center',
  },
  text: { fontFamily: fonts.mono, fontSize: '15@ms' },
  root: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: '16@ms',
    borderTopRightRadius: '16@ms',
    padding: '20@ms',
    gap: '12@ms',
  },
  actions: { flexDirection: 'row', gap: '12@ms' },
});
