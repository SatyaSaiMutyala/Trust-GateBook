import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { ScaledSheet } from 'react-native-size-matters/extend';
import { fonts, radius, typo, useTheme } from '../../theme';
import { fmtRelative } from '../../utils/format';
import {
  SEVERITY_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  severityColors,
} from '../../utils/incidents';
import { HostStageChip } from '../HostStageChip';
import { CameraIcon } from '../Glyphs';

/** Severity pill (Low · Medium · High · Critical). */
export function SeverityTag({ severity }) {
  const { c } = useTheme();
  const { fg, bg } = severityColors(severity, c);
  return (
    <View style={[styles.sev, { backgroundColor: bg }]}>
      <Text style={[styles.sevText, { color: fg }]}>
        {SEVERITY_LABEL[severity] ?? severity}
      </Text>
    </View>
  );
}

export function StatusTag({ status }) {
  return (
    <HostStageChip
      stage={{
        label: STATUS_LABEL[status] ?? status,
        tone: STATUS_TONE[status],
      }}
    />
  );
}

/** One incident in a list. */
export function IncidentCard({ incident: i, now, onPress }) {
  const { c } = useTheme();
  const { bg } = severityColors(i.severity, c);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Incident ${i.id}: ${i.type}, ${
        SEVERITY_LABEL[i.severity]
      }, ${STATUS_LABEL[i.status]}`}
      onPress={() => onPress(i)}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: pressed ? c.sunk : c.surface, borderColor: c.line },
      ]}
    >
      <View
        style={[
          styles.stripe,
          { backgroundColor: i.status === 'closed' ? c.line : bg },
        ]}
      />
      <View style={styles.body}>
        <Text style={[typo.bodySemi, { color: c.ink }]} numberOfLines={1}>
          {i.type}
        </Text>
        <View style={styles.tags}>
          <SeverityTag severity={i.severity} />
          <StatusTag status={i.status} />
          {i.photoUrls?.length ? (
            <View style={styles.photoCount}>
              <CameraIcon color={c.muted} size={12} />
              <Text style={[typo.small, { color: c.muted }]}>
                {i.photoUrls.length}
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={[typo.body, { color: c.ink }]} numberOfLines={2}>
          {i.description}
        </Text>
        <Text style={[typo.small, { color: c.muted }]} numberOfLines={2}>
          <Text style={{ fontFamily: fonts.mono }}>{i.id}</Text> ·{' '}
          {[i.location, i.site].filter(Boolean).join(', ')} · reported{' '}
          {fmtRelative(i.reportedAt, now)} by {i.reportedBy?.name}
          {i.assignedTo ? ` · with ${i.assignedTo.name}` : ''}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = ScaledSheet.create({
  photoCount: { flexDirection: 'row', alignItems: 'center', gap: '4@ms' },
  card: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: radius.panel,
    overflow: 'hidden',
  },
  stripe: { width: '6@ms' },
  body: { flex: 1, padding: '12@ms', gap: '6@ms' },
  tags: {
    flexDirection: 'row',
    gap: '8@ms',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  sev: {
    borderRadius: radius.chip,
    paddingHorizontal: '10@s',
    paddingVertical: '3@vs',
  },
  sevText: { fontSize: '12@ms', fontWeight: '700' },
});
