import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { fonts, MIN_TOUCH, radius, useTheme } from '../theme';
import { ScaledSheet } from 'react-native-size-matters/extend';
/** Single-select chip buttons (purpose, quick exit times). */
export function ChipSelect({
  options,
  value,
  onChange,
  error,
  accessibilityLabel,
}) {
  const { c } = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={styles.wrap}
    >
      {options.map(o => {
        const selected = o === value;
        return (
          <Pressable
            key={o}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(o)}
            style={({ pressed }) => [
              styles.chip,
              {
                backgroundColor: selected
                  ? c.ink
                  : pressed
                  ? c.sunk
                  : c.surface,
                borderColor: selected ? c.ink : error ? c.bad : c.line,
              },
            ]}
          >
            <Text style={[styles.text, { color: selected ? c.onInk : c.ink }]}>
              {o}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
const styles = ScaledSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: '8@ms' },
  chip: {
    minHeight: MIN_TOUCH,
    borderRadius: radius.chip,
    borderWidth: 1,
    paddingHorizontal: '14@s',
    justifyContent: 'center',
  },
  text: { fontFamily: fonts.bodyMedium, fontSize: '14@ms' },
});
