import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { HeaderButton } from '../components/TopBar';
import { DateTimeField } from '../components/DateTimeField';
import { EmptyState } from '../components/Layout';
import { ListError, ListFooter, ListLoading } from '../components/ListFooter';
import {
  FilterBar,
  FilterSelect,
  FilterTabs,
  SearchBar,
} from '../components/FilterBar';
import { VisitorCard } from '../components/VisitorCard';
import { useNow } from '../state/useNow';
import { typo, useTheme } from '../theme';
import { addDays, fmtNumber, plural, startOfDay } from '../utils/format';
import {
  ScaledSheet,
  moderateScale,
  verticalScale,
} from 'react-native-size-matters/extend';
import { useSelector } from 'react-redux';
import { downloadAndShareCsv } from '../api/csvExport';
import { errorMessage, useListVisitsInfiniteQuery } from '../store/api';
import { selectToken } from '../store/authSlice';
import { useSettings, useToast } from '../store/hooks';
import { useInfiniteList } from '../store/useInfiniteList';

const RANGES = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: 'dates', label: 'Pick dates' },
];

const STATUSES = [
  { value: 'all', label: 'All statuses', short: 'All' },
  { value: 'in', label: 'Inside' },
  { value: 'out', label: 'Exited' },
  { value: 'over', label: 'Overstay' },
  { value: 'waiting', label: 'Waiting at gate', short: 'Waiting' },
  { value: 'declined', label: 'Host declined', short: 'Declined' },
  { value: 'noreply', label: 'Host did not reply', short: 'No reply' },
];

/** [from, to) for the chosen range, local days. */
function rangeBounds(range, customFrom, customTo, today) {
  const t0 = startOfDay(today);
  switch (range) {
    case 'yesterday':
      return [addDays(t0, -1), t0];
    case '7d':
      return [addDays(t0, -6), addDays(t0, 1)];
    case '30d':
      return [addDays(t0, -29), addDays(t0, 1)];
    case 'dates': {
      const a = startOfDay(customFrom);
      const b = startOfDay(customTo);
      return a <= b ? [a, addDays(b, 1)] : [b, addDays(a, 1)];
    }
    default:
      return [t0, addDays(t0, 1)];
  }
}

export function LogScreen({ navigation }) {
  const { c } = useTheme();
  const toast = useToast();
  const token = useSelector(selectToken);
  const settings = useSettings();
  const now = useNow(30000);
  const [range, setRange] = useState('today');
  const [customFrom, setCustomFrom] = useState(() => addDays(new Date(), -7));
  const [customTo, setCustomTo] = useState(() => new Date());
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const [exporting, setExporting] = useState(false);

  const dayKey = startOfDay(now).getTime(); // ranges roll over at midnight
  const [from, to] = useMemo(
    () => rangeBounds(range, customFrom, customTo, new Date(dayKey)),
    [range, customFrom, customTo, dayKey],
  );

  const params = useMemo(
    () => ({
      from: from.toISOString(),
      to: to.toISOString(),
      status,
      q,
      sort: '-inAt',
    }),
    [from, to, status, q],
  );
  const list = useInfiniteList(useListVisitsInfiniteQuery, params);

  const onExport = async () => {
    setExporting(true);
    try {
      await downloadAndShareCsv(
        'visits',
        {
          from: params.from,
          to: params.to,
          status,
          q: q.trim() || undefined,
          sort: '-inAt',
        },
        token,
      );
    } catch (e) {
      toast.show(errorMessage(e), 'error');
    } finally {
      setExporting(false);
    }
  };

  // Title comes from the tab ("Visitor log"); Export sits on the right of the app bar.
  useLayoutEffect(() => {
    navigation.setOptions({
      headerActions: (
        <HeaderButton
          title="Export"
          onPress={onExport}
          loading={exporting}
          accessibilityLabel="Export CSV"
        />
      ),
    });
  });

  const openDetails = useCallback(
    v => navigation.navigate('VisitDetails', { id: v.id }),
    [navigation],
  );
  const renderItem = useCallback(
    ({ item }) => (
      <VisitorCard
        visit={item}
        now={now}
        overstayHours={settings.overstayHours}
        logMode
        onPress={openDetails}
      />
    ),
    [now, settings.overstayHours, openDetails],
  );

  const summary = list.extra.summary;

  // Pinned above the list: search with the status filter docked, date-range pills.
  const filters = (
    <FilterBar>
      <SearchBar
        value={q}
        onChangeText={setQ}
        placeholder="Name, phone, pass, company…"
        label="Search log"
        right={
          <FilterSelect
            label="Status"
            value={status}
            options={STATUSES}
            onChange={setStatus}
            defaultValue="all"
          />
        }
      />
      <FilterTabs
        accessibilityLabel="Date range"
        options={RANGES}
        value={range}
        onChange={setRange}
      />
      {range === 'dates' ? (
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <DateTimeField
              label="From"
              mode="date"
              value={customFrom}
              onChange={setCustomFrom}
              maximumDate={new Date()}
            />
          </View>
          <View style={{ flex: 1 }}>
            <DateTimeField
              label="To"
              mode="date"
              value={customTo}
              onChange={setCustomTo}
              maximumDate={new Date()}
            />
          </View>
        </View>
      ) : null}
    </FilterBar>
  );

  // Scrolls with the list: result summary and errors.
  const header = (
    <View style={{ gap: moderateScale(10), marginBottom: verticalScale(10) }}>
      {!list.loading && !list.error ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[typo.smallMedium, { color: c.muted }]}
        >
          {plural(list.total, 'entry', 'entries')}
          {summary
            ? ` · ${plural(summary.persons ?? 0, 'person')} · ${fmtNumber(
                summary.inside ?? 0,
              )} still inside`
            : ''}
        </Text>
      ) : null}
      {list.error ? (
        <ListError message={list.error} onRetry={list.retry} />
      ) : null}
    </View>
  );

  let empty = null;
  if (list.loading) empty = <ListLoading />;
  else if (!list.error)
    empty = (
      <EmptyState
        title="No entries"
        body={
          q.trim() || status !== 'all'
            ? 'Nothing matches these filters. Try a wider date range or clear the search.'
            : 'No visitors in this period. Try a wider date range.'
        }
      />
    );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {filters}
      <FlatList
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
  row: { flexDirection: 'row', gap: '10@ms' },
});
