import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { HostRespond } from '../components/HostRespond';
import { EmptyState } from '../components/Layout';
import { ListError, ListFooter, ListLoading } from '../components/ListFooter';
import { PassBadge } from '../components/PassBadge';
import { Thumb } from '../components/Thumb';
import { VisitorCard } from '../components/VisitorCard';
import { useNow } from '../state/useNow';
import { fonts, radius, typo, useTheme } from '../theme';
import { fmtDuration, fmtTime } from '../utils/format';
import {
  ScaledSheet,
  moderateScale,
  verticalScale,
} from 'react-native-size-matters/extend';
import { useSelector } from 'react-redux';
import { useMyVisitsInfiniteQuery } from '../store/api';
import { selectUser } from '../store/authSlice';
import { useSettings } from '../store/hooks';
import { useInfiniteList } from '../store/useInfiniteList';

function SectionTitle({ title, count }) {
  const { c } = useTheme();
  return (
    <View style={styles.sectionHead}>
      <Text
        accessibilityRole="header"
        style={[typo.h3, { color: c.ink, flex: 1 }]}
      >
        {title}
      </Text>
      {count > 0 ? (
        <View style={[styles.count, { backgroundColor: c.accent }]}>
          <Text style={[typo.label, { color: c.accentInk }]}>{count}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** A visitor waiting at the gate for my answer: photo, who they are, then Accept / Decline. */
function WaitingCard({ visit: v, now, onOpen }) {
  const { c } = useTheme();
  const from = [
    v.company,
    v.purpose,
    v.persons > 1 ? `${v.persons} persons` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <View
      style={[
        styles.waitingCard,
        { backgroundColor: c.surface, borderColor: c.accent },
      ]}
    >
      <View style={{ flexDirection: 'row', gap: moderateScale(12) }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open details of ${v.name}`}
          onPress={() => onOpen(v)}
        >
          <Thumb url={v.photoUrl} name={v.name} width={84} height={108} />
        </Pressable>
        <View style={{ flex: 1, gap: moderateScale(4), minWidth: 0 }}>
          <Text style={[typo.h2, { color: c.ink }]} numberOfLines={2}>
            {v.name}
          </Text>
          <Text style={[typo.small, { color: c.muted }]} numberOfLines={2}>
            {from || 'No company given'}
          </Text>
          <PassBadge badge={v.badge} />
          <Text style={[typo.small, { color: c.ink }]}>
            Arrived{' '}
            <Text style={{ fontFamily: fonts.bodySemi }}>
              {fmtTime(v.inAt)}
            </Text>{' '}
            ·{' '}
            <Text style={{ fontFamily: fonts.mono, color: c.warn }}>
              waiting {fmtDuration(v.inAt, null, now)}
            </Text>
          </Text>
          {v.items ? (
            <Text style={[typo.small, { color: c.muted }]} numberOfLines={2}>
              Carrying: {v.items}
            </Text>
          ) : null}
          {v.escalatedAt ? (
            <Text style={[typo.small, { color: c.warn }]}>
              Security has been asked to call you.
            </Text>
          ) : null}
        </View>
      </View>
      <HostRespond visit={v} />
    </View>
  );
}

/**
 * My visitors (anyone who can receive visitors): waiting for my answer · visiting me now · earlier.
 * Each section is its own paginated `GET /api/visits/mine?scope=…`; visit events refresh them (tag MyVisitors).
 */
export function MyVisitorsScreen({ navigation }) {
  const { c } = useTheme();
  const user = useSelector(selectUser);
  const settings = useSettings();
  const now = useNow(30000);
  useLayoutEffect(() => {
    navigation.setOptions({ headerSubtitle: user?.name });
  }, [navigation, user?.name]);

  const waiting = useInfiniteList(
    useMyVisitsInfiniteQuery,
    useMemo(() => ({ scope: 'waiting', limit: 10 }), []),
  );
  const current = useInfiniteList(
    useMyVisitsInfiniteQuery,
    useMemo(() => ({ scope: 'current', limit: 10 }), []),
  );
  const earlier = useInfiniteList(
    useMyVisitsInfiniteQuery,
    useMemo(() => ({ scope: 'earlier' }), []),
  );

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      waiting.refresh(),
      current.refresh(),
      earlier.refresh(),
    ]);
    setRefreshing(false);
  };

  const open = useCallback(
    v => navigation.navigate('VisitDetails', { id: v.id }),
    [navigation],
  );

  const header = (
    <View style={{ gap: moderateScale(14), marginBottom: verticalScale(10) }}>
      <View style={{ gap: moderateScale(10) }}>
        <SectionTitle title="Waiting at the gate" count={waiting.total} />
        {waiting.error ? (
          <ListError message={waiting.error} onRetry={waiting.retry} />
        ) : null}
        {waiting.loading ? <ListLoading /> : null}
        {!waiting.loading && !waiting.error && waiting.items.length === 0 ? (
          <EmptyState
            title="No one waiting"
            body="When security checks someone in for you, they appear here and you get a notification. Accept or decline from here."
          />
        ) : null}
        {waiting.items.map(v => (
          <WaitingCard key={v.id} visit={v} now={now} onOpen={open} />
        ))}
        {waiting.pagination.hasNextPage ? (
          <Button
            title="Load more"
            variant="ghost"
            onPress={waiting.loadMore}
            loading={waiting.loadingMore}
          />
        ) : null}
      </View>

      {current.items.length > 0 ? (
        <View style={{ gap: moderateScale(10) }}>
          <SectionTitle title="Visiting you now" />
          {current.items.map(v => (
            <VisitorCard
              key={v.id}
              visit={v}
              now={now}
              overstayHours={settings.overstayHours}
              onPress={open}
            />
          ))}
          {current.pagination.hasNextPage ? (
            <Button
              title="Load more"
              variant="ghost"
              onPress={current.loadMore}
              loading={current.loadingMore}
            />
          ) : null}
        </View>
      ) : null}

      <SectionTitle title="Earlier visitors" />
      {earlier.error ? (
        <ListError message={earlier.error} onRetry={earlier.retry} />
      ) : null}
    </View>
  );

  return (
    <FlatList
      showsVerticalScrollIndicator={false}
      showsHorizontalScrollIndicator={false}
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={styles.content}
      data={earlier.items}
      keyExtractor={v => v.id}
      renderItem={({ item }) => (
        <VisitorCard
          visit={item}
          now={now}
          overstayHours={settings.overstayHours}
          logMode
          onPress={open}
        />
      )}
      extraData={now}
      ItemSeparatorComponent={Separator}
      ListHeaderComponent={header}
      ListEmptyComponent={
        earlier.loading ? (
          <ListLoading />
        ) : earlier.error ? null : (
          <Text style={[typo.small, { color: c.muted }]}>
            Visitors who have left will be listed here.
          </Text>
        )
      }
      ListFooterComponent={<ListFooter list={earlier} />}
      onEndReached={earlier.loadMore}
      onEndReachedThreshold={0.4}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={c.muted}
          colors={[c.accent]}
        />
      }
    />
  );
}

function Separator() {
  return <View style={{ height: verticalScale(10) }} />;
}

const styles = ScaledSheet.create({
  content: { padding: '16@ms', flexGrow: 1 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: '8@ms' },
  count: {
    minWidth: '26@ms',
    height: '26@ms',
    borderRadius: '13@ms',
    paddingHorizontal: '8@s',
    alignItems: 'center',
    justifyContent: 'center',
  },
  waitingCard: {
    borderWidth: 2,
    borderRadius: radius.panel,
    padding: '14@ms',
    gap: '12@ms',
  },
});
