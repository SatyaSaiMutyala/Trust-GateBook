import React from 'react';
import { Text, View } from 'react-native';
import { fonts, radius, useTheme } from '../theme';
import { ScaledSheet } from 'react-native-size-matters/extend';

/** Host approval stage of an open visit (see utils/visit `hostStage`): amber / green / red with a dot. */
export function HostStageChip({ stage }) {
  const { c } = useTheme();
  if (!stage) return null;
  const { fg, bg } = {
    wait: { fg: c.warn, bg: c.accentSoft },
    go: { fg: c.ok, bg: c.okSoft },
    bad: { fg: c.bad, bg: c.badSoft },
    neutral: { fg: c.muted, bg: c.sunk },
  }[stage.tone];
  return (
    <View
      accessibilityLabel={stage.label}
      style={[styles.chip, { backgroundColor: bg, borderColor: bg }]}
    >
      <View style={[styles.dot, { backgroundColor: fg }]} />
      <Text style={[styles.text, { color: fg }]} numberOfLines={1}>
        {stage.label}
      </Text>
    </View>
  );
}

const styles = ScaledSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: '6@ms',
    borderRadius: radius.chip,
    borderWidth: 1,
    paddingHorizontal: '10@s',
    paddingVertical: '3@vs',
    alignSelf: 'flex-start',
  },
  dot: { width: '7@ms', height: '7@ms', borderRadius: '4@ms' },
  text: { fontFamily: fonts.bodySemi, fontSize: '12@ms', lineHeight: '16@ms' },
});
