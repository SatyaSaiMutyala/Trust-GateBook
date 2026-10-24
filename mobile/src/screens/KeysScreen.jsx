import React, { useMemo, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { useSelector } from 'react-redux';
import {
  ScaledSheet,
  moderateScale,
  verticalScale,
} from 'react-native-size-matters/extend';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { FilterBar, FilterTabs, SearchBar } from '../components/FilterBar';
import { HostStageChip } from '../components/HostStageChip';
import { EmptyState } from '../components/Layout';
import { ListError, ListFooter, ListLoading } from '../components/ListFooter';
import { Sheet } from '../components/Sheet';
import { useNow } from '../state/useNow';
import {
  errorMessage,
  useKeyBoardQuery,
  useKeyDiaryInfiniteQuery,
  useReturnKeyMutation,
} from '../store/api';
import { selectCanCheckIn } from '../store/authSlice';
import { useToast } from '../store/hooks';
import { useInfiniteList } from '../store/useInfiniteList';
import { fonts, radius, typo, useTheme } from '../theme';
import { fmtDateTime, fmtRelative, fmtTime } from '../utils/format';
import { DIARY_PERIODS, KEY_STATE, freeCopies } from '../utils/keys';
import { LockIcon } from '../components/Glyphs';

const CHIP = { ok: 'go', warn: 'wait', bad: 'bad', muted: 'neutral' };

/** Take a key back: who returned it and a note. */
export function ReturnKeySheet({ move: m, onClose }) {
  const { c } = useTheme();
  const toast = useToast();
  const [by, setBy] = useState(m.taker.name);
  const [note, setNote] = useState('');
  const [error, setError] = useState(null);
  const [giveBack, { isLoading }] = useReturnKeyMutation();
  const save = async () => {
    setError(null);
    try {
      await giveBack({
        moveId: m.id,
        body: { returnedByName: by.trim(), note: note.trim() },
      }).unwrap();
      toast.show(`Key ${m.key.number} is back`);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  return (
    <Sheet visible onClose={onClose}>
      <View style={{ gap: moderateScale(12) }}>
        <Text style={[typo.eyebrow, { color: c.muted }]}>
          Key {m.key.number}
        </Text>
        <Text accessibilityRole="header" style={[typo.h2, { color: c.ink }]}>
          Take back: {m.key.name}
        </Text>
        <Text style={[typo.small, { color: c.muted }]}>
          Taken by {m.taker.name} at {fmtDateTime(m.issuedAt)}
          {m.dueAt ? ` · due ${fmtDateTime(m.dueAt)}` : ''}.
        </Text>
        <Field label="Returned by" value={by} onChangeText={setBy} />
        <Field
          label="Note (optional)"
          value={note}
          onChangeText={setNote}
          multiline
        />
        {error ? (
          <Text style={[typo.bodyMedium, { color: c.bad }]}>{error}</Text>
        ) : null}
        <View style={styles.row}>
          <Button
            title="Back"
            variant="ghost"
            style={{ flex: 1 }}
            onPress={onClose}
          />
          <Button
            title="Key is back"
            variant="ok"
            style={{ flex: 2 }}
            loading={isLoading}
            onPress={save}
          />
        </View>
      </View>
    </Sheet>
  );
}

function OutLine({ move: m, now, onReturn }) {
  const { c } = useTheme();
  const s = KEY_STATE[m.state];
  return (
    <View style={[styles.outLine, { borderTopColor: c.line }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[typo.bodyMedium, { color: c.ink }]} numberOfLines={1}>
          {m.taker.name}
          {m.taker.phone ? ` · ${m.taker.phone}` : ''}
        </Text>
        <Text
          style={[
            typo.small,
            { color: m.state === 'overdue' ? c.bad : c.muted },
          ]}
          numberOfLines={2}
        >
          Out {fmtRelative(m.issuedAt, now)}
          {m.dueAt
            ? ` · ${m.state === 'overdue' ? 'was due' : 'due'} ${fmtTime(
                m.dueAt,
              )}`
            : ' · no return time'}
          {m.purpose ? ` · ${m.purpose}` : ''}
        </Text>
        <HostStageChip stage={{ label: s.label, tone: CHIP[s.tone] }} />
      </View>
      {onReturn ? (
        <Button
          title="Return"
          variant="ghost"
          size="sm"
          onPress={() => onReturn(m)}
          accessibilityLabel={`Take back key ${m.key.number} from ${m.taker.name}`}
        />
      ) : null}
    </View>
  );
}

function KeyCard({ k, now, operator, onIssue, onReturn }) {
  const { c } = useTheme();
  const free = freeCopies(k);
  const overdue = k.out.some(m => m.state === 'overdue');
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: c.surface,
          borderColor: overdue ? c.bad : k.out.length ? c.accent : c.line,
        },
      ]}
    >
      <View style={styles.cardHead}>
        <View
          style={[
            styles.tag,
            { backgroundColor: free ? c.okSoft : c.accentSoft },
          ]}
        >
          <Text
            style={[
              styles.tagNo,
              { color: free ? c.ok : c.warn, fontFamily: fonts.mono },
            ]}
          >
            {k.number}
          </Text>
          <Text style={[typo.small, { color: free ? c.ok : c.warn }]}>
            {free ? (k.copies > 1 ? `${free} of ${k.copies} in` : 'In') : 'Out'}
          </Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={styles.nameRow}>
            {k.restricted ? <LockIcon color={c.warn} size={13} /> : null}
            <Text
              style={[typo.bodyMedium, { color: c.ink, flexShrink: 1 }]}
              numberOfLines={1}
            >
              {k.name}
            </Text>
          </View>
          <Text style={[typo.small, { color: c.muted }]} numberOfLines={1}>
            {[k.location, k.site].filter(Boolean).join(' · ')}
          </Text>
        </View>
        {operator && free ? (
          <Button title="Issue" size="sm" onPress={() => onIssue(k)} />
        ) : null}
      </View>
      {k.out.map(m => (
        <OutLine
          key={m.id}
          move={m}
          now={now}
          onReturn={operator ? onReturn : null}
        />
      ))}
    </View>
  );
}

