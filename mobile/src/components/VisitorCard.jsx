import React, { memo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { radius, typo, useTheme } from '../theme';
import { fmtDuration, fmtShortDate, fmtTime } from '../utils/format';
import { Button } from './Button';
import { PassBadge } from './PassBadge';
import { StatusChip } from './StatusChip';
import { Thumb } from './Thumb';
import {
  ScaledSheet,
  moderateScale,
  verticalScale,
} from 'react-native-size-matters/extend';
export function visitState(v, now, overstayHours) {
  if (v.outAt) return 'exited';
  const hours = (now.getTime() - new Date(v.inAt).getTime()) / 3600000;
  return v.overstay || hours > overstayHours ? 'overstay' : 'inside';
}
function VisitorCardInner({
  visit: v,
  now,
  overstayHours,
  logMode,
  onPress,
  onExit,
}) {
  const { c } = useTheme();
  const state = visitState(v, now, overstayHours);
  const over = state === 'overstay';
  const meeting = `${v.purpose} · ${v.host}${v.dept ? ` (${v.dept})` : ''}`;
  const duration = fmtDuration(v.inAt, v.outAt, now);
  const timeLine = logMode
    ? `${fmtShortDate(v.inAt)} · ${fmtTime(v.inAt)} → ${
        v.outAt ? fmtTime(v.outAt) : '…'
      }`
    : `In ${fmtTime(v.inAt)}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${v.name}, pass ${v.badge}, ${meeting}, ${timeLine}, ${state}, ${duration}`}
      accessibilityHint="Opens visitor details"
      onPress={onPress ? () => onPress(v) : undefined}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: pressed ? c.sunk : c.surface,
          borderColor: over ? c.accent : c.line,
          borderWidth: over ? 1.5 : 1,
        },
      ]}
    >
      {over ? (
        <View style={[styles.inset, { backgroundColor: c.accent }]} />
      ) : null}
      <Thumb url={v.photoUrl} name={v.name} size={52} />
      <View style={styles.mid}>
        <View style={styles.nameRow}>
          <Text
            numberOfLines={1}
            style={[
              typo.bodySemi,
              { color: c.ink, flexShrink: 1, fontSize: moderateScale(16) },
            ]}
          >
            {v.name}
          </Text>
          <PassBadge badge={v.badge} persons={v.persons} />
        </View>
        <Text numberOfLines={1} style={[typo.small, { color: c.muted }]}>
          {meeting}
        </Text>
        <Text numberOfLines={1} style={[typo.monoSmall, { color: c.muted }]}>
          {timeLine}
        </Text>
        {logMode ? (
          <View style={styles.logRow}>
            <StatusChip state={state} />
            {v.outAt && v.badge && v.passReturned === false ? (
              <Text style={[typo.label, { color: c.bad }]}>Not returned</Text>
            ) : null}
          </View>
        ) : null}
      </View>
      <View style={styles.right}>
        <View
          style={[
            styles.duration,
            {
              backgroundColor: over ? c.warnSoft : c.sunk,
              borderColor: over ? c.warnSoft : c.line,
            },
          ]}
        >
          <Text style={[typo.monoSmall, { color: over ? c.warn : c.ink }]}>
            {duration}
          </Text>
        </View>
        {!v.outAt && onExit ? (
          <Button
            title="Mark exit"
            variant="exit"
            size="sm"
            onPress={() => onExit(v)}
            accessibilityLabel={`Mark exit for ${v.name}`}
            style={{ minHeight: verticalScale(44) }}
          />
        ) : null}
      </View>
    </Pressable>
  );
}
export const VisitorCard = memo(VisitorCardInner);
const styles = ScaledSheet.create({
  card: {
    flexDirection: 'row',
    gap: '12@ms',
    padding: '12@ms',
    borderRadius: radius.panel,
    overflow: 'hidden',
    alignItems: 'center',
  },
  inset: { position: 'absolute', left: 0, top: 0, bottom: 0, width: '4@s' },
  mid: { flex: 1, gap: '2@ms', minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: '8@ms' },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: '8@ms',
    marginTop: '4@vs',
  },
  right: { alignItems: 'flex-end', gap: '8@ms' },
  duration: {
    borderRadius: radius.chip,
    borderWidth: 1,
    paddingHorizontal: '8@s',
    paddingVertical: '2@vs',
  },
});
