import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { useAttentionQuery } from '../store/api';
import { selectCanCheckIn, selectHasModule } from '../store/authSlice';
import { useSheets } from '../store/hooks';
import { MIN_TOUCH, typo, useTheme } from '../theme';
import { fmtDuration, fmtTime } from '../utils/format';
import { hostStage } from '../utils/visit';
import { Button } from './Button';
import { HostActions } from './HostActions';
import { Thumb } from './Thumb';
import { ScaledSheet } from 'react-native-size-matters/extend';

/** What the guard should do, and why. */
function describe(v) {
  switch (hostStage(v)?.key) {
    case 'accepted':
      return {
        tone: 'go',
        what: `Send ${v.name} in`,
        why: `${v.host} accepted at ${fmtTime(v.hostAt)}${
          v.hostLocation ? ` · ${v.hostLocation}` : ''
        }${v.hostNote ? ` · “${v.hostNote}”` : ''}`,
      };
    case 'declined':
      return {
        tone: 'bad',
        what: `${v.host} declined ${v.name}`,
        why: `${v.hostNote ? `“${v.hostNote}” · ` : ''}Collect pass ${
          v.badge
        } and record the exit.`,
      };
    case 'noreply':
      return {
        tone: 'bad',
        what: `No reply from ${v.host}: call them`,
        why: `${v.name} has waited ${fmtDuration(v.inAt, null, new Date())}.${
          v.hostPhone ? '' : ' No phone number saved for this host.'
        }`,
      };
    case 'manual':
      return {
        tone: 'wait',
        what: `Call ${v.host} to confirm ${v.name}`,
        why: 'Not on TruSentinel. Let them in once the host confirms.',
      };
    default:
      return null;
  }
}

/**
 * Rows above every gate screen for open visits that need the guard now (`/api/visits/inside?attention=true`):
 * host accepted → Allowed in; declined → Mark exit; no reply → Call host / Confirmed by phone; host not on
 * TruSentinel → Confirmed by phone. Refreshed by visit events (tag `Inside`). The toast for a host's answer comes
 * from the stored notification (`notification:new`).
 */
export function VisitAlerts() {
  const { c } = useTheme();
  const navigation = useNavigation();
  const canAct = useSelector(selectCanCheckIn);
  const { openExit } = useSheets();
  const visitors = useSelector(selectHasModule('visitors'));
  const { data } = useAttentionQuery(undefined, { skip: !visitors });
  const rows = (data?.data ?? [])
    .map(v => ({ v, d: describe(v) }))
    .filter(r => r.d);
  if (!rows.length) return null;
  const more = (data?.total ?? 0) - (data?.data?.length ?? 0);
  const tone = {
    go: { bg: c.okSoft, fg: c.ok },
    bad: { bg: c.badSoft, fg: c.bad },
    wait: { bg: c.accentSoft, fg: c.warn },
  };

  return (
    <View style={[styles.wrap, { borderBottomColor: c.line }]}>
      {rows.map(({ v, d }) => (
        <View
          key={v.id}
          accessibilityRole="alert"
          style={[
            styles.row,
            { backgroundColor: tone[d.tone].bg, borderColor: tone[d.tone].fg },
          ]}
        >
          <View style={styles.top}>
            <Thumb url={v.photoUrl} name={v.name} size={36} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                numberOfLines={1}
                style={[typo.label, { color: tone[d.tone].fg }]}
              >
                {d.what}
              </Text>
              <Text numberOfLines={2} style={[typo.small, { color: c.ink }]}>
                {d.why}
              </Text>
            </View>
          </View>
          <View style={styles.actions}>
            <Button
              title="View"
              variant="ghost"
              size="sm"
              onPress={() => navigation.navigate('VisitDetails', { id: v.id })}
              accessibilityLabel={`View ${v.name}`}
            />
            <HostActions visit={v} />
            {v.hostStatus === 'declined' && canAct ? (
              <Button
                title="Mark exit"
                variant="exit"
                size="sm"
                onPress={() => openExit(v)}
                accessibilityLabel={`Mark exit for ${v.name}`}
              />
            ) : null}
          </View>
        </View>
      ))}
      {more > 0 ? (
        <Pressable
          accessibilityRole="link"
          onPress={() => navigation.navigate('Main', { screen: 'Inside' })}
          style={styles.more}
        >
          <Text style={[typo.label, { color: c.ink }]}>
            {more} more · Open Inside now
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = ScaledSheet.create({
  wrap: {
    borderBottomWidth: 1,
    paddingHorizontal: '12@s',
    paddingVertical: '6@vs',
    gap: '6@vs',
  },
  row: {
    borderWidth: 1,
    borderRadius: '10@ms',
    padding: '8@ms',
    gap: '6@vs',
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: '10@ms' },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: '6@ms',
    justifyContent: 'flex-end',
  },
  more: { minHeight: MIN_TOUCH, justifyContent: 'center' },
});