function Board({ q, now, operator, navigation, onReturn }) {
  const { c } = useTheme();
  const { data, error, isLoading, isFetching, refetch } = useKeyBoardQuery();
  const query = q.trim().toLowerCase();
  const keys = (data?.keys ?? []).filter(
    k =>
      k.active &&
      (!query ||
        [k.number, k.name, k.location].some(v =>
          (v ?? '').toLowerCase().includes(query),
        )),
  );
  const counts = data?.counts;
  return (
    <FlatList
      showsVerticalScrollIndicator={false}
      showsHorizontalScrollIndicator={false}
      style={{ flex: 1 }}
      contentContainerStyle={styles.content}
      data={keys}
      keyExtractor={k => k.id}
      extraData={now}
      renderItem={({ item }) => (
        <KeyCard
          k={item}
          now={now}
          operator={operator}
          onIssue={k => navigation.navigate('KeyIssue', { key: k })}
          onReturn={onReturn}
        />
      )}
      ItemSeparatorComponent={Separator}
      ListHeaderComponent={
        <View style={{ gap: 10, marginBottom: verticalScale(10) }}>
          {counts ? (
            <Text style={[typo.body, { color: c.muted }]}>
              {counts.total} keys · {counts.out} out
              {counts.overdue ? ` · ${counts.overdue} overdue` : ''}
            </Text>
          ) : null}
          {error ? (
            <ListError message={errorMessage(error)} onRetry={refetch} />
          ) : null}
        </View>
      }
      ListEmptyComponent={
        isLoading ? (
          <ListLoading />
        ) : error ? null : (
          <EmptyState
            title={query ? 'No match' : 'No keys yet'}
            body={
              query
                ? 'Try a different key number or name.'
                : 'An admin adds the keys kept at the gate in Settings → Keys on the web.'
            }
          />
        )
      }
      refreshControl={
        <RefreshControl
          refreshing={isFetching && !isLoading}
          onRefresh={refetch}
          tintColor={c.muted}
          colors={[c.accent]}
        />
      }
    />
  );
}

