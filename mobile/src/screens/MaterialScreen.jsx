import React, { useLayoutEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { useSelector } from 'react-redux';
import { ScaledSheet, verticalScale } from 'react-native-size-matters/extend';
import { Button } from '../components/Button';
import { FilterBar, FilterTabs, SearchBar } from '../components/FilterBar';
import { EmptyState } from '../components/Layout';
import { ListError, ListFooter, ListLoading } from '../components/ListFooter';
import { MaterialCard } from '../components/material/MaterialCard';
import { useNow } from '../state/useNow';
import { useListMaterialInfiniteQuery } from '../store/api';
import { selectCanCheckIn, selectIsGateUser } from '../store/authSlice';
import { useInfiniteList } from '../store/useInfiniteList';
import { typo, useTheme } from '../theme';

const GATE_EMPTY = {
  today: [
    'Nothing yet today',
    'Use Material IN or OUT above, or add material from a visitor’s details.',
  ],
  accept: [
    'Nothing waiting',
    'Material brought in stays here until the employee taps Received.',
  ],
  gate: [
    'Nothing to do at the gate',
    'Boxes to count out with a visitor, handed in for pickup, or collected show here.',
  ],
  open: [
    'No returnable material out',
    'Returnable passes stay here until everything is back.',
  ],
  overdue: [
    'No overdue returns',
    'Returnable material past its return date shows here.',
  ],
  all: ['No gate passes', 'Every material IN and OUT is kept here.'],
};
const MINE_EMPTY = {
  todo: [
    'Nothing to accept',
    'When a visitor or courier brings boxes for you, you get a notification and they show here.',
  ],
  sent: ['Nothing sent yet', 'Tap “Send material out” to prepare an OUT pass.'],
  in: ['Nothing received yet', 'Material you accept is kept here.'],
  all: [
    'No gate passes',
    'Material brought in for you and boxes you send out show here.',
  ],
};

/**
 * Gate users: Material gate passes (Today · To accept · At the gate · Returnable · Overdue · All, with counts).
 * Employees: Gate passes (To accept · Sent out · Received · All) and "Send material out".
 */
export function MaterialScreen({ navigation }) {
  const { c } = useTheme();
  const gate = useSelector(selectIsGateUser);
  const operator = useSelector(selectCanCheckIn);
  const now = useNow(60000);
  const [tab, setTab] = useState(gate ? 'today' : 'all');
  const [q, setQ] = useState('');
  const list = useInfiniteList(
    useListMaterialInfiniteQuery,
    useMemo(() => ({ tab, q }), [tab, q]),
  );
  const counts = list.extra?.counts ?? {};

  useLayoutEffect(() => {
    navigation.setOptions({ title: gate ? 'Material passes' : 'Gate passes' });
  }, [navigation, gate]);

  const tabs = gate
    ? [
        {
          value: 'today',
          label: `Today ${counts.boxesInToday ?? 0}/${
            counts.boxesOutToday ?? 0
          }`,
        },
        { value: 'accept', label: 'To accept', count: counts.accept },
        { value: 'gate', label: 'At the gate', count: counts.gate },
        { value: 'open', label: 'Returnable', count: counts.open },
        {
          value: 'overdue',
          label: 'Overdue',
          count: counts.overdue,
          tone: counts.overdue ? 'bad' : undefined,
        },
        { value: 'all', label: 'All' },
      ]
    : [
        { value: 'todo', label: 'To accept', count: counts.todo },
        { value: 'sent', label: 'Sent out' },
        { value: 'in', label: 'Received' },
        { value: 'all', label: 'All' },
      ];
  const open = p => navigation.navigate('MaterialDetails', { id: p.id });
  const empty = (gate ? GATE_EMPTY : MINE_EMPTY)[tab] ?? GATE_EMPTY.all;

  const header = (
    <View style={{ gap: 10, marginBottom: verticalScale(10) }}>
      {operator ? (
        <View style={styles.row}>
          <Button
            title="↓ Material IN"
            variant="ok"
            style={{ flex: 1 }}
            onPress={() =>
              navigation.navigate('MaterialForm', { direction: 'in' })
            }
          />
          <Button
            title="↑ Material OUT"
            style={{ flex: 1 }}
            onPress={() =>
              navigation.navigate('MaterialForm', { direction: 'out' })
            }
          />
        </View>
      ) : !gate ? (
        <>
          <Text style={[typo.small, { color: c.muted }]}>
            Material brought in for you comes here to accept. To send boxes out,
            prepare a pass with the number of boxes and a photo of the challan,
            then give them to a visitor who is here now or leave them with
            security. Security counts the boxes before they leave.
          </Text>
          <Button
            title="+ Send material out"
            onPress={() =>
              navigation.navigate('MaterialForm', { direction: 'out' })
            }
          />
        </>
      ) : null}
      {list.error ? (
        <ListError message={list.error} onRetry={list.retry} />
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <FilterBar>
        <SearchBar
          value={q}
          onChangeText={setQ}
          placeholder="Pass no., name, company, challan no.…"
          label="Search gate passes"
        />
        <FilterTabs
          accessibilityLabel="Gate pass lists"
          options={tabs}
          value={tab}
          onChange={setTab}
        />
      </FilterBar>
      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        data={list.items}
        keyExtractor={p => p.id}
        renderItem={({ item }) => (
          <MaterialCard pass={item} onPress={open} now={now} />
        )}
        extraData={now}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={header}
        ListEmptyComponent={
          list.loading ? (
            <ListLoading />
          ) : list.error ? null : (
            <EmptyState
              title={q.trim() ? 'No match' : empty[0]}
              body={
                q.trim()
                  ? 'Try a different pass number, name or challan number.'
                  : empty[1]
              }
            />
          )
        }
        ListFooterComponent={<ListFooter list={list} />}
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.4}
        keyboardShouldPersistTaps="handled"
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
