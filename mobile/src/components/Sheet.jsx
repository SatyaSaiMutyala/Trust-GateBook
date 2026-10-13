import React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, useTheme } from '../theme';
import { ScaledSheet, verticalScale } from 'react-native-size-matters/extend';

/** Bottom-sheet modal shell: dimmed backdrop (tap to close), grabber, keyboard-aware scrolling body. */
export function Sheet({ visible = true, onClose, children }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.root}
      >
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: c.overlay }]}
          onPress={onClose}
          accessibilityLabel="Cancel"
        />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: c.surface,
              paddingBottom: insets.bottom + verticalScale(16),
            },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: c.line }]} />
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.body}
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = ScaledSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: '20@s',
    paddingTop: '8@vs',
    maxHeight: '92%',
  },
  grabber: {
    alignSelf: 'center',
    width: '40@s',
    height: '4@vs',
    borderRadius: '2@ms',
    marginBottom: '12@vs',
  },
  body: { gap: '14@ms' },
});
