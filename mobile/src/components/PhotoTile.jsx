import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, typo, useTheme } from '../theme';
import { ScaledSheet, moderateScale } from 'react-native-size-matters/extend';

/**
 * Dashed camera tile (visitor photo, ID proof, post cover, delivery person). Tapping a filled tile retakes.
 * `aspect` fixes the shape; `fill` instead stretches the tile to its container's height (flex: 1).
 */
export function PhotoTile({
  label,
  sub,
  uri,
  aspect,
  onPress,
  error,
  required,
  fill = false,
}) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        uri ? `${label}. Taken. Tap to retake.` : `${label}. ${sub}`
      }
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        {
          ...(fill ? { flex: 1 } : { aspectRatio: aspect }),
          borderColor: error ? c.bad : uri ? c.line : c.muted,
          borderStyle: uri ? 'solid' : 'dashed',
          borderWidth: error ? 2 : 1.5,
          backgroundColor: pressed ? c.line : c.sunk,
        },
      ]}
    >
      {uri ? (
        <>
          <Image
            source={{ uri }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
          <View style={[styles.retake, { backgroundColor: c.overlay }]}>
            <Text style={[typo.label, { color: '#FFFFFF' }]}>Retake</Text>
          </View>
        </>
      ) : (
        <View
          style={{
            alignItems: 'center',
            gap: moderateScale(4),
            padding: moderateScale(8),
          }}
        >
          <View
            style={[styles.camIcon, { borderColor: error ? c.bad : c.muted }]}
          >
            <View
              style={[styles.camLens, { borderColor: error ? c.bad : c.muted }]}
            />
          </View>
          <Text
            style={[
              typo.label,
              { color: error ? c.bad : c.ink, textAlign: 'center' },
            ]}
          >
            {label}
            {required ? <Text style={{ color: c.bad }}> *</Text> : null}
          </Text>
          <Text style={[typo.small, { color: c.muted, textAlign: 'center' }]}>
            {sub}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = ScaledSheet.create({
  tile: {
    borderRadius: radius.panel,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  retake: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: '6@vs',
    alignItems: 'center',
  },
  camIcon: {
    width: '30@ms',
    height: '22@ms',
    borderWidth: 2,
    borderRadius: '5@ms',
    alignItems: 'center',
    justifyContent: 'center',
  },
  camLens: {
    width: '10@ms',
    height: '10@ms',
    borderRadius: '5@ms',
    borderWidth: 2,
  },
});
