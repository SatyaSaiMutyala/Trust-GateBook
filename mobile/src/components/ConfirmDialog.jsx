import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { fonts, radius, typo, useTheme } from '../theme';
import { Button } from './Button';
import { ScaledSheet, moderateScale } from 'react-native-size-matters/extend';

/**
 * Confirmation dialog in the app's own style (replaces the system Alert): centred card on the
 * dark overlay, display-font title, body text, and Cancel + confirm buttons from the app's Button.
 * `tone="danger"` gives a red icon and a solid red confirm button (sign out, delete…).
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
}) {
  const { c } = useTheme();
  const danger = tone === 'danger';
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <View style={styles.root}>
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
              { backgroundColor: danger ? c.badSoft : c.accentSoft },
            ]}
          >
            <Text
              style={[styles.iconText, { color: danger ? c.bad : c.accentInk }]}
            >
              {danger ? '!' : '?'}
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
          <View style={styles.actions}>
            <Button
              title={cancelLabel}
              variant="ghost"
              onPress={onCancel}
              disabled={loading}
              style={styles.action}
            />
            <Button
              title={confirmLabel}
              variant={danger ? 'destructive' : 'primary'}
              onPress={onConfirm}
              loading={loading}
              style={styles.action}
            />
          </View>
        </View>
      </View>
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
  title: {
    fontFamily: fonts.display,
    fontSize: '22@ms',
    lineHeight: '26@ms',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  message: { textAlign: 'center', marginTop: moderateScale(6) },
  actions: {
    flexDirection: 'row',
    gap: '10@ms',
    marginTop: '20@ms',
    alignSelf: 'stretch',
  },
  action: { flex: 1 },
});
