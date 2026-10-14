import React, { forwardRef } from 'react';
import { Text, TextInput, View } from 'react-native';
import { font, fonts, MIN_TOUCH, radius, useTheme } from '../theme';
import {
  ScaledSheet,
  moderateScale,
  verticalScale,
} from 'react-native-size-matters/extend';
export function FieldShell({
  label,
  required,
  error,
  hint,
  hintTone = 'muted',
  style,
  children,
  below,
}) {
  const { c } = useTheme();
  const toneColor =
    hintTone === 'bad' ? c.bad : hintTone === 'warn' ? c.warn : c.muted;
  return (
    <View style={[styles.wrap, style]}>
      <Text style={[styles.label, { color: error ? c.bad : c.muted }]}>
        {label}
        {required ? <Text style={{ color: c.bad }}> *</Text> : null}
      </Text>
      {below ? (
        // Attached to the control (e.g. type-ahead suggestions): no gap between them.
        <View>
          {children}
          {below}
        </View>
      ) : (
        children
      )}
      {hint ? (
        <Text style={[styles.hint, { color: toneColor }]}>{hint}</Text>
      ) : null}
    </View>
  );
}
export const Field = forwardRef(function Field(
  {
    label,
    required,
    error,
    hint,
    hintTone,
    mono,
    large,
    style,
    multiline,
    dropdown,
    ...rest
  },
  ref,
) {
  const { c, dark } = useTheme();
  const attached = !!dropdown;
  return (
    <FieldShell
      label={label}
      required={required}
      error={error}
      hint={hint}
      hintTone={hintTone}
      style={style}
      below={dropdown ? <DropdownPanel>{dropdown}</DropdownPanel> : null}
    >
      <TextInput
        ref={ref}
        accessibilityLabel={rest.accessibilityLabel ?? label}
        placeholderTextColor={c.muted}
        keyboardAppearance={dark ? 'dark' : 'light'}
        multiline={multiline}
        style={[
          styles.input,
          {
            color: c.ink,
            backgroundColor: c.surface,
            borderColor: error ? c.bad : attached ? c.accent : c.line,
            borderWidth: error ? 2 : 1,
            fontFamily: mono ? fonts.mono : fonts.body,
            fontSize: large ? moderateScale(26) : font.input,
            minHeight: large
              ? moderateScale(60)
              : multiline
              ? verticalScale(88)
              : MIN_TOUCH,
            textAlignVertical: multiline ? 'top' : 'center',
            // Android's EditText adds its own vertical padding (and font padding), which pushes
            // single-line text above centre; zero both so the text sits in the middle of the box.
            paddingTop: multiline ? verticalScale(10) : 0,
            paddingBottom: multiline ? verticalScale(10) : 0,
            letterSpacing: large ? 2 : 0,
          },
          attached && styles.inputJoined,
        ]}
        {...rest}
      />
    </FieldShell>
  );
});
/** Suggestion list hanging off the bottom edge of an input (see Field's `dropdown` prop). */
function DropdownPanel({ children }) {
  const { c } = useTheme();
  return (
    <View
      style={[
        styles.dropdown,
        { backgroundColor: c.surface, borderColor: c.accent },
      ]}
    >
      {children}
    </View>
  );
}

const styles = ScaledSheet.create({
  wrap: { gap: '6@ms' },
  label: { fontFamily: fonts.bodySemi, fontSize: '13@ms', lineHeight: '18@ms' },
  hint: { fontFamily: fonts.body, fontSize: '13@ms', lineHeight: '18@ms' },
  input: {
    borderRadius: radius.control,
    paddingHorizontal: '12@s',
    includeFontPadding: false,
  },
  inputJoined: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  dropdown: {
    marginTop: -1,
    borderWidth: 1,
    borderBottomLeftRadius: radius.control,
    borderBottomRightRadius: radius.control,
    overflow: 'hidden',
  },
});
