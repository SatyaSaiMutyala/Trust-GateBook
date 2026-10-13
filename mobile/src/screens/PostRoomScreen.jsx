import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { HeaderButton } from '../components/TopBar';
import { EmptyState } from '../components/Layout';
import { ListError, ListFooter, ListLoading } from '../components/ListFooter';
import { MailCard } from '../components/MailCard';
import {
  FilterBar,
  FilterSelect,
  FilterTabs,
  SearchBar,
} from '../components/FilterBar';
import { useNow } from '../state/useNow';
import { useTheme } from '../theme';
import { addDays, startOfDay } from '../utils/format';
import { ScaledSheet, verticalScale } from 'react-native-size-matters/extend';
import { useSelector } from 'react-redux';
import { downloadAndShareCsv } from '../api/csvExport';
import {
  errorMessage,
  useListMailInfiniteQuery,
  useMailCountsQuery,
} from '../store/api';
import { selectCanHandleMail, selectToken } from '../store/authSlice';
import { useSheets, useToast } from '../store/hooks';
import { useRemind } from '../store/mailActions';
import { useInfiniteList } from '../store/useInfiniteList';

const ZERO_COUNTS = { lodged: 0, handed: 0, disputed: 0 };
/** Counts for the whole register (same cache entry as the tab badge). */
const ALL_SCOPE = {};

const PERIODS = [
  { value: '1', label: 'Today' },
  { value: '7', label: 'Last 7 days', short: '7 days' },
  { value: '30', label: 'Last 30 days', short: '30 days' },
  { value: '60', label: 'Last 60 days', short: '60 days' },
];

const TAB_QUERY = {
  lodged: { status: 'lodged', sort: 'receivedAt' }, // oldest first
  handed: { status: 'handed', sort: '-handedAt' },
  disputed: { status: 'disputed', sort: '-receivedAt' },
  all: { sort: '-receivedAt' },
};

const EMPTY = {
  lodged: [
    'Nothing waiting',
    'Every item logged here stays in this list until it is handed over.',
  ],
  handed: [
    'Nothing pending',
    'Items handed over stay here until the receiver confirms on their phone.',
  ],
  disputed: [
    'No issues',
    'If a receiver says they did not get an item, it shows here.',
  ],
  all: ['No items', 'Nothing logged in this period.'],
};

export function PostRoomScreen({ navigation, route }) {
  const { c } = useTheme();
  const toast = useToast();
  const token = useSelector(selectToken);
  const { data: counts = ZERO_COUNTS } = useMailCountsQuery(ALL_SCOPE);
  const { openHandover, openResolve } = useSheets();
  const { remind, remindingId } = useRemind();
  const now = useNow(30000);
  const tab = TAB_QUERY[route.params?.tab] ? route.params.tab : 'lodged';
  const setTab = t => navigation.setParams({ tab: t });
  const [period, setPeriod] = useState('7');
  const [q, setQ] = useState('');
  const [exporting, setExporting] = useState(false);
  const canAct = useSelector(selectCanHandleMail);

  const dayKey = startOfDay(now).getTime();
  const from = useMemo(
    () =>
      tab === 'all'
        ? addDays(new Date(dayKey), 1 - Number(period)).toISOString()
        : undefined,
    [tab, period, dayKey],
  );
  const params = useMemo(
    () => ({ q, from, ...TAB_QUERY[tab] }),
    [q, from, tab],
  );
  const list = useInfiniteList(useListMailInfiniteQuery, params);

  const onExport = async () => {
    setExporting(true);
    try {
      const { sort, status } = TAB_QUERY[tab];
      await downloadAndShareCsv(
        'mail',
        { status, from, sort, q: q.trim() || undefined },
        token,
      );
    } catch (e) {
      toast.show(errorMessage(e), 'error');
    } finally {
      setExporting(false);
    }
  };

  const openDetails = useCallback(
    m => navigation.navigate('MailDetails', { id: m.id }),
    [navigation],
  );
  const renderItem = useCallback(
    ({ item }) => (
      <MailCard
        item={item}
        now={now}
        canAct={canAct}
        onPress={openDetails}
        onRemind={remind}
        reminding={remindingId === item.id}
        onHandover={openHandover}
        onResolve={openResolve}
      />
    ),
    [now, canAct, openDetails, remind, remindingId, openHandover, openResolve],
  );

  const tabs = [
    { value: 'lodged', label: 'To collect', count: counts.lodged },
    {
      value: 'handed',
      label: 'Awaiting',
      count: counts.handed,
      a11y: `Awaiting confirmation, ${counts.handed}`,
    },
    { value: 'disputed', label: 'Issues', count: counts.disputed, tone: 'bad' },
    { value: 'all', label: 'All items' },
  ];

  // Title comes from the tab ("Post room"); Export and Log item sit on the right of the app bar.
  useLayoutEffect(() => {
    navigation.setOptions({
      headerActions: (
        <>
          <HeaderButton
            title="Export"
            onPress={onExport}
            loading={exporting}
            accessibilityLabel="Export post register as CSV"
          />
          {canAct ? (
            <HeaderButton
              title="+ Log item"
              primary
              onPress={() => navigation.navigate('LogMail')}
              accessibilityLabel="Log new item"
            />
          ) : null}
        </>
      ),
    });
  });

  // Pinned above the list: search (period filter docked on "All items"), tabs.
  const filters = (
    <FilterBar>
      <SearchBar
        value={q}
        onChangeText={setQ}
        placeholder="Name, sender, ref no…"
        label="Search post"
        right={
          tab === 'all' ? (
            <FilterSelect
              label="Period"
              value={period}
              options={PERIODS}
              onChange={setPeriod}
              defaultValue="7"
              showValue
            />
          ) : null
        }
      />
      <FilterTabs
        accessibilityLabel="Post room lists"
        options={tabs}
        value={tab}
        onChange={setTab}
      />
    </FilterBar>
  );

  const header = list.error ? (
    <View style={styles.header}>
      <ListError message={list.error} onRetry={list.retry} />
    </View>
  ) : null;

  let empty = null;
  if (list.loading) empty = <ListLoading />;
  else if (!list.error) {
    empty = q.trim() ? (
      <EmptyState
        title="No match"
        body="Try a different name, sender or reference number."
      />
    ) : (
      <EmptyState
        title={EMPTY[tab][0]}
        body={EMPTY[tab][1]}
        action={
          tab === 'lodged' && canAct
            ? {
                title: 'Log new item',
                onPress: () => navigation.navigate('LogMail'),
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
        style={{ flex: 1, backgroundColor: c.bg }}
        contentContainerStyle={styles.content}
        data={list.items}
        keyExtractor={m => m.id}
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
  header: { gap: '10@ms', marginBottom: '12@vs' },
});
