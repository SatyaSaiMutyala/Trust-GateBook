import React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { fonts, radius, typo, useTheme } from '../theme';
import { Button } from './Button';
import { ScaledSheet, moderateScale } from 'react-native-size-matters/extend';

/**
 * Confirmation dialog in the app's own style (replaces the system Alert): centred card on the
 * dark overlay, display-font title, body text, and Cancel + confirm buttons from the app's Button.
 * `tone="danger"` gives a red icon and a solid red confirm button (sign out, delete…);
 * `tone="success"` a green tick (info/success notices — pair with `hideCancel`).
 * `children` render under the message (e.g. a password field, an inline error).
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  loading,
  onConfirm,
  onCancel,
  hideCancel = false,
  children,
}) {
  const { c } = useTheme();
  const danger = tone === 'danger';
  const success = tone === 'success';
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      {/* Keyboard-aware so a field in `children` (e.g. password) stays visible. */}
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: c.overlay }]}
          onPress={onCancel}
          accessibilityLabel={cancelLabel}
        />
        <View
          accessibilityViewIsModal
          accessibilityRole="alert"
          style={[
            styles.card,
            { backgroundColor: c.surface, borderColor: c.line },
          ]}
        >
          <View
            style={[
              styles.icon,
              {
                backgroundColor: danger
                  ? c.badSoft
                  : success
                  ? c.okSoft
                  : c.accentSoft,
              },
            ]}
          >
            <Text
              style={[
                // ✓ isn't in the bundled Barlow fonts (it would show "?"), so the success tick uses the system font.
                success ? styles.iconSymbol : styles.iconText,
                { color: danger ? c.bad : success ? c.ok : c.accentInk },
              ]}
            >
              {danger ? '!' : success ? '✓' : '?'}
            </Text>
          </View>
          <Text
            accessibilityRole="header"
            style={[styles.title, { color: c.ink }]}
          >
            {title}
          </Text>
          {message ? (
            <Text style={[typo.body, styles.message, { color: c.muted }]}>
              {message}
            </Text>
          ) : null}
          {children ? <View style={styles.extra}>{children}</View> : null}
          <View style={styles.actions}>
            {hideCancel ? null : (
              <Button
                title={cancelLabel}
                variant="ghost"
                onPress={onCancel}
                disabled={loading}
                style={styles.action}
              />
            )}
            <Button
              title={confirmLabel}
              variant={danger ? 'destructive' : 'primary'}
              onPress={onConfirm}
              loading={loading}
              style={styles.action}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = ScaledSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24@ms',
  },
  card: {
    width: '100%',
    maxWidth: '360@ms',
    borderWidth: 1,
    borderRadius: radius.sheet,
    paddingHorizontal: '20@ms',
    paddingTop: '22@ms',
    paddingBottom: '18@ms',
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: '16@ms',
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  icon: {
    width: '44@ms',
    height: '44@ms',
    borderRadius: '22@ms',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '12@ms',
  },
  iconText: {
    fontFamily: fonts.display,
    fontSize: '24@ms',
    lineHeight: '28@ms',
  },
  iconSymbol: { fontSize: '22@ms', lineHeight: '28@ms', fontWeight: '700' },
  title: {
    fontFamily: fonts.display,
    fontSize: '22@ms',
    lineHeight: '26@ms',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  message: { textAlign: 'center', marginTop: moderateScale(6) },
  extra: { alignSelf: 'stretch', gap: '10@ms', marginTop: '14@ms' },
  actions: {
    flexDirection: 'row',
    gap: '10@ms',
    marginTop: '20@ms',
    alignSelf: 'stretch',
  },
  action: { flex: 1 },
});
