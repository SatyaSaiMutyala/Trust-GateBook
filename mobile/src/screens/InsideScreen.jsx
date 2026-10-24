import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { HeaderButton, HeaderText } from '../components/TopBar';
import { FilterBar, FilterTabs, SearchBar } from '../components/FilterBar';
import { EmptyState } from '../components/Layout';
import { ListError, ListFooter, ListLoading } from '../components/ListFooter';
import { VisitorCard } from '../components/VisitorCard';
import { useNow } from '../state/useNow';
import { useTheme } from '../theme';
import { ScaledSheet, verticalScale } from 'react-native-size-matters/extend';
import { useSelector } from 'react-redux';
import {
  useInsideCountQuery,
  useInsideInfiniteQuery,
  useMyWaitingCountQuery,
} from '../store/api';
import { selectCanCheckIn, selectIsRecipient } from '../store/authSlice';
import { useSettings, useSheets } from '../store/hooks';
import { useInfiniteList } from '../store/useInfiniteList';

export function InsideScreen({ navigation, route }) {
  const { c } = useTheme();
  const canCheckIn = useSelector(selectCanCheckIn);
  const settings = useSettings();
  const { openExit } = useSheets();
  const now = useNow(30000);
  const [q, setQ] = useState('');
  const overstayOnly = !!route.params?.overstay;

  const params = useMemo(
    () => ({
      q,
      overstay: overstayOnly ? 'true' : undefined,
      sort: 'inAt',
    }),
    [q, overstayOnly],
  );
  const list = useInfiniteList(useInsideInfiniteQuery, params);
  const { data: insideTotal } = useInsideCountQuery(undefined);
  // Gate users who also receive visitors reach their own visitors from here.
  const recipient = useSelector(selectIsRecipient);
  const { data: myWaiting = 0 } = useMyWaitingCountQuery(undefined, {
    skip: !recipient,
  });

  const openDetails = useCallback(
    v => navigation.navigate('VisitDetails', { id: v.id }),
    [navigation],
  );
  const onExit = canCheckIn ? openExit : undefined;

  const renderItem = useCallback(
    ({ item }) => (
      <VisitorCard
        visit={item}
        now={now}
        overstayHours={settings.overstayHours}
        onPress={openDetails}
        onExit={onExit}
      />
    ),
    [now, settings.overstayHours, openDetails, onExit],
  );

  // Title comes from the tab ("Inside now"); the live count and Today link sit on the app bar.
  useLayoutEffect(() => {
    navigation.setOptions({
      headerActions: (
        <>
          <HeaderText
            tone="ok"
            accessibilityLabel={`${insideTotal ?? 0} inside`}
          >
            {insideTotal ?? '–'} in
          </HeaderText>
          {recipient ? (
            <HeaderButton
              title={myWaiting ? `Mine · ${myWaiting}` : 'Mine'}
              onPress={() => navigation.navigate('MyVisitors')}
              accessibilityLabel={`My visitors${
                myWaiting ? `, ${myWaiting} waiting for you` : ''
              }`}
            />
          ) : null}
          <HeaderButton
            title="Today"
            onPress={() => navigation.navigate('Today')}
            accessibilityLabel="Today at the gate overview"
          />
        </>
      ),
    });
  }, [navigation, insideTotal, recipient, myWaiting]);

  // Pinned above the list: search, everyone / overstay tabs.
  const filters = (
    <FilterBar>
      <SearchBar
        value={q}
        onChangeText={setQ}
        placeholder="Name, phone, pass…"
        label="Search inside"
      />
      <FilterTabs
        accessibilityLabel="Who to show"
        options={[
          { value: 'all', label: 'Everyone', count: insideTotal ?? 0 },
          {
            value: 'over',
            label: `Over ${settings.overstayHours} h`,
            a11y: `Inside longer than ${settings.overstayHours} hours`,
          },
        ]}
        value={overstayOnly ? 'over' : 'all'}
        onChange={v =>
          navigation.setParams({ overstay: v === 'over' ? true : undefined })
        }
      />
    </FilterBar>
  );

  const header = list.error ? (
    <View style={{ marginBottom: verticalScale(12) }}>
      <ListError message={list.error} onRetry={list.retry} />
    </View>
  ) : null;

  let empty = null;
  if (list.loading) empty = <ListLoading />;
  else if (!list.error) {
    empty = q.trim() ? (
      <EmptyState
        title="No match"
        body="Try a different name, number or pass."
      />
    ) : overstayOnly ? (
      <EmptyState
        title="No overstays"
        body={`No one has been inside longer than ${settings.overstayHours} hours.`}
      />
    ) : (
      <EmptyState
        title="Nobody inside"
        body="Visitors appear here as soon as they are checked in, and leave this list when their exit is recorded."
        action={
          canCheckIn
            ? {
                title: 'Check in a visitor',
                onPress: () => navigation.navigate('CheckIn'),
              }
            : undefined
        }
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {filters}
      <FlatList
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        style={{ flex: 1, backgroundColor: c.bg }}
        contentContainerStyle={styles.content}
        data={list.items}
        keyExtractor={v => v.id}
        renderItem={renderItem}
        extraData={now}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={<ListFooter list={list} />}
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.4}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl
            refreshing={list.refreshing}
            onRefresh={list.refresh}
            tintColor={c.muted}
            colors={[c.accent]}
          />
        }
      />
    </View>
  );
}

function Separator() {
  return <View style={{ height: verticalScale(10) }} />;
}

const styles = ScaledSheet.create({
  content: { padding: '16@ms', flexGrow: 1 },
});
