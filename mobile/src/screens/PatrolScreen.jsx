import React, { useMemo, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSelector } from 'react-redux';
import {
  ScaledSheet,
  moderateScale,
  verticalScale,
} from 'react-native-size-matters/extend';
import { Button } from '../components/Button';
import { FilterBar, FilterTabs } from '../components/FilterBar';
import { HostStageChip } from '../components/HostStageChip';
import { EmptyState } from '../components/Layout';
import { ListError, ListFooter, ListLoading } from '../components/ListFooter';
import { Thumb } from '../components/Thumb';
import { useNow } from '../state/useNow';
import {
  errorMessage,
  usePatrolBoardQuery,
  usePatrolLogQuery,
  usePatrolScansInfiniteQuery,
} from '../store/api';
import { selectCanCheckIn, selectIsAdmin } from '../store/authSlice';
import { useInfiniteList } from '../store/useInfiniteList';
import { fonts, radius, typo, useTheme } from '../theme';
import { fmtDateTime } from '../utils/format';
import { LOG_STATUS, hhmm, slotChip } from '../utils/ops';

function Dots({ slot }) {
  const { c } = useTheme();
  const ended = slot.status === 'partial' || slot.status === 'missed';
  return (
    <View style={styles.dots}>
      {slot.checkpoints.map(cp => (
        <View
          key={cp.id}
          accessibilityLabel={`${cp.name}: ${
            cp.scannedAt ? `scanned ${hhmm(cp.scannedAt)}` : 'not scanned'
          }`}
          style={[
            styles.dot,
            {
              backgroundColor: cp.scannedAt
                ? cp.status === 'issue'
                  ? c.warn
                  : c.ok
                : ended
                ? c.bad
                : c.line,
            },
          ]}
        />
      ))}
    </View>
  );
}

function SlotCard({ slot: s, now, onScan }) {
  const { c } = useTheme();
  const chip = slotChip(s, now);
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: c.surface,
          borderColor: s.status === 'open' && s.late ? c.bad : c.line,
        },
      ]}
    >
      <View style={styles.row}>
        <Text style={[styles.time, { color: c.ink, fontFamily: fonts.mono }]}>
          {hhmm(s.at)}
        </Text>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[typo.bodySemi, { color: c.ink }]}>{s.roundName}</Text>
          <Text style={[typo.small, { color: c.muted }]}>
            On time till {hhmm(s.onTimeTill)} · ends {hhmm(s.end)}
          </Text>
        </View>
        {onScan ? <Button title="Scan" size="sm" onPress={onScan} /> : null}
      </View>
      <Dots slot={s} />
      <HostStageChip stage={chip} />
      {s.escalations.length ? (
        <Text style={[typo.small, { color: c.bad }]}>
          {s.escalations
            .map(e => `${e.label} · ${hhmm(e.at)} → ${e.recipients.join(', ')}`)
            .join('\n')}
        </Text>
      ) : null}
    </View>
  );
}

function Rounds({ now, operator, admin, onScan }) {
  const { c } = useTheme();
  const { data, error, isLoading, isFetching, refetch } = usePatrolBoardQuery();
  if (isLoading) return <ListLoading />;
  if (error)
    return (
      <View style={styles.content}>
        <ListError message={errorMessage(error)} onRetry={refetch} />
      </View>
    );
  if (!data?.rounds?.length)
    return (
      <View style={styles.content}>
        <EmptyState
          title="No patrol rounds yet"
          body={
            admin
              ? 'Set up locations, rounds and the escalation matrix in Settings → Patrols on the web.'
              : 'Ask your admin to set up patrol locations and rounds.'
          }
        />
      </View>
    );
  const open = data.slots.filter(s => s.status === 'open');
  const next = data.slots.filter(s => s.status === 'upcoming').slice(0, 3);
  const past = data.slots
    .filter(s => new Date(s.end).getTime() < now)
    .reverse();
  const section = (title, list, scan, empty) => (
    <View style={{ gap: moderateScale(10) }}>
      <Text accessibilityRole="header" style={[typo.h3, { color: c.ink }]}>
        {title}
      </Text>
      {list.length ? (
        list.map(s => (
          <SlotCard
            key={s.key}
            slot={s}
            now={now}
            onScan={scan && operator ? onScan : null}
          />
        ))
      ) : empty ? (
        <Text style={[typo.small, { color: c.muted }]}>{empty}</Text>
      ) : null}
    </View>
  );
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.content, { gap: moderateScale(18) }]}
      refreshControl={
        <RefreshControl
          refreshing={isFetching}
          onRefresh={refetch}
          tintColor={c.muted}
          colors={[c.accent]}
        />
      }
    >
      {section('Due now', open, true, 'No round is due right now.')}
      {next.length ? section('Coming up', next, false) : null}
      {section(
        'Last 12 hours',
        past,
        false,
        'No rounds were due in the last 12 hours.',
      )}
    </ScrollView>
  );
}

