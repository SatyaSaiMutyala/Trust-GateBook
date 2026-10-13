import React, { useLayoutEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { Panel } from '../components/Layout';
import { ListError } from '../components/ListFooter';
import { VisitorCard } from '../components/VisitorCard';
import { useNow } from '../state/useNow';
import { fonts, radius, typo, useTheme } from '../theme';
import { fmtHour, fmtLongDay, fmtMinutes, fmtNumber } from '../utils/format';
import { ScaledSheet, moderateScale } from 'react-native-size-matters/extend';
import { useSelector } from 'react-redux';
import {
  errorMessage,
  useInsideInfiniteQuery,
  useOverviewQuery,
} from '../store/api';
import { selectCanCheckIn } from '../store/authSlice';
import { useSettings, useSheets } from '../store/hooks';
import { useInfiniteList } from '../store/useInfiniteList';

function StatTile({ label, value, tone }) {
  const { c } = useTheme();
  const bg =
    tone === 'accent' ? c.accentSoft : tone === 'warn' ? c.warnSoft : c.surface;
  const border =
    tone === 'accent' ? c.accentSoft : tone === 'warn' ? c.warn : c.line;
  const fg = tone === 'warn' ? c.warn : c.ink;
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}`}
      style={[styles.tile, { backgroundColor: bg, borderColor: border }]}
    >
      <Text
        style={[
          typo.eyebrow,
          {
            color: tone === 'warn' ? c.warn : c.muted,
            fontSize: moderateScale(12),
          },
        ]}
        numberOfLines={2}
      >
        {label}
      </Text>
      <Text style={[typo.big, { color: fg }]}>{value}</Text>
    </View>
  );
}

/** Vertical bars, hours 6..22, labels every 3 h. */
function HourBars({ data }) {
  const { c } = useTheme();
  const max = Math.max(1, ...data.map(d => d.count));
  return (
    <View
      accessible
      accessibilityLabel={`Arrivals by hour: ${
        data
          .filter(d => d.count)
          .map(d => `${fmtHour(d.hour)} ${d.count}`)
          .join(', ') || 'none'
      }`}
    >
      <View style={styles.hourChart}>
        {data.map(d => (
          <View key={d.hour} style={styles.hourCol}>
            {d.count > 0 ? (
              <Text style={[styles.barValue, { color: c.muted }]}>
                {d.count}
              </Text>
            ) : null}
            <View
              style={{
                width: '70%',
                height: `${Math.max(d.count ? 4 : 0, (d.count / max) * 80)}%`,
                backgroundColor: c.accent,
                borderTopLeftRadius: moderateScale(3),
                borderTopRightRadius: moderateScale(3),
              }}
            />
          </View>
        ))}
      </View>
      <View style={[styles.hourAxis, { borderTopColor: c.line }]}>
        {data.map(d => (
          <View key={d.hour} style={styles.hourCol}>
            {(d.hour - 6) % 3 === 0 ? (
              <Text
                numberOfLines={1}
                style={[styles.axisLabel, { color: c.muted }]}
              >
                {fmtHour(d.hour)}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

function HBars({ data, color, empty }) {
  const { c } = useTheme();
  if (!data.length)
    return <Text style={[typo.small, { color: c.muted }]}>{empty}</Text>;
  const max = Math.max(1, ...data.map(d => d.count));
  return (
    <View style={{ gap: moderateScale(10) }}>
      {data.map(d => (
        <View
          key={d.label}
          accessible
          accessibilityLabel={`${d.label}: ${d.count}`}
          style={{ gap: moderateScale(4) }}
        >
          <View style={styles.hRowHead}>
            <Text
              numberOfLines={1}
              style={[typo.small, { color: c.ink, flex: 1 }]}
            >
              {d.label}
            </Text>
            <Text style={[typo.monoSmall, { color: c.muted }]}>{d.count}</Text>
          </View>
          <View style={[styles.track, { backgroundColor: c.sunk }]}>
            <View
              style={{
                width: `${(d.count / max) * 100}%`,
                height: '100%',
                backgroundColor: color,
                borderRadius: moderateScale(4),
              }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

export function TodayScreen({ navigation }) {
  const { c } = useTheme();
  const canCheckIn = useSelector(selectCanCheckIn);
  const settings = useSettings();
  const { openExit } = useSheets();
  const now = useNow(30000);
  const day = fmtLongDay(now);
  useLayoutEffect(() => {
    navigation.setOptions({ headerSubtitle: day });
  }, [navigation, day]);
  const [refreshing, setRefreshing] = useState(false);
  // Overview refetches on mount and whenever a socket event invalidates 'Stats'.
  const {
    data: overview = null,
    error: overviewError,
    refetch,
  } = useOverviewQuery(undefined, { refetchOnMountOrArgChange: 30 });
  const error = overviewError ? errorMessage(overviewError) : null;

  // Needs attention: first 5 overstaying visitors (GET /api/visits/inside?overstay=true&limit=5).
  const attentionParams = useMemo(
    () => ({ overstay: 'true', limit: 5, sort: 'inAt' }),
    [],
  );
  const attention = useInfiniteList(useInsideInfiniteQuery, attentionParams);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetch(), attention.refresh()]);
    setRefreshing(false);
  };

  const hours = overview?.overstayHours ?? settings.overstayHours;
  const overCount = overview?.overstayCount ?? attention.total;
  const openDetails = v => navigation.navigate('VisitDetails', { id: v.id });
  const fullHours = useMemo(() => {
    const map = new Map((overview?.byHour ?? []).map(h => [h.hour, h.count]));
    return Array.from({ length: 17 }, (_, i) => ({
      hour: 6 + i,
      count: map.get(6 + i) ?? 0,
    }));
  }, [overview]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={c.muted}
          colors={[c.accent]}
        />
      }
    >
      {canCheckIn ? (
        <Button
          title="Check in a visitor"
          onPress={() => navigation.navigate('Main', { screen: 'CheckIn' })}
          size="lg"
        />
      ) : null}
      {error ? <ListError message={error} onRetry={refetch} /> : null}

      <View style={styles.tiles}>
        <StatTile
          label="Inside now"
          value={overview ? fmtNumber(overview.insideNow) : '–'}
          tone="accent"
        />
        <StatTile
          label="Entries today"
          value={overview ? fmtNumber(overview.entriesToday) : '–'}
        />
        <StatTile
          label="Persons today"
          value={overview ? fmtNumber(overview.personsToday) : '–'}
        />
        <StatTile
          label="Average stay"
          value={
            overview
              ? overview.avgStayMinutes == null
                ? '–'
                : fmtMinutes(overview.avgStayMinutes)
              : '–'
          }
        />
        <StatTile
          label={`Over ${hours} h inside`}
          value={overview ? fmtNumber(overCount) : '–'}
          tone={overCount > 0 ? 'warn' : undefined}
        />
      </View>

      <Panel title="Arrivals by hour">
        <HourBars data={fullHours} />
      </Panel>

      <Panel title="Why they came">
        <HBars
          data={overview?.byPurpose ?? []}
          color={c.ink}
          empty="No entries yet today."
        />
      </Panel>

      <Panel
        title="Needs attention"
        subtitle={`Inside longer than ${hours} hours`}
        right={
          attention.total > 0 ? (
            <Button
              title={`View all (${fmtNumber(attention.total)})`}
              variant="ghost"
              size="sm"
              onPress={() =>
                navigation.navigate('Main', {
                  screen: 'Inside',
                  params: { overstay: true },
                })
              }
            />
          ) : null
        }
      >
        {attention.error ? (
          <ListError message={attention.error} onRetry={attention.retry} />
        ) : null}
        {!attention.loading &&
        !attention.error &&
        attention.items.length === 0 ? (
          <Text style={[typo.body, { color: c.muted }]}>
            No one has been inside longer than {hours} hours. Overstaying
            visitors show up here.
          </Text>
        ) : null}
        <View style={{ gap: moderateScale(10) }}>
          {attention.items.slice(0, 5).map(v => (
            <VisitorCard
              key={v.id}
              visit={v}
              now={now}
              overstayHours={hours}
              onPress={openDetails}
              onExit={canCheckIn ? openExit : undefined}
            />
          ))}
        </View>
      </Panel>

      <Panel title="Departments visited">
        <HBars
          data={(overview?.byDept ?? []).slice(0, 6)}
          color={c.accent}
          empty="No entries yet today."
        />
      </Panel>
    </ScrollView>
  );
}

const styles = ScaledSheet.create({
  content: { padding: '16@ms', gap: '14@ms', paddingBottom: '40@vs' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: '10@ms' },
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
    borderWidth: 1,
    borderRadius: radius.panel,
    padding: '14@ms',
    gap: '4@ms',
    minHeight: '96@vs',
    justifyContent: 'space-between',
  },
  hourChart: { flexDirection: 'row', height: '130@vs', alignItems: 'flex-end' },
  hourCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: '100%',
  },
  hourAxis: {
    flexDirection: 'row',
    borderTopWidth: 1,
    height: '20@vs',
    paddingTop: '4@vs',
  },
  axisLabel: {
    fontFamily: fonts.mono,
    fontSize: '9@ms',
    width: '44@s',
    textAlign: 'center',
  },
  barValue: { fontFamily: fonts.mono, fontSize: '9@ms', marginBottom: '2@vs' },
  hRowHead: { flexDirection: 'row', alignItems: 'center', gap: '8@ms' },
  track: { height: '10@vs', borderRadius: '4@ms', overflow: 'hidden' },
});
