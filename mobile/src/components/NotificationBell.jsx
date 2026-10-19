import React, { useEffect } from 'react';
import { AppState, Pressable, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { ScaledSheet, moderateScale } from 'react-native-size-matters/extend';
import { useUnreadCountQuery } from '../store/api';
import { selectIsSignedIn } from '../store/authSlice';
import { fonts, useTheme } from '../theme';

/** Badge text for the bell: 1–99, then "99+". */
export function badgeLabel(count) {
  return count > 99 ? '99+' : String(count);
}

/**
 * Bell drawn with Views (dome + rim + clapper), like the app's other icons — no emoji/font dependency,
 * so it renders the same on every iOS / Android device.
 */
export function BellIcon({ color, size = 20 }) {
  const k = moderateScale(size) / 20; // drawn at 20 pt, scaled to `size`
  return (
    <View
      style={{ width: 20 * k, height: 20 * k, alignItems: 'center' }}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <View
        style={{
          marginTop: 1 * k,
          width: 14 * k,
          height: 13 * k,
          borderWidth: 2,
          borderBottomWidth: 0,
          borderTopLeftRadius: 7 * k,
          borderTopRightRadius: 7 * k,
          borderColor: color,
        }}
      />
      <View
        style={{
          width: 18 * k,
          height: 2,
          borderRadius: 1,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          marginTop: 1 * k,
          width: 5 * k,
          height: 3 * k,
          borderBottomLeftRadius: 3 * k,
          borderBottomRightRadius: 3 * k,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

/**
 * Bell in the app bar with an amber unread badge. The count comes from GET /api/notifications/unread-count,
 * kept live by `notification:new` / `notification:read` and refreshed when the app returns to the foreground.
 */
export function NotificationBell() {
  const { c } = useTheme();
  const navigation = useNavigation();
  const signedIn = useSelector(selectIsSignedIn);
  const { data: count = 0, refetch } = useUnreadCountQuery(undefined, {
    skip: !signedIn,
  });

  useEffect(() => {
    if (!signedIn) return undefined;
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active') refetch();
    });
    return () => sub.remove();
  }, [signedIn, refetch]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        count > 0 ? `Notifications, ${count} unread` : 'Notifications'
      }
      onPress={() => navigation.navigate('Notifications')}
      hitSlop={6}
      testID="notification-bell"
      style={({ pressed }) => [
        styles.bell,
        { backgroundColor: pressed ? 'rgba(255,255,255,0.10)' : 'transparent' },
      ]}
    >
      <BellIcon color={c.railInk} />
      {count > 0 ? (
        <View
          style={[
            styles.badge,
            { backgroundColor: c.accent, borderColor: c.rail },
          ]}
        >
          <Text style={[styles.badgeText, { color: c.accentInk }]}>
            {badgeLabel(count)}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = ScaledSheet.create({
  bell: {
    width: '36@ms',
    height: '36@ms',
    borderRadius: '18@ms',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: '-2@ms',
    right: '-4@ms',
    minWidth: '18@ms',
    height: '18@ms',
    borderRadius: '9@ms',
    paddingHorizontal: '4@ms',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    includeFontPadding: false,
    fontFamily: fonts.bodySemi,
    fontSize: '10@ms',
    lineHeight: '12@ms',
  },
});