function LateLog() {
  const { c } = useTheme();
  const [days, setDays] = useState(7);
  const { data, error, isLoading, isFetching, refetch } = usePatrolLogQuery({
    days,
    filter: 'problems',
  });
  const s = data?.summary;
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.content, { gap: moderateScale(10) }]}
      refreshControl={
        <RefreshControl
          refreshing={isFetching && !isLoading}
          onRefresh={refetch}
          tintColor={c.muted}
          colors={[c.accent]}
        />
      }
    >
      <FilterTabs
        accessibilityLabel="Period"
        options={[
          { value: 1, label: 'Today' },
          { value: 7, label: '7 days' },
          { value: 30, label: '30 days' },
          { value: 90, label: '90 days' },
        ]}
        value={days}
        onChange={setDays}
      />
      {error ? (
        <ListError message={errorMessage(error)} onRetry={refetch} />
      ) : null}
      {isLoading ? <ListLoading /> : null}
      {s ? (
        <Text style={[typo.body, { color: c.ink }]}>
          {s.rounds
            ? `${Math.round((s.onTime / s.rounds) * 100)}% on time (${
                s.onTime
              } of ${s.rounds})`
            : 'No rounds ended yet'}
          {` · ${s.late} started late · ${s.partial} partly missed · ${s.missed} missed`}
        </Text>
      ) : null}
      {data && !data.data.length ? (
        <EmptyState
          title="No late or missed rounds"
          body="Each round is written here when its time runs out: on time, late, partly missed or missed, with every alarm and escalation sent."
        />
      ) : null}
      {(data?.data ?? []).map(r => {
        const st = LOG_STATUS[r.logStatus];
        return (
          <View
            key={r.key}
            style={[
              styles.card,
              { backgroundColor: c.surface, borderColor: c.line },
            ]}
          >
            <Text style={[typo.bodySemi, { color: c.ink }]}>
              {r.roundName} · {hhmm(r.at)}
            </Text>
            <Text style={[typo.small, { color: c.muted }]}>
              {fmtDateTime(r.at)} · scanned {r.done}/{r.total}
              {r.firstAt ? ` · started +${r.lateMin} min` : ''}
            </Text>
            {r.missing.length ? (
              <Text style={[typo.small, { color: c.bad }]}>
                Missed: {r.missing.join(', ')}
              </Text>
            ) : null}
            <HostStageChip stage={st} />
            {r.escalations.length ? (
              <Text style={[typo.small, { color: c.muted }]}>
                {r.escalations
                  .map(
                    e =>
                      `${hhmm(e.at)} ${e.label} → ${e.recipients.join(', ')}`,
                  )
                  .join('\n')}
              </Text>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

function ScanLog() {
  const { c } = useTheme();
  const list = useInfiniteList(
    usePatrolScansInfiniteQuery,
    useMemo(() => ({ days: 3 }), []),
  );
  return (
    <FlatList
      showsVerticalScrollIndicator={false}
      showsHorizontalScrollIndicator={false}
      style={{ flex: 1 }}
      contentContainerStyle={styles.content}
      data={list.items}
      keyExtractor={s => s.id}
      ItemSeparatorComponent={Separator}
      renderItem={({ item: s }) => (
        <View
          style={[
            styles.card,
            styles.row,
            { backgroundColor: c.surface, borderColor: c.line },
          ]}
        >
          <Thumb url={s.photoUrl} name={s.checkpoint.name} size={44} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[typo.bodySemi, { color: c.ink }]}>
              {s.checkpoint.name}
              {s.status === 'issue' ? (
                <Text style={{ color: c.bad }}> · Issue</Text>
              ) : (
                ''
              )}
              {s.manual ? ' · code typed' : ''}
            </Text>
            <Text style={[typo.small, { color: c.muted }]}>
              {s.by?.name} ·{' '}
              {s.roundName
                ? `${s.roundName} ${hhmm(s.slotAt)}`
                : 'Extra scan (no round due)'}
              {s.note ? ` · “${s.note}”` : ''}
            </Text>
            <Text style={[typo.small, { color: c.muted }]}>
              {fmtDateTime(s.at)}
            </Text>
          </View>
        </View>
      )}
      ListEmptyComponent={
        list.loading ? (
          <ListLoading />
        ) : list.error ? (
          <ListError message={list.error} onRetry={list.retry} />
        ) : (
          <EmptyState
            title="No scans yet"
            body="Every checkpoint scan from the last 3 days shows here."
          />
        )
      }
      ListFooterComponent={<ListFooter list={list} />}
      onEndReached={list.loadMore}
      onEndReachedThreshold={0.4}
      refreshControl={
        <RefreshControl
          refreshing={list.refreshing}
          onRefresh={list.refresh}
          tintColor={c.muted}
          colors={[c.accent]}
        />
      }
    />
  );
}

/** Patrols (gate users with the module): rounds, the late & missed log, the scan log, and Scan checkpoint. */
export function PatrolScreen({ navigation }) {
  const { c } = useTheme();
  const operator = useSelector(selectCanCheckIn);
  const admin = useSelector(selectIsAdmin);
  const now = useNow(15000).getTime();
  const [tab, setTab] = useState('rounds');
  const scan = () => navigation.navigate('PatrolScan');
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <FilterBar>
        {operator ? (
          <Button title="Scan checkpoint" size="lg" onPress={scan} />
        ) : null}
        <FilterTabs
          accessibilityLabel="Patrols"
          options={[
            { value: 'rounds', label: 'Rounds' },
            { value: 'late', label: 'Late & missed' },
            { value: 'scans', label: 'Scan log' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </FilterBar>
      {tab === 'rounds' ? (
        <Rounds now={now} operator={operator} admin={admin} onScan={scan} />
      ) : tab === 'late' ? (
        <LateLog />
      ) : (
        <ScanLog />
      )}
    </View>
  );
}

function Separator() {
  return <View style={{ height: verticalScale(10) }} />;
}

const styles = ScaledSheet.create({
  content: { padding: '16@ms', flexGrow: 1 },
  card: {
    borderWidth: 1,
    borderRadius: radius.panel,
    padding: '12@ms',
    gap: '8@ms',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: '12@ms' },
  time: { fontSize: '20@ms', fontWeight: '700', minWidth: '58@ms' },
  dots: { flexDirection: 'row', flexWrap: 'wrap', gap: '5@ms' },
  dot: { width: '12@ms', height: '12@ms', borderRadius: '6@ms' },
});
