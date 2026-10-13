import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { fonts, radius, useTheme } from '../theme';
import { DropdownMenu, measureAnchor } from './DropdownMenu';
import {
  ScaledSheet,
  moderateScale,
  scale,
} from 'react-native-size-matters/extend';

const BAR_H = moderateScale(40);
const PILL_H = moderateScale(32);

/**
 * Pinned top area of a list screen: title row, search, tabs. Sits above the FlatList (not inside it)
 * so the filters stay in reach while the list scrolls underneath.
 */
export function FilterBar({ children }) {
  const { c } = useTheme();
  return (
    <View
      style={[styles.bar, { backgroundColor: c.bg, borderBottomColor: c.line }]}
    >
      {children}
    </View>
  );
}

/** Magnifier drawn with Views (no icon font / svg dependency). */
function SearchIcon({ color }) {
  const s = moderateScale(16);
  return (
    <View style={{ width: s, height: s }}>
      <View
        style={{
          width: s * 0.72,
          height: s * 0.72,
          borderRadius: s,
          borderWidth: 2,
          borderColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: s * 0.4,
          height: 2,
          borderRadius: 1,
          backgroundColor: color,
          right: -s * 0.02,
          bottom: s * 0.12,
          transform: [{ rotate: '45deg' }],
        }}
      />
    </View>
  );
}

/**
 * Search input with icon and clear button. `right` docks a compact control (e.g. a FilterSelect)
 * at the end of the same row.
 */
export function SearchBar({ value, onChangeText, placeholder, label, right }) {
  const { c, dark } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.searchRow}>
      <View
        style={[
          styles.search,
          {
            backgroundColor: c.surface,
            borderColor: focused ? c.accent : c.line,
          },
        ]}
      >
        <SearchIcon color={focused ? c.ink : c.muted} />
        <TextInput
          accessibilityLabel={label ?? placeholder}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={c.muted}
          keyboardAppearance={dark ? 'dark' : 'light'}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[styles.searchInput, { color: c.ink }]}
        />
        {value ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            hitSlop={10}
            onPress={() => onChangeText('')}
            style={[styles.clear, { backgroundColor: c.sunk }]}
          >
            <Text style={[styles.clearText, { color: c.muted }]}>✕</Text>
          </Pressable>
        ) : null}
      </View>
      {right}
    </View>
  );
}

/**
 * Horizontally scrolling pill tabs. Options: `{ value, label, count?, tone?: 'bad', a11y? }`.
 * The selected pill is filled; counts show as small badges; the selected tab is kept in view.
 */
