import React from 'react';
import { Text, View } from 'react-native';
import { fonts, radius, useTheme } from '../theme';
import { ScaledSheet } from 'react-native-size-matters/extend';
export function StatusChip({ state }) {
  const { c } = useTheme();
  const conf = {
    inside: { label: 'Inside', fg: c.ok, bg: c.okSoft, dot: true },
    overstay: { label: 'Overstay', fg: c.warn, bg: c.warnSoft, dot: true },
    exited: { label: 'Exited', fg: c.muted, bg: c.sunk, dot: false },
    // Post room (MailStatus)
    lodged: { label: 'To collect', fg: c.warn, bg: c.accentSoft, dot: true },
    handed: {
      label: 'Handed · awaiting confirmation',
      fg: c.warn,
      bg: c.accentSoft,
      dot: true,
    },
    confirmed: {
      label: 'Collected · confirmed',
      fg: c.ok,
      bg: c.okSoft,
      dot: true,
    },
    closed: { label: 'Handed over', fg: c.muted, bg: c.sunk, dot: false },
    disputed: {
      label: 'Receiver disputes',
      fg: c.bad,
      bg: c.badSoft,
      dot: true,
    },
    resolved: { label: 'Resolved', fg: c.muted, bg: c.sunk, dot: false },
  }[state] ?? { label: state, fg: c.muted, bg: c.sunk, dot: false };
  const grey = state === 'exited' || state === 'closed' || state === 'resolved';
  return (
    <View
      style={[
        styles.chip,
        { backgroundColor: conf.bg, borderColor: grey ? c.line : conf.bg },
      ]}
    >
      {conf.dot ? (
        <View style={[styles.dot, { backgroundColor: conf.fg }]} />
      ) : null}
      <Text style={[styles.text, { color: conf.fg }]}>{conf.label}</Text>
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
