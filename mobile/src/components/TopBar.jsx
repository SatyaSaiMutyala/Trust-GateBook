import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, MIN_TOUCH, radius, useTheme } from '../theme';
import { BrandMark } from './BrandMark';
import { NotificationBell } from './NotificationBell';
import {
  ScaledSheet,
  moderateScale,
  verticalScale,
} from 'react-native-size-matters/extend';

/**
 * App bar on the dark rail: the screen title on the left (after the Gatebook mark, or a back
 * button on pushed screens), then the notifications bell (`showBell`) and the screen's own actions
 * (`right`, e.g. Export). Screens provide title / subtitle / actions through navigation options —
 * see RootNavigator.
 */
export function TopBar({
  onBack,
  title,
  subtitle,
  right,
  showBell = false,
  logoUrl = null,
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: c.rail, paddingTop: insets.top + verticalScale(6) },
      ]}
    >
      {onBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={onBack}
          hitSlop={8}
          style={({ pressed }) => [
            styles.back,
            { backgroundColor: pressed ? '#1E2E28' : 'transparent' },
          ]}
        >
          <Text style={[styles.backText, { color: c.railInk }]}>‹</Text>
        </Pressable>
      ) : (
        // Company logo (Settings → Company) or the Gatebook mark, on a small white tile.
        <BrandMark size={28} logoUrl={logoUrl} />
      )}
      <View style={styles.titles}>
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          style={[styles.title, { color: c.railInk }]}
        >
          {title ?? 'Gatebook'}
        </Text>
        {subtitle ? (
          <Text
            numberOfLines={1}
            style={[styles.subtitle, { color: c.railMuted }]}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {showBell || right ? (
        <View style={styles.actions}>
          {showBell ? <NotificationBell /> : null}
          {right}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Button sized and coloured for the dark app bar. `primary` = amber (the screen's main action),
 * otherwise an outlined light button.
 */
export function HeaderButton({
  title,
  onPress,
  loading,
  primary,
  accessibilityLabel,
}) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ busy: !!loading, disabled: !!loading }}
      disabled={loading}
      onPress={onPress}
      hitSlop={moderateScale(6)}
      style={({ pressed }) => [
        styles.hbtn,
        primary
          ? { backgroundColor: c.accent, borderColor: c.accent }
          : {
              backgroundColor: pressed
                ? 'rgba(255,255,255,0.10)'
                : 'transparent',
              borderColor: 'rgba(221,229,225,0.35)',
            },
        pressed && primary && { opacity: 0.85 },
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={primary ? c.accentInk : c.railInk}
        />
      ) : (
        <Text
          numberOfLines={1}
          style={[
            styles.hbtnText,
            { color: primary ? c.accentInk : c.railInk },
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

/** Small light text on the app bar's right (e.g. live clock, a count). */
export function HeaderText({ children, accessibilityLabel, tone }) {
  const { c } = useTheme();
  return (
    <Text
      accessibilityLabel={accessibilityLabel}
      style={[styles.htext, { color: tone === 'ok' ? '#6FD39B' : c.railInk }]}
    >
      {children}
    </Text>
  );
}

const styles = ScaledSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: '16@s',
    paddingBottom: '10@vs',
    gap: '10@ms',
    minHeight: '44@ms',
  },
  back: {
    width: '36@ms',
    height: '36@ms',
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: '-8@s',
  },
  backText: {
    includeFontPadding: false,
    fontSize: '26@ms',
    lineHeight: '28@ms',
  },
  titles: { flex: 1, minWidth: 0 },
  title: {
    includeFontPadding: false,
    fontFamily: fonts.display,
    fontSize: '20@ms',
    lineHeight: '23@ms',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  subtitle: {
    includeFontPadding: false,
    fontFamily: fonts.body,
    fontSize: '11@ms',
    lineHeight: '14@ms',
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: '8@ms' },
  hbtn: {
    minHeight: '32@ms',
    minWidth: MIN_TOUCH,
    paddingHorizontal: '12@s',
    borderRadius: radius.control,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hbtnText: {
    includeFontPadding: false,
    fontFamily: fonts.bodySemi,
    fontSize: '13@ms',
  },
  htext: {
    includeFontPadding: false,
    fontFamily: fonts.mono,
    fontSize: '13@ms',
  },
});
