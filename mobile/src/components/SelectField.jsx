import React, { useCallback, useRef, useState } from 'react';
import { Pressable, Text, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, MIN_TOUCH, radius, useTheme } from '../theme';
import { FieldShell } from './Field';
import { DropdownMenu, measureAnchor, placeDropdown } from './DropdownMenu';
import { ScaledSheet } from 'react-native-size-matters/extend';

/** Select whose option list opens attached to the field (below it, or above when there's no room). */
export function SelectField({
  label,
  value,
  options,
  onChange,
  placeholder = 'Select',
  required,
  error,
  bare,
  style,
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const boxRef = useRef(null);
  const [anchor, setAnchor] = useState(null);
  const open = !!anchor;
  const close = useCallback(() => setAnchor(null), []);
  const current = options.find(o => o.value === value);
  const up = open && placeDropdown(anchor, options.length, winH, insets).up;

  const button = (
    <Pressable
      ref={boxRef}
      collapsable={false}
      accessibilityRole="combobox"
      accessibilityLabel={`${label}: ${current?.label ?? placeholder}`}
      accessibilityState={{ expanded: open }}
      accessibilityHint="Opens a list of choices below the field"
      onPress={() => measureAnchor(boxRef, setAnchor)}
      style={({ pressed }) => [
        styles.box,
        {
          backgroundColor: pressed ? c.sunk : c.surface,
          borderColor: error ? c.bad : open ? c.accent : c.line,
          borderWidth: error ? 2 : 1,
        },
        open && (up ? styles.joinedTop : styles.joinedBottom),
        bare && style,
      ]}
    >
      <Text
        numberOfLines={1}
        style={[styles.text, { color: current ? c.ink : c.muted }]}
      >
        {current?.label ?? placeholder}
      </Text>
      <Text style={[styles.caret, { color: open ? c.ink : c.muted }]}>
        {open && !up ? '▴' : '▾'}
      </Text>
    </Pressable>
  );
  return (
    <>
      {bare ? (
        button
      ) : (
        <FieldShell
          label={label}
          required={required}
          error={error}
          style={style}
        >
          {button}
        </FieldShell>
      )}
      {open ? (
        <DropdownMenu
          anchor={anchor}
          options={options}
          value={value}
          onSelect={onChange}
          onClose={close}
        />
      ) : null}
    </>
  );
}
const styles = ScaledSheet.create({
  box: {
    minHeight: MIN_TOUCH,
    borderRadius: radius.control,
    paddingHorizontal: '12@s',
    flexDirection: 'row',
    alignItems: 'center',
    gap: '8@ms',
  },
  // Square off the side the open list is attached to.
  joinedBottom: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  joinedTop: { borderTopLeftRadius: 0, borderTopRightRadius: 0 },
  text: { flex: 1, fontFamily: fonts.body, fontSize: '15@ms' },
  caret: { fontSize: '14@ms' },
});
