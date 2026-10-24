import React, { useState } from 'react';
import { Image, View } from 'react-native';
import { moderateScale } from 'react-native-size-matters/extend';
import { API_URL } from '../api/config';

/** Absolute URL of the public logo (`/api/brand/logo?v=…`). */
export const brandLogoUri = logoUrl =>
  logoUrl
    ? /^https?:/i.test(logoUrl)
      ? logoUrl
      : `${API_URL}${logoUrl}`
    : null;

/**
 * Logo on a white rounded tile (colours would disappear on the dark rail): the company logo from Settings →
 * Company when there is one (up to 3× as wide as tall), otherwise the TruSentinel mark. `size` in dp (scaled).
 */
export function BrandMark({ size, logoUrl, large = false }) {
  const s = moderateScale(size);
  const uri = brandLogoUri(logoUrl);
  // Width follows the logo's aspect once it has loaded.
  const [ratio, setRatio] = useState(1);
  const tile = {
    height: s,
    borderRadius: Math.round(s * 0.24),
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  };
  if (uri) {
    const h = s * 0.78;
    return (
      <View
        accessibilityLabel="Company logo"
        style={[tile, { paddingHorizontal: Math.round(s * 0.12) }]}
      >
        <Image
          source={{ uri }}
          onLoad={e => {
            const { width, height } = e.nativeEvent.source ?? {};
            if (width && height) setRatio(Math.min(3, width / height));
          }}
          style={{ height: h, width: Math.min(s * 2.8, h * ratio) }}
          resizeMode="contain"
        />
      </View>
    );
  }
  return (
    <View accessibilityLabel="TruSentinel" style={[tile, { width: s }]}>
      <Image
        source={
          large
            ? require('../assets/logo-large.png')
            : require('../assets/logo.png')
        }
        style={{ width: s * 0.82, height: s * 0.82 }}
        resizeMode="contain"
      />
    </View>
  );
}
