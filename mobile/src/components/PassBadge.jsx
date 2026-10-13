import React from 'react';
import { Text, View } from 'react-native';
import { fonts, radius, useTheme } from '../theme';
import { ScaledSheet, moderateScale } from 'react-native-size-matters/extend';
export function PassBadge({ badge, persons, large }) {
  const { c } = useTheme();
  if (!badge) return null;
  return (
    <View style={styles.row}>
      <View
        accessibilityLabel={`Pass ${badge}`}
        style={[
          styles.pill,
          { backgroundColor: c.accent },
          large && styles.large,
        ]}
      >
        <Text
          style={[
            styles.text,
            { color: c.accentInk },
            large && { fontSize: moderateScale(14) },
          ]}
        >
          Pass {badge}
        </Text>
      </View>
      {persons && persons > 1 ? (
        <Text
          accessibilityLabel={`${persons} persons`}
          style={[styles.plus, { color: c.muted }]}
        >
          +{persons - 1}
        </Text>
      ) : null}
    </View>
  );
}
const styles = ScaledSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: '6@ms' },
  pill: {
    borderRadius: radius.chip,
    paddingHorizontal: '8@s',
    paddingVertical: '2@vs',
  },
  large: { paddingHorizontal: '10@s', paddingVertical: '4@vs' },
  text: { fontFamily: fonts.mono, fontSize: '12@ms', lineHeight: '16@ms' },
  plus: { fontFamily: fonts.mono, fontSize: '12@ms' },
});
