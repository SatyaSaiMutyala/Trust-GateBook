import React from 'react';
import { Text, View } from 'react-native';
import { fonts, useTheme } from '../theme';
import { ScaledSheet } from 'react-native-size-matters/extend';

/** Small uppercase type-of-post tag: ink background, surface text. */
export function KindTag({ kind }) {
  const { c } = useTheme();
  return (
    <View style={[styles.tag, { backgroundColor: c.ink }]}>
      <Text numberOfLines={1} style={[styles.text, { color: c.surface }]}>
        {kind}
      </Text>
    </View>
  );
}

const styles = ScaledSheet.create({
  tag: {
    alignSelf: 'flex-start',
    borderRadius: '4@ms',
    paddingHorizontal: '6@s',
    paddingVertical: '2@vs',
  },
  text: {
    fontFamily: fonts.displaySemi,
    fontSize: '11@ms',
    lineHeight: '14@ms',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
});
