import React, { useMemo, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { useSelector } from 'react-redux';
import { ScaledSheet, verticalScale } from 'react-native-size-matters/extend';
import { Button } from '../components/Button';
import { FilterBar, FilterTabs, SearchBar } from '../components/FilterBar';
import { IncidentCard } from '../components/incidents/IncidentCard';
import { EmptyState } from '../components/Layout';
import { ListError, ListFooter, ListLoading } from '../components/ListFooter';
import { useNow } from '../state/useNow';
import { useListIncidentsInfiniteQuery } from '../store/api';
import { selectIsGateUser, selectRole } from '../store/authSlice';
import { useInfiniteList } from '../store/useInfiniteList';
import { typo, useTheme } from '../theme';

/**
 * Incidents: Open · Closed · All and "+ Report incident". Gate users see every incident; others the ones they
 * reported or were given.
 */
export function IncidentsScreen({ navigation }) {
  const { c } = useTheme();
  const gate = useSelector(selectIsGateUser);
  const canReport = useSelector(selectRole) !== 'viewer';
  const now = useNow(60000);
  const [tab, setTab] = useState('open');
  const [q, setQ] = useState('');
  const list = useInfiniteList(
    useListIncidentsInfiniteQuery,
    useMemo(() => ({ tab, q }), [tab, q]),
  );
  const counts = list.extra?.counts ?? {};
  const open = i => navigation.navigate('IncidentDetails', { id: i.id });

  const header = (
    <View style={{ gap: 10, marginBottom: verticalScale(10) }}>
      {!gate ? (
        <Text style={[typo.small, { color: c.muted }]}>
          Report anything unsafe or wrong on site: a leak, a fault, something
          missing, someone who should not be here. Security follows it up.
        </Text>
      ) : null}
      {canReport ? (
        <Button
          title="+ Report incident"
          onPress={() => navigation.navigate('IncidentForm')}
        />
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
          placeholder="Incident no., type, place…"
          label="Search incidents"
        />
        <FilterTabs
          accessibilityLabel="Incident lists"
          options={[
            {
              value: 'open',
              label: 'Open',
              count: counts.open,
              tone: counts.critical ? 'bad' : undefined,
            },
            { value: 'closed', label: 'Closed' },
            { value: 'all', label: 'All' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </FilterBar>
      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        data={list.items}
        keyExtractor={i => i.id}
        renderItem={({ item }) => (
          <IncidentCard incident={item} now={now} onPress={open} />
        )}
        extraData={now}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={header}
        ListEmptyComponent={
          list.loading ? (
            <ListLoading />
          ) : list.error ? null : (
            <EmptyState
              title={
                q.trim()
                  ? 'No match'
                  : tab === 'open'
                  ? 'No open incidents'
                  : 'No incidents'
              }
              body={
                q.trim()
                  ? 'Try a different incident number, type or place.'
                  : 'Incidents reported on site show here.'
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
});