function Diary({ q, period, operator, onReturn }) {
  const { c } = useTheme();
  const list = useInfiniteList(
    useKeyDiaryInfiniteQuery,
    useMemo(() => ({ q, period }), [q, period]),
  );
  return (
    <FlatList
      showsVerticalScrollIndicator={false}
      showsHorizontalScrollIndicator={false}
      style={{ flex: 1 }}
      contentContainerStyle={styles.content}
      data={list.items}
      keyExtractor={m => m.id}
      renderItem={({ item: m }) => {
        const s = KEY_STATE[m.state];
        return (
          <View
            style={[
              styles.card,
              { backgroundColor: c.surface, borderColor: c.line },
            ]}
          >
            <View style={styles.cardHead}>
              <Text
                style={[
                  typo.bodyMedium,
                  { color: c.ink, fontFamily: fonts.mono, minWidth: 56 },
                ]}
              >
                {m.key.number}
              </Text>
              <View style={{ flex: 1, gap: 2 }}>
                <Text
                  style={[typo.bodyMedium, { color: c.ink }]}
                  numberOfLines={1}
                >
                  {m.key.name} · {m.taker.name}
                </Text>
                <Text style={[typo.small, { color: c.muted }]}>
                  Issued {fmtDateTime(m.issuedAt)} by {m.issuedBy.name}
                  {m.dueAt ? ` · due ${fmtDateTime(m.dueAt)}` : ''}
                  {m.returnedAt ? ` · back ${fmtDateTime(m.returnedAt)}` : ''}
                  {m.purpose ? ` · ${m.purpose}` : ''}
                </Text>
                <HostStageChip stage={{ label: s.label, tone: CHIP[s.tone] }} />
              </View>
              {operator && !m.returnedAt ? (
                <Button
                  title="Return"
                  variant="ghost"
                  size="sm"
                  onPress={() => onReturn(m)}
                />
              ) : null}
            </View>
          </View>
        );
      }}
      ItemSeparatorComponent={Separator}
      ListHeaderComponent={
        list.error ? (
          <ListError message={list.error} onRetry={list.retry} />
        ) : null
      }
      ListEmptyComponent={
        list.loading ? (
          <ListLoading />
        ) : list.error ? null : (
          <EmptyState
            title="Nothing in the diary"
            body="Every key issued and returned is kept here."
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

/** Key register (gate users with the Keys module): the key board and the key diary. */
export function KeysScreen({ navigation }) {
  const { c } = useTheme();
  const operator = useSelector(selectCanCheckIn);
  const now = useNow(60000);
  const [tab, setTab] = useState('board');
  const [period, setPeriod] = useState('7d');
  const [q, setQ] = useState('');
  const [returning, setReturning] = useState(null);
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <FilterBar>
        <SearchBar
          value={q}
          onChangeText={setQ}
          placeholder={
            tab === 'board' ? 'Key number, what it opens…' : 'Key, person…'
          }
          label="Search keys"
        />
        <FilterTabs
          accessibilityLabel="Key register"
          options={[
            { value: 'board', label: 'Key board' },
            { value: 'diary', label: 'Key diary' },
          ]}
          value={tab}
          onChange={setTab}
        />
        {tab === 'diary' ? (
          <FilterTabs
            accessibilityLabel="Diary period"
            options={DIARY_PERIODS.map(([value, label]) => ({ value, label }))}
            value={period}
            onChange={setPeriod}
          />
        ) : null}
      </FilterBar>
      {tab === 'board' ? (
        <Board
          q={q}
          now={now}
          operator={operator}
          navigation={navigation}
          onReturn={setReturning}
        />
      ) : (
        <Diary
          q={q}
          period={period}
          operator={operator}
          onReturn={setReturning}
        />
      )}
      {returning ? (
        <ReturnKeySheet move={returning} onClose={() => setReturning(null)} />
      ) : null}
    </View>
  );
}

function Separator() {
  return <View style={{ height: verticalScale(10) }} />;
}

const styles = ScaledSheet.create({
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: '5@ms' },
  content: { padding: '16@ms', flexGrow: 1 },
  row: { flexDirection: 'row', gap: '10@ms' },
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
  outLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: '10@ms',
    borderTopWidth: 1,
    paddingTop: '8@vs',
  },
});
