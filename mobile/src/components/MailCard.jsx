import React, { memo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { fonts, radius, typo, useTheme } from '../theme';
import { fmtAgo, fmtTimeOrDate } from '../utils/format';
import { Button } from './Button';
import { KindTag } from './KindTag';
import { StatusChip } from './StatusChip';
import { Thumb } from './Thumb';
import { ScaledSheet } from 'react-native-size-matters/extend';

/** "From Income Tax Department · via India Post · 2 pieces" */
export function mailFromLine(m) {
  return [
    `From ${m.sender}`,
    m.carrier ? `via ${m.carrier}` : null,
    m.pieces > 1 ? `${m.pieces} pieces` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Post-room item card.
 * - gate mode (default): status chip + actions (lodged: Remind + Handed over; disputed: Resolve) when `canAct`.
 * - `collectAt`: employee view of a waiting item, shows "Collect at <gate>" instead of actions.
 */
function MailCardInner({
  item: m,
  now,
  canAct,
  onPress,
  onRemind,
  onHandover,
  onResolve,
  collectAt,
  reminding,
}) {
  const { c } = useTheme();
  const disputed = m.status === 'disputed';
  const lodged = m.status === 'lodged';
  const handedTo =
    m.handedAt && m.collectedBy ? `given to ${m.collectedBy}` : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${m.kind} for ${m.recipientName}, ${mailFromLine(
        m,
      )}`}
      accessibilityHint="Opens item details"
      onPress={onPress ? () => onPress(m) : undefined}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: pressed ? c.sunk : c.surface,
          borderColor: disputed ? c.bad : c.line,
          borderWidth: disputed ? 1.5 : 1,
        },
      ]}
    >
      {disputed ? (
        <View style={[styles.inset, { backgroundColor: c.bad }]} />
      ) : null}
      <View style={styles.top}>
        <Thumb url={m.coverPhotoUrl} name={m.kind} size={56} />
        <View style={styles.mid}>
          <KindTag kind={m.kind} />
          <Text numberOfLines={1} style={[typo.body, { color: c.ink }]}>
            For{' '}
            <Text style={{ fontFamily: fonts.bodySemi }}>
              {m.recipientName}
            </Text>
            {m.dept ? (
              <Text style={{ color: c.muted }}> ({m.dept})</Text>
            ) : null}
          </Text>
          <Text numberOfLines={2} style={[typo.small, { color: c.muted }]}>
            {mailFromLine(m)}
          </Text>
          <Text numberOfLines={2} style={[typo.monoSmall, { color: c.muted }]}>
            {m.refNo ? `${m.refNo} · ` : ''}
            <Text style={{ fontFamily: fonts.body }}>
              Received {fmtTimeOrDate(m.receivedAt, now)}
            </Text>
            {lodged ? (
              <Text style={{ color: c.warn }}>
                {' '}
                · {fmtAgo(m.receivedAt, now)}
              </Text>
            ) : null}
            {handedTo ? (
              <Text style={{ fontFamily: fonts.body }}> · {handedTo}</Text>
            ) : null}
          </Text>
        </View>
      </View>
      <View style={styles.bottom}>
        {collectAt ? (
          <Text style={[typo.label, { color: c.warn, flex: 1 }]}>
            Collect at the gate
          </Text>
        ) : (
          <View style={{ flex: 1 }}>
            <StatusChip state={m.status} />
          </View>
        )}
        {canAct && lodged ? (
          <View style={styles.actions}>
            {m.recipient && onRemind ? (
              <Button
                title="🔔 Remind"
                variant="ghost"
                size="sm"
                loading={reminding}
                onPress={() => onRemind(m)}
                accessibilityLabel={`Remind ${m.recipientName}`}
              />
            ) : null}
            <Button
              title="Handed over"
              variant="ok"
              size="sm"
              onPress={() => onHandover(m)}
              accessibilityLabel={`Hand over to ${m.recipientName}`}
            />
          </View>
        ) : null}
        {canAct && disputed ? (
          <Button
            title="Resolve"
            size="sm"
            onPress={() => onResolve(m)}
            accessibilityLabel={`Resolve issue for ${m.recipientName}`}
          />
        ) : null}
      </View>
    </Pressable>
  );
}

export const MailCard = memo(MailCardInner);

const styles = ScaledSheet.create({
  card: {
    padding: '12@ms',
    borderRadius: radius.panel,
    overflow: 'hidden',
    gap: '10@ms',
  },
  inset: { position: 'absolute', left: 0, top: 0, bottom: 0, width: '4@s' },
  top: { flexDirection: 'row', gap: '12@ms' },
  mid: { flex: 1, gap: '3@ms', minWidth: 0 },
  bottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: '8@ms',
    flexWrap: 'wrap',
  },
  actions: { flexDirection: 'row', gap: '8@ms' },
});
