import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { ScaledSheet } from 'react-native-size-matters/extend';
import { fonts, radius, typo, useTheme } from '../../theme';
import { fmtRelative } from '../../utils/format';
import { carrierName, dueText, mpState, MP_OPEN } from '../../utils/material';
import { HostStageChip } from '../HostStageChip';
import { Thumb } from '../Thumb';

/** mpState tones → HostStageChip tones. */
export const CHIP_TONE = {
  wait: 'wait',
  go: 'go',
  bad: 'bad',
  in: 'go',
  out: 'neutral',
};

/** One gate pass: box count (green IN / amber OUT), carrier, challan, employee, status. Tap to open. */
export function MaterialCard({ pass: p, onPress, now }) {
  const { c } = useTheme();
  const isIn = p.direction === 'in';
  const state = mpState(p);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Gate pass ${p.id}, ${isIn ? 'in' : 'out'}, ${
        p.boxes
      } boxes, ${state.label}`}
      onPress={() => onPress(p)}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: c.surface,
          borderColor: c.line,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.count,
          { backgroundColor: isIn ? c.okSoft : c.accentSoft },
        ]}
      >
        <Text style={[styles.n, { color: isIn ? c.ok : c.warn }]}>
          {p.boxes}
        </Text>
        <Text style={[typo.small, { color: isIn ? c.ok : c.warn }]}>
          {p.boxes === 1 ? 'box' : 'boxes'}
        </Text>
        <Text style={[typo.label, { color: isIn ? c.ok : c.warn }]}>
          {isIn ? 'IN' : 'OUT'}
        </Text>
      </View>
      <View style={styles.body}>
        <View style={styles.row}>
          <Thumb url={p.carrier?.photoUrl} name={carrierName(p)} size={40} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[typo.bodySemi, { color: c.ink }]} numberOfLines={1}>
              {carrierName(p)}
              {p.carrier?.company ? (
                <Text style={{ color: c.muted }}> · {p.carrier.company}</Text>
              ) : null}
            </Text>
            <Text style={[typo.small, { color: c.ink }]} numberOfLines={1}>
              {[p.challanType || 'Challan', p.refNo].filter(Boolean).join(' ')}{' '}
              · {isIn ? 'for' : 'from'} {p.authorisedBy?.name ?? 'security'}
            </Text>
          </View>
        </View>
        <Text style={[typo.monoSmall, { color: c.muted }]} numberOfLines={1}>
          {p.id} · {fmtRelative(p.createdAt, now)}
          {p.mode === 'pickup' ? ' · pickup' : ''}
          {p.returnable ? ' · returnable' : ''}
        </Text>
        <View style={styles.row}>
          <HostStageChip
            stage={{ label: state.label, tone: CHIP_TONE[state.tone] }}
          />
          {MP_OPEN.includes(p.status) && p.returnDue ? (
            <Text style={[typo.small, { color: p.overdue ? c.bad : c.muted }]}>
              {dueText(p)}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = ScaledSheet.create({
  card: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: radius.panel,
    overflow: 'hidden',
  },
  count: {
    width: '64@ms',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: '10@vs',
  },
  n: { fontFamily: fonts.mono, fontSize: '24@ms', lineHeight: '28@ms' },
  body: { flex: 1, padding: '12@ms', gap: '6@ms', minWidth: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: '10@ms',
    flexWrap: 'wrap',
  },
});
