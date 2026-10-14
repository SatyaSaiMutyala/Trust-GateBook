import React, { useMemo } from 'react';

const ZERO_COUNTS = { lodged: 0, handed: 0, disputed: 0 };
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, useTheme } from '../theme';
import { useSelector } from 'react-redux';
import { useInsideCountQuery, useMailCountsQuery } from '../store/api';
import { selectIsEmployee, selectIsGateUser } from '../store/authSlice';
import { TabIcon } from './TabIcons';
import { ScaledSheet, verticalScale } from 'react-native-size-matters/extend';

const META = {
  Inside: { label: 'Inside now', icon: 'inside' },
  Post: { label: 'Post', icon: 'mail' },
  CheckIn: { label: 'Check in', icon: 'plus' },
  Log: { label: 'Log', icon: 'log' },
  MyPost: { label: 'My post', icon: 'mail' },
  Account: { label: 'Account', icon: 'settings' },
};

/**
 * Bottom tabs. Gate users: Inside now · Post · raised amber Check in · Log · Account.
 * Employees: My post · Account. Badges: Inside (green count), Post (lodged count, amber when there are disputes),
 * My post (lodged + handed, amber).
 */
export function TabBar({ state, navigation }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const gateUser = useSelector(selectIsGateUser);
  const employee = useSelector(selectIsEmployee);
  // Employees have no visitor access, so the inside count is only fetched for gate users.
  const { data: inside = 0 } = useInsideCountQuery(undefined, {
    skip: !gateUser,
  });
  const scope = useMemo(
    () => (employee ? { recipient: 'me' } : {}),
    [employee],
  );
  const { data: counts = ZERO_COUNTS } = useMailCountsQuery(scope);

  const badgeFor = name => {
    if (name === 'Inside')
      return inside > 0
        ? {
            n: inside,
            bg: c.ok,
            fg: '#FFFFFF',
            a11y: `${inside} visitors inside`,
          }
        : null;
    if (name === 'Post') {
      if (!counts.lodged && !counts.disputed) return null;
      const amber = counts.disputed > 0;
      return {
        n: counts.lodged || '!',
        bg: amber ? c.accent : c.ink,
        fg: amber ? c.accentInk : c.onInk,
        a11y: `${counts.lodged} to collect${
          amber ? `, ${counts.disputed} issues` : ''
        }`,
      };
    }
    if (name === 'MyPost') {
      const n = counts.lodged + counts.handed;
      return n > 0
        ? { n, bg: c.accent, fg: c.accentInk, a11y: `${n} items for you` }
        : null;
    }
    return null;
  };

  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.bar,
        {
          backgroundColor: c.surface,
          borderTopColor: c.line,
          paddingBottom: Math.max(insets.bottom, verticalScale(6)),
        },
      ]}
    >
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const meta = META[route.name] ?? { label: route.name, icon: 'log' };
        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented)
            navigation.navigate(route.name, route.params);
        };
        const onLongPress = () =>
          navigation.emit({ type: 'tabLongPress', target: route.key });

        if (route.name === 'CheckIn') {
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel="Check in a visitor"
              onPress={onPress}
              onLongPress={onLongPress}
              style={styles.item}
            >
              <View
                style={[
                  styles.bubble,
                  {
                    backgroundColor: c.accent,
                    // Active: amber-tinted ring around the bubble; otherwise it blends into the bar.
                    borderColor: focused ? c.accentSoft : c.surface,
                    shadowColor: '#000',
                  },
                ]}
              >
                <TabIcon
                  name="plus"
                  color={c.accentInk}
                  bg={c.accent}
                  size={24}
                />
              </View>
              <Text
                style={[
                  styles.label,
                  {
                    color: focused ? c.ink : c.faint,
                    fontFamily: focused ? fonts.bodySemi : fonts.bodyMedium,
                  },
                ]}
              >
                {meta.label}
              </Text>
            </Pressable>
          );
        }

        const color = focused ? c.ink : c.faint;
        const badge = badgeFor(route.name);
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={
              badge ? `${meta.label}, ${badge.a11y}` : meta.label
            }
            onPress={onPress}
            onLongPress={onLongPress}
            style={styles.item}
          >
            <View
              style={[
                styles.iconWrap,
                focused && { backgroundColor: c.accentSoft },
              ]}
            >
              <TabIcon
                name={meta.icon}
                color={color}
                bg={focused ? c.accentSoft : c.surface}
              />
              {badge ? (
                <View
                  style={[
                    styles.badge,
                    { backgroundColor: badge.bg, borderColor: c.surface },
                  ]}
                >
                  <Text style={[styles.badgeText, { color: badge.fg }]}>
                    {typeof badge.n === 'number' && badge.n > 99
                      ? '99+'
                      : badge.n}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text
              style={[
                styles.label,
                {
                  color,
                  fontFamily: focused ? fonts.bodySemi : fonts.bodyMedium,
                },
              ]}
            >
              {meta.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = ScaledSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: '6@vs',
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    minHeight: '48@vs',
    gap: '3@ms',
  },
  // Pill behind the icon; tinted only on the active tab.
  iconWrap: {
    width: '52@ms',
    height: '28@ms',
    borderRadius: '14@ms',
    // Android draws the tint as a square when it's toggled on after mount unless the view clips to its radius.
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    includeFontPadding: false,
    textAlign: 'center',
    fontSize: '10@ms',
    lineHeight: '13@ms',
  },
  bubble: {
    width: '48@ms',
    height: '48@ms',
    borderRadius: '24@ms',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: '-18@vs',
    borderWidth: 3,
    shadowOpacity: 0.25,
    shadowRadius: '8@ms',
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  badge: {
    position: 'absolute',
    top: '-6@vs',
    right: '2@s',
    minWidth: '20@ms',
    height: '20@ms',
    borderRadius: '10@ms',
    paddingHorizontal: '5@s',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    includeFontPadding: false,
    fontFamily: fonts.bodySemi,
    fontSize: '11@ms',
    lineHeight: '13@ms',
  },
});
