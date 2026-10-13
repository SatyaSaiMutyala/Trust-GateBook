import React from 'react';
import { ActivityIndicator, Pressable, Text } from 'react-native';
import { fonts, MIN_TOUCH, radius, useTheme } from '../theme';
import {
  ScaledSheet,
  moderateScale,
  scale,
} from 'react-native-size-matters/extend';
export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled,
  loading,
  style,
  accessibilityLabel,
  icon,
}) {
  const { c } = useTheme();
  const palette = {
    primary: { bg: c.accent, fg: c.accentInk, border: c.accent },
    exit: { bg: c.ink, fg: c.onInk, border: c.ink },
    ghost: { bg: 'transparent', fg: c.ink, border: c.line },
    danger: { bg: 'transparent', fg: c.bad, border: c.bad },
    destructive: { bg: c.bad, fg: '#FFFFFF', border: c.bad },
    ok: { bg: c.ok, fg: '#FFFFFF', border: c.ok },
  }[variant];
  const height =
    size === 'lg'
      ? moderateScale(46)
      : size === 'sm'
      ? moderateScale(34)
      : MIN_TOUCH;
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      hitSlop={size === 'sm' ? moderateScale(6) : moderateScale(2)}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: height,
          backgroundColor: palette.bg,
          borderColor: palette.border,
          opacity: inactive ? 0.55 : pressed ? 0.85 : 1,
          paddingHorizontal: size === 'sm' ? scale(12) : scale(16),
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={palette.fg} size="small" /> : icon}
      <Text
        numberOfLines={1}
        style={[
          styles.text,
          {
            color: palette.fg,
            fontSize:
              size === 'lg'
                ? moderateScale(15)
                : size === 'sm'
                ? moderateScale(13)
                : moderateScale(14),
          },
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}
const styles = ScaledSheet.create({
  base: {
    borderRadius: radius.control,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: '8@ms',
  },
  text: { fontFamily: fonts.bodySemi, includeFontPadding: false },
});
