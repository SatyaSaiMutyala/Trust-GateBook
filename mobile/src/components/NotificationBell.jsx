import React, { useEffect } from 'react';
import { AppState, Pressable, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { ScaledSheet } from 'react-native-size-matters/extend';
import { useUnreadCountQuery } from '../store/api';
import { selectIsSignedIn } from '../store/authSlice';
import { fonts, useTheme } from '../theme';

/** Badge text for the bell: 1–99, then "99+". */
export function badgeLabel(count) {
  return count > 99 ? '99+' : String(count);
}

/**
 * 🔔 in the app bar with an amber unread badge. The count comes from GET /api/notifications/unread-count,
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
      <Text style={styles.icon}>🔔</Text>
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
  icon: { includeFontPadding: false, fontSize: '18@ms', lineHeight: '22@ms' },
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
