import React from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { ScaledSheet } from 'react-native-size-matters/extend';
import { HostStageChip } from '../components/HostStageChip';
import { EmptyState } from '../components/Layout';
import { ListError, ListLoading } from '../components/ListFooter';
import { useNow } from '../state/useNow';
import { errorMessage, useMyKeysQuery } from '../store/api';
import { fonts, radius, typo, useTheme } from '../theme';
import { fmtDateTime, fmtRelative, fmtTime } from '../utils/format';
import { KEY_STATE } from '../utils/keys';

const CHIP = { ok: 'go', warn: 'wait', bad: 'bad', muted: 'neutral' };

/** One key issued to me: still with me, or given back. */
function MyKeyCard({ move: m, now }) {
  const { c } = useTheme();
  const s = KEY_STATE[m.state];
  const back = !!m.returnedAt;
  const overdue = m.state === 'overdue';
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: c.surface,
          borderColor: overdue ? c.bad : back ? c.line : c.accent,
        },
      ]}
      accessibilityLabel={`Key ${m.key.number}, ${m.key.name}, ${s.label}`}
    >
      <View style={styles.cardHead}>
        <View
          style={[
            styles.tag,
            { backgroundColor: back ? c.okSoft : c.accentSoft },
          ]}
        >
          <Text
            style={[
              styles.tagNo,
              { color: back ? c.ok : c.warn, fontFamily: fonts.mono },
            ]}
          >
            {m.key.number}
          </Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[typo.bodyMedium, { color: c.ink }]}>{m.key.name}</Text>
          <Text style={[typo.small, { color: c.muted }]}>
            {[m.key.location, m.site].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </View>
      <Text style={[typo.small, { color: overdue ? c.bad : c.muted }]}>
        {back
          ? `Given back ${fmtDateTime(m.returnedAt)}${
              m.receivedBy ? ` · taken by ${m.receivedBy.name}` : ''
            }`
          : `Taken ${fmtRelative(m.issuedAt, now)}${
              m.dueAt
                ? ` · ${overdue ? 'was due' : 'return by'} ${fmtTime(m.dueAt)}`
                : ' · no return time'
            }`}
        {m.purpose ? ` · ${m.purpose}` : ''}
      </Text>
      <HostStageChip stage={{ label: s.label, tone: CHIP[s.tone] }} />
    </View>
  );
}

/** My keys: the keys the gate has issued to me, read only. Returning is done at the security desk. */
export function MyKeysScreen() {
  const { c } = useTheme();
  const now = useNow(60000);
  const { data, error, isLoading, isFetching, refetch } = useMyKeysQuery();
  const open = data?.data ?? [];
  const returned = data?.returned ?? [];
  const overdue = data?.counts?.overdue ?? 0;
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      showsHorizontalScrollIndicator={false}
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={isFetching && !isLoading}
          onRefresh={refetch}
          tintColor={c.muted}
          colors={[c.accent]}
        />
      }
    >
      <Text style={[typo.small, { color: c.muted }]}>
        Keys the security desk has given you. Please hand them back at the desk
        by the return time.
      </Text>
      {error ? (
        <ListError message={errorMessage(error)} onRetry={refetch} />
      ) : null}
      {isLoading ? <ListLoading /> : null}
      {overdue ? (
        <View
          style={[
            styles.alert,
            { backgroundColor: c.badSoft, borderColor: c.bad },
          ]}
        >
          <Text style={[typo.bodyMedium, { color: c.bad }]}>
            {overdue === 1 ? 'A key is' : `${overdue} keys are`} past the return
            time. Please take {overdue === 1 ? 'it' : 'them'} back to the
            security desk.
          </Text>
        </View>
      ) : null}
      {data ? (
        <>
          <Text accessibilityRole="header" style={[typo.h3, { color: c.ink }]}>
            With me · {open.length}
          </Text>
          {open.length ? (
            open.map(m => <MyKeyCard key={m.id} move={m} now={now} />)
          ) : (
            <EmptyState
              title="No keys with you"
              body="When security gives you a key, it shows here."
            />
          )}
          {returned.length ? (
            <>
              <Text
                accessibilityRole="header"
                style={[typo.h3, { color: c.ink, marginTop: 8 }]}
              >
                Given back this week
              </Text>
              {returned.map(m => (
                <MyKeyCard key={m.id} move={m} now={now} />
              ))}
            </>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = ScaledSheet.create({
  content: { padding: '16@ms', gap: '12@ms', paddingBottom: '48@vs' },
  card: {
    borderWidth: 1,
    borderRadius: radius.panel,
    padding: '12@ms',
    gap: '8@ms',
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: '12@ms' },
  tag: {
    minWidth: '60@ms',
    paddingHorizontal: '8@ms',
    paddingVertical: '6@vs',
    borderRadius: '8@ms',
    alignItems: 'center',
  },
  tagNo: { fontSize: '15@ms', fontWeight: '700' },
  alert: { borderWidth: 1, borderRadius: radius.panel, padding: '12@ms' },
});