export function FilterTabs({ options, value, onChange, accessibilityLabel }) {
  const { c } = useTheme();
  const scrollRef = useRef(null);
  const layouts = useRef({});
  const scrollToSelected = useCallback(() => {
    const l = layouts.current[value];
    if (l)
      scrollRef.current?.scrollTo({
        x: Math.max(0, l.x - scale(16)),
        animated: true,
      });
  }, [value]);
  useEffect(scrollToSelected, [scrollToSelected]);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      contentContainerStyle={styles.tabs}
      style={styles.tabsScroll}
    >
      {options.map(o => {
        const selected = o.value === value;
        const hasCount = typeof o.count === 'number';
        const hot = o.tone === 'bad' && o.count > 0;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={
              o.a11y ?? (hasCount ? `${o.label}, ${o.count}` : o.label)
            }
            onLayout={e => {
              layouts.current[o.value] = e.nativeEvent.layout;
            }}
            onPress={() => onChange(o.value)}
            style={({ pressed }) => [
              styles.pill,
              {
                backgroundColor: selected
                  ? c.ink
                  : pressed
                  ? c.sunk
                  : c.surface,
                borderColor: selected ? c.ink : c.line,
              },
            ]}
          >
            <Text
              numberOfLines={1}
              style={[
                styles.pillText,
                {
                  color: selected ? c.onInk : c.ink,
                  fontFamily: selected ? fonts.bodySemi : fonts.bodyMedium,
                },
              ]}
            >
              {o.label}
            </Text>
            {hasCount ? (
              <View
                style={[
                  styles.count,
                  {
                    backgroundColor: hot ? c.bad : selected ? c.accent : c.sunk,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.countText,
                    {
                      color: hot ? '#FFFFFF' : selected ? c.accentInk : c.muted,
                    },
                  ]}
                >
                  {o.count > 999 ? '999+' : o.count}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/**
 * Compact filter button ("Status ▾" / "Inside ▾") that opens an attached option list.
 * Highlighted when its value differs from `defaultValue`, so an active filter is obvious.
 * Shows `label` while at the default, unless `showValue` (always show the chosen option).
 */
export function FilterSelect({
  label,
  value,
  options,
  onChange,
  defaultValue,
  showValue,
}) {
  const { c } = useTheme();
  const ref = useRef(null);
  const [anchor, setAnchor] = useState(null);
  const close = useCallback(() => setAnchor(null), []);
  const current = options.find(o => o.value === value);
  const active = defaultValue !== undefined && value !== defaultValue;
  const open = !!anchor;
  return (
    <>
      <Pressable
        ref={ref}
        collapsable={false}
        accessibilityRole="combobox"
        accessibilityLabel={`${label}: ${current?.label ?? ''}`}
        accessibilityState={{ expanded: open }}
        onPress={() => measureAnchor(ref, setAnchor)}
        style={({ pressed }) => [
          styles.select,
          {
            backgroundColor: active
              ? c.accentSoft
              : pressed
              ? c.sunk
              : c.surface,
            borderColor: open || active ? c.accent : c.line,
          },
          open && styles.selectOpen,
        ]}
      >
        <Text numberOfLines={1} style={[styles.selectText, { color: c.ink }]}>
          {active || showValue ? current?.short ?? current?.label : label}
        </Text>
        <Text style={[styles.caret, { color: c.muted }]}>
          {open ? '▴' : '▾'}
        </Text>
      </Pressable>
      {open ? (
        <DropdownMenu
          anchor={anchor}
          options={options}
          value={value}
          onSelect={onChange}
          onClose={close}
          minWidth={scale(170)}
        />
      ) : null}
    </>
  );
}

const styles = ScaledSheet.create({
  bar: {
    paddingHorizontal: '16@s',
    paddingTop: '12@vs',
    paddingBottom: '10@vs',
    gap: '10@ms',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: '8@ms' },
  search: {
    flex: 1,
    height: BAR_H,
    borderWidth: 1,
    borderRadius: radius.control,
    paddingLeft: '10@s',
    paddingRight: '6@s',
    flexDirection: 'row',
    alignItems: 'center',
    gap: '8@ms',
  },
  searchInput: {
    includeFontPadding: false,
    flex: 1,
    height: '100%',
    paddingVertical: 0,
    fontFamily: fonts.body,
    fontSize: '14@ms',
  },
  clear: {
    width: '22@ms',
    height: '22@ms',
    borderRadius: '11@ms',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearText: { fontSize: '11@ms', lineHeight: '13@ms' },
  tabsScroll: { flexGrow: 0, marginHorizontal: '-16@s' },
  tabs: { paddingHorizontal: '16@s', gap: '6@ms', alignItems: 'center' },
  pill: {
    height: PILL_H,
    borderWidth: 1,
    borderRadius: PILL_H / 2,
    paddingHorizontal: '12@s',
    flexDirection: 'row',
    alignItems: 'center',
    gap: '6@ms',
  },
  pillText: { includeFontPadding: false, fontSize: '13@ms' },
  count: {
    minWidth: '18@ms',
    height: '18@ms',
    borderRadius: '9@ms',
    paddingHorizontal: '5@ms',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    includeFontPadding: false,
    fontFamily: fonts.mono,
    fontSize: '10@ms',
  },
  select: {
    height: BAR_H,
    maxWidth: '130@s',
    borderWidth: 1,
    borderRadius: radius.control,
    paddingHorizontal: '10@s',
    flexDirection: 'row',
    alignItems: 'center',
    gap: '6@ms',
  },
  selectOpen: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  selectText: {
    includeFontPadding: false,
    flexShrink: 1,
    fontFamily: fonts.bodyMedium,
    fontSize: '13@ms',
  },
  caret: { fontSize: '12@ms' },
});
