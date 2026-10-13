import React, { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { fileUrl } from '../api/config';
import { fonts, radius, useTheme } from '../theme';
import { initials } from '../utils/format';
import {
  ScaledSheet,
  moderateScale,
  scale,
} from 'react-native-size-matters/extend';

/**
 * Visitor photo, or initials on a sunk square when there is none (or it fails to load / the signature expired).
 * Sizes are design points and get scaled here: `size` (square, moderateScale), or `width` + `height`
 * (width scaled horizontally, height keeps the aspect ratio), or `fill` (full width; aspectRatio via `style`).
 */
export function Thumb({ url, name, size = 52, width, height, fill, style }) {
  const { c } = useTheme();
  const [failedSrc, setFailedSrc] = useState(null);
  const src = fileUrl(url);
  const failed = !!src && failedSrc === src;
  let dims;
  if (fill) dims = { width: '100%' };
  else if (width) {
    const w = scale(width);
    dims = { width: w, height: height ? (w * height) / width : w };
  } else dims = { width: moderateScale(size), height: moderateScale(size) };
  const fontSize = fill
    ? moderateScale(36)
    : Math.round(Math.min(dims.width, dims.height) * 0.34);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Photo of ${name}`}
      style={[
        styles.box,
        dims,
        { backgroundColor: c.sunk, borderColor: c.line },
        style,
      ]}
    >
      {src && !failed ? (
        <Image
          source={{ uri: src }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <Text style={[styles.initials, { color: c.muted, fontSize }]}>
          {initials(name)}
        </Text>
      )}
    </View>
  );
}

const styles = ScaledSheet.create({
  box: {
    borderRadius: radius.control,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { fontFamily: fonts.display },
});
