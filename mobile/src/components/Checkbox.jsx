import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { MIN_TOUCH, typo, useTheme } from '../theme';
import { ScaledSheet } from 'react-native-size-matters/extend';

export function Checkbox({ checked, onChange, label, children, disabled }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: !!disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      style={[styles.row, disabled && { opacity: 0.5 }]}
    >
      <View
        style={[
          styles.box,
          {
            borderColor: checked ? c.accent : c.line,
            backgroundColor: checked ? c.accent : c.surface,
          },
        ]}
      >
        {checked ? (
          <Text style={{ color: c.accentInk, fontWeight: '700' }}>✓</Text>
        ) : null}
      </View>
      <Text style={[typo.body, { color: c.ink, flex: 1 }]}>
        {children ?? label}
      </Text>
    </Pressable>
  );
}

const styles = ScaledSheet.create({
  row: {
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
});
