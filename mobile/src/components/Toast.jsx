import React, { useEffect, useState } from 'react';
import { Animated, Text, View } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScaledSheet, verticalScale } from 'react-native-size-matters/extend';
import { selectToast, toastDismissed } from '../store/uiSlice';
import { fonts, radius, useTheme } from '../theme';

/** Renders `ui.toast` (dispatch `toastShown(message, kind)`), auto-dismissing after 3.2 s. */
export function ToastHost() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch();
  const toast = useSelector(selectToast);
  const [opacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!toast) return undefined;
    opacity.setValue(0);
    Animated.timing(opacity, {
      toValue: 1,
      duration: 160,
      useNativeDriver: true,
    }).start();
    const t = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }).start(() => dispatch(toastDismissed(toast.id)));
    }, 3200);
    return () => clearTimeout(t);
  }, [toast, opacity, dispatch]);

  if (!toast) return null;
  return (
    <View
      pointerEvents="none"
      style={[styles.wrap, { bottom: insets.bottom + verticalScale(92) }]}
    >
      <Animated.View
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        style={[
          styles.toast,
          { opacity, backgroundColor: toast.kind === 'error' ? c.bad : c.rail },
        ]}
      >
        <Text
          style={[
            styles.text,
            { color: toast.kind === 'error' ? '#FFFFFF' : c.railInk },
          ]}
        >
          {toast.message}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = ScaledSheet.create({
  wrap: {
    position: 'absolute',
    left: '16@s',
    right: '16@s',
    alignItems: 'center',
  },
  toast: {
    borderRadius: radius.control,
    paddingHorizontal: '16@s',
    paddingVertical: '12@vs',
    maxWidth: '480@s',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: '10@ms',
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  text: {
    fontFamily: fonts.bodyMedium,
    fontSize: '14@ms',
    lineHeight: '19@ms',
  },
});
