import React from 'react';
import { View } from 'react-native';
import { moderateScale } from 'react-native-size-matters/extend';

/*
 * Small icons drawn with Views. The bundled fonts (Barlow, JetBrains Mono) have no emoji and no ✕ / ✓ / 🔒 / 📷
 * glyphs, so those characters render as "?" boxes — use these instead. `size` is in design points.
 */

/** ✕ — two rotated bars. */
export function CrossIcon({ color, size = 14, thickness = 2 }) {
  const s = moderateScale(size);
  const bar = {
    position: 'absolute',
    width: s,
    height: thickness,
    borderRadius: thickness,
    backgroundColor: color,
  };
  return (
    <View
      style={{
        width: s,
        height: s,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View style={[bar, { transform: [{ rotate: '45deg' }] }]} />
      <View style={[bar, { transform: [{ rotate: '-45deg' }] }]} />
    </View>
  );
}

/** ✓ — two borders of a rotated box. */
export function TickIcon({ color, size = 14, thickness = 2.5 }) {
  const s = moderateScale(size);
  return (
    <View
      style={{
        width: s,
        height: s,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: s * 0.5,
          height: s * 0.9,
          borderRightWidth: thickness,
          borderBottomWidth: thickness,
          borderColor: color,
          transform: [{ rotate: '45deg' }],
          marginTop: -s * 0.2,
        }}
      />
    </View>
  );
}

/** 🔒 — shackle over a filled body. */
export function LockIcon({ color, size = 14 }) {
  const s = moderateScale(size);
  return (
    <View style={{ width: s, height: s, alignItems: 'center' }}>
      <View
        style={{
          width: s * 0.56,
          height: s * 0.5,
          borderWidth: Math.max(1.5, s * 0.12),
          borderBottomWidth: 0,
          borderColor: color,
          borderTopLeftRadius: s * 0.28,
          borderTopRightRadius: s * 0.28,
        }}
      />
      <View
        style={{
          width: s * 0.8,
          height: s * 0.5,
          borderRadius: s * 0.1,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

/** 📷 — outlined body with a lens and a top bump. */
export function CameraIcon({ color, size = 14 }) {
  const s = moderateScale(size);
  const line = Math.max(1.5, s * 0.1);
  return (
    <View style={{ width: s, height: s, justifyContent: 'flex-end' }}>
      <View
        style={{
          position: 'absolute',
          top: s * 0.1,
          left: s * 0.3,
          width: s * 0.4,
          height: s * 0.2,
          borderTopLeftRadius: s * 0.08,
          borderTopRightRadius: s * 0.08,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          height: s * 0.7,
          borderWidth: line,
          borderColor: color,
          borderRadius: s * 0.14,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: s * 0.32,
            height: s * 0.32,
            borderRadius: s * 0.16,
            borderWidth: line,
            borderColor: color,
          }}
        />
      </View>
    </View>
  );
}
