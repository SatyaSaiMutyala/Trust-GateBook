import React from 'react';
import { Modal, Text, View } from 'react-native';
import { ScaledSheet, moderateScale } from 'react-native-size-matters/extend';
import { fonts, radius, typo, useTheme } from '../theme';
import { Button } from './Button';

/** Upward arrow drawn with Views (the bundled fonts have no arrow glyphs). */
function UpdateArrow({ color }) {
  const s = moderateScale(26);
  return (
    <View style={{ width: s, height: s, alignItems: 'center' }}>
      <View
        style={{
          marginTop: s * 0.08,
          width: s * 0.5,
          height: s * 0.5,
          borderLeftWidth: 3,
          borderTopWidth: 3,
          borderColor: color,
          transform: [{ rotate: '45deg' }],
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: s * 0.14,
          width: 3,
          height: s * 0.8,
          borderRadius: 2,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

/**
 * Blocking "Update required" dialog: no close button, the backdrop isn't pressable and the Android back button does
 * nothing. Its only action opens the Play Store page.
 * Layout is plain flex centring (no absolute-fill layers: inside a transparent Modal those can come out zero-sized
 * on iOS and push the card to the top).
 */
export function ForceUpdateDialog({ visible, storeVersion, onUpdate }) {
  const { c } = useTheme();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {}}
    >
      <View style={[styles.backdrop, { backgroundColor: c.overlay }]}>
        <View
          accessibilityViewIsModal
          accessibilityRole="alert"
          style={[
            styles.card,
            { backgroundColor: c.surface, borderColor: c.line },
          ]}
        >
          <View style={[styles.icon, { backgroundColor: c.accentSoft }]}>
            <UpdateArrow color={c.accentInk} />
          </View>
          <Text
            accessibilityRole="header"
            style={[styles.title, { color: c.ink }]}
          >
            Update required
          </Text>
          <Text style={[typo.body, styles.message, { color: c.muted }]}>
            {storeVersion
              ? `A new version (v${storeVersion}) of TruSentinel is available. Please update to continue using the app.`
              : 'A new version of TruSentinel is available. Please update to continue using the app.'}
          </Text>
          <Button title="Update now" onPress={onUpdate} style={styles.action} />
        </View>
      </View>
    </Modal>
  );
}

const styles = ScaledSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: '24@ms',
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
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  icon: {
    width: '52@ms',
    height: '52@ms',
    borderRadius: '26@ms',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '12@ms',
  },
  title: {
    fontFamily: fonts.display,
    fontSize: '22@ms',
    lineHeight: '26@ms',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  message: { textAlign: 'center', marginTop: '6@ms' },
  action: { alignSelf: 'stretch', marginTop: '18@ms' },
});
