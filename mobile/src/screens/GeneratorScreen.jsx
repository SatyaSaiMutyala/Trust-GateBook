import React, { useMemo, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSelector } from 'react-redux';
import {
  ScaledSheet,
  moderateScale,
  verticalScale,
} from 'react-native-size-matters/extend';
import { Button } from '../components/Button';
import { ChipSelect } from '../components/ChipSelect';
import { Field } from '../components/Field';
import { FilterBar, FilterTabs } from '../components/FilterBar';
import { HostStageChip } from '../components/HostStageChip';
import { EmptyState } from '../components/Layout';
import { ListError, ListFooter, ListLoading } from '../components/ListFooter';
import { Sheet } from '../components/Sheet';
import { PhotoStrip } from '../components/material/PhotoStrip';
import { useNow } from '../state/useNow';
import {
  errorMessage,
  useGenFuelMutation,
  useGenRunMutation,
  useGenRunsInfiniteQuery,
  useGenStatusQuery,
} from '../store/api';
import { selectCanCheckIn, selectIsAdmin } from '../store/authSlice';
import { useToast } from '../store/hooks';
import { useInfiniteList } from '../store/useInfiniteList';
import { radius, typo, useTheme } from '../theme';
import { fmtDateTime, fmtShortDate } from '../utils/format';
import { RUN_REASONS, dur, hrs } from '../utils/ops';

const decimal = t => t.replace(/[^\d.]/g, '');

/** Start / stop / diesel fill / level check. `kind` = start | stop | fill | check. */
function GenSheet({ kind, gen: g, onClose }) {
  const { c } = useTheme();
  const toast = useToast();
  const [reason, setReason] = useState('Power cut');
  const [note, setNote] = useState('');
  const [litres, setLitres] = useState('');
  const [levelL, setLevelL] = useState('');
  const [vendor, setVendor] = useState('');
  const [billNo, setBillNo] = useState('');
  const [amount, setAmount] = useState('');
  const [photos, setPhotos] = useState([]);
  const [error, setError] = useState(null);
  const [openedAt] = useState(() => Date.now());
  const [run, { isLoading: running }] = useGenRunMutation();
  const [fuel, { isLoading: fueling }] = useGenFuelMutation();
  const check = kind === 'check';
  const r = g.running;

  const save = async () => {
    setError(null);
    try {
      if (kind === 'start') {
        await run({
          id: g.id,
          action: 'start',
          body: { reason },
        }).unwrap();
        toast.show(`${g.name} started`);
      } else if (kind === 'stop') {
        await run({
          runId: r.id,
          action: 'stop',
          body: { note: note.trim() },
        }).unwrap();
        toast.show(
          `${g.name} stopped after ${dur(
            openedAt - new Date(r.startAt).getTime(),
          )}`,
        );
      } else {
        if (check && !photos.length) {
          setError('Take a photo of the gauge or dipstick');
          return;
        }
        await fuel({
          id: g.id,
          fields: check
            ? { kind, levelL, note: note.trim() }
            : {
                kind,
                litres,
                levelL,
                vendor: vendor.trim(),
                billNo: billNo.trim(),
                amount,
                note: note.trim(),
              },
          photo: photos[0] ?? null,
        }).unwrap();
        toast.show(check ? 'Level check saved' : `${litres} L fill saved`);
      }
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const title = {
    start: 'Start generator',
    stop: 'Stop generator',
    fill: 'Diesel fill',
    check: 'Weekly level check',
  }[kind];
  return (
    <Sheet visible onClose={onClose}>
      <View style={{ gap: moderateScale(12) }}>
        <Text style={[typo.eyebrow, { color: c.muted }]}>{title}</Text>
        <Text accessibilityRole="header" style={[typo.h2, { color: c.ink }]}>
          {g.name}
          {kind === 'fill' || check ? ` · Tank ${g.tankL} L` : ''}
        </Text>
        {kind === 'start' ? (
          <ChipSelect
            accessibilityLabel="Reason"
            options={RUN_REASONS}
            value={reason}
            onChange={setReason}
          />
        ) : null}
        {kind === 'stop' ? (
          <Text style={[typo.small, { color: c.muted }]}>
            Running since {fmtDateTime(r.startAt)} · {r.reason}
          </Text>
        ) : null}
        {kind === 'fill' || check ? (
          <PhotoStrip
            title={
              check ? 'Photo of the gauge or dipstick' : 'Photo of the bill'
            }
            label="Photo"
            value={photos}
            onChange={setPhotos}
            max={1}
            kind="boxes"
            required={check}
            hint={check ? 'Required. Make the reading visible.' : undefined}
          />
        ) : null}
        {kind === 'fill' ? (
          <Field
            label="Litres filled"
            required
            value={litres}
            onChangeText={t => setLitres(decimal(t))}
            keyboardType="decimal-pad"
          />
        ) : null}
        {kind === 'fill' || check ? (
          <Field
            label={
              check ? 'Level reading (litres)' : 'Level after filling (litres)'
            }
            required={check}
            value={levelL}
            onChangeText={t => setLevelL(decimal(t))}
            keyboardType="decimal-pad"
            hint={
              levelL && g.tankL
                ? `${Math.round((Number(levelL) / g.tankL) * 100)}% of the tank`
                : undefined
            }
          />
        ) : null}
        {kind === 'fill' ? (
          <>
            <Field
              label="Supplier / bunk"
              placeholder="e.g. HP petrol bunk, Begumpet"
              value={vendor}
              onChangeText={setVendor}
            />
            <View style={styles.row}>
              <Field
                label="Bill number"
                value={billNo}
                onChangeText={setBillNo}
                style={{ flex: 1 }}
              />
              <Field
                label="Amount (₹)"
                value={amount}
                onChangeText={t => setAmount(decimal(t))}
                keyboardType="decimal-pad"
                style={{ flex: 1 }}
              />
            </View>
          </>
        ) : null}
        {kind !== 'start' ? (
          <Field
            label="Note"
            placeholder={kind === 'stop' ? 'e.g. Grid power restored' : ''}
            value={note}
            onChangeText={setNote}
          />
        ) : null}
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
            title={
              kind === 'start'
                ? 'Start now'
                : kind === 'stop'
                ? 'Stop now'
                : 'Save'
            }
            variant={
              kind === 'stop'
                ? 'destructive'
                : kind === 'start'
                ? 'ok'
                : 'primary'
            }
            style={{ flex: 2 }}
            loading={running || fueling}
            onPress={save}
          />
        </View>
      </View>
    </Sheet>
  );
}

function GenCard({ g, now, operator, open }) {
  const { c } = useTheme();
  const e = g.estimate;
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: c.surface,
          borderColor: g.low || g.checkOverdue ? c.bad : c.line,
        },
      ]}
    >
      <View style={styles.row}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[typo.h3, { color: c.ink }]}>{g.name}</Text>
          <Text style={[typo.small, { color: c.muted }]}>
            {[g.kva && `${g.kva} kVA`, `Tank ${g.tankL} L`]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
        <HostStageChip
          stage={
            g.running
              ? {
                  label: `Running ${dur(
                    now - new Date(g.running.startAt).getTime(),
                  )}`,
                  tone: 'go',
                }
              : { label: 'Off', tone: 'neutral' }
          }
        />
      </View>
      <Text style={[typo.bodySemi, { color: c.ink }]}>Diesel in tank</Text>
      {e ? (
        <>
          <Text style={[typo.body, { color: g.low ? c.bad : c.ink }]}>
            About {Math.round(e.litres)} L of {g.tankL} L ·{' '}
            {Math.round(e.pct ?? 0)}%{g.low ? ' · Low: arrange refill' : ''}
          </Text>
          <View style={[styles.bar, { backgroundColor: c.sunk }]}>
            <View
              style={{
                width: `${Math.min(100, e.pct ?? 0)}%`,
                height: '100%',
                backgroundColor: g.low ? c.bad : c.ok,
              }}
            />
          </View>
        </>
      ) : (
        <Text style={[typo.small, { color: c.muted }]}>
          No level reading yet. Record the weekly level check to start tracking
          diesel.
        </Text>
      )}
      <Text style={[typo.small, { color: g.checkOverdue ? c.bad : c.muted }]}>
        Level check:{' '}
        {g.checkOverdue
          ? `overdue since ${fmtShortDate(g.checkDueAt)}`
          : `next due ${fmtShortDate(g.checkDueAt)}`}
        {g.lastCheck
          ? ` · last ${fmtShortDate(g.lastCheck.at)}, ${g.lastCheck.levelL} L`
          : ''}
      </Text>
      <Text style={[typo.small, { color: c.muted }]}>
        This month: {hrs(g.month.hours)} run · {g.month.starts} starts ·{' '}
        {g.month.filledL} L filled
      </Text>
      {operator ? (
        <View style={styles.wrap}>
          {g.running ? (
            <Button
              title="Stop generator"
              variant="destructive"
              onPress={() => open('stop', g)}
            />
          ) : (
            <Button
              title="Start generator"
              variant="ok"
              onPress={() => open('start', g)}
            />
          )}
          <Button
            title="Log diesel fill"
            variant="ghost"
            onPress={() => open('fill', g)}
          />
          <Button
            title="Weekly level check"
            variant={g.checkOverdue ? 'primary' : 'ghost'}
            onPress={() => open('check', g)}
          />
        </View>
      ) : null}
    </View>
  );
}

function RunLog() {
  const { c } = useTheme();
  const list = useInfiniteList(
    useGenRunsInfiniteQuery,
    useMemo(() => ({ days: 30 }), []),
  );
  return (
    <FlatList
      showsVerticalScrollIndicator={false}
      showsHorizontalScrollIndicator={false}
      style={{ flex: 1 }}
      contentContainerStyle={styles.content}
      data={list.items}
      keyExtractor={r => r.id}
      ItemSeparatorComponent={Separator}
      ListHeaderComponent={
        list.extra?.hours != null ? (
          <Text
            style={[
              typo.body,
              { color: c.ink, marginBottom: verticalScale(10) },
            ]}
          >
            {hrs(list.extra.hours)} run in the last 30 days
          </Text>
        ) : null
      }
      renderItem={({ item: r }) => (
        <View
          style={[
            styles.card,
            { backgroundColor: c.surface, borderColor: c.line },
          ]}
        >
          <Text style={[typo.bodySemi, { color: c.ink }]}>
            {r.genName} · {r.reason} · {hrs(r.hours)}
          </Text>
          <Text style={[typo.small, { color: c.muted }]}>
            {fmtDateTime(r.startAt)} →{' '}
            {r.stopAt ? fmtDateTime(r.stopAt) : 'running'} · {r.startedBy?.name}
            {r.note ? ` · ${r.note}` : ''}
          </Text>
        </View>
      )}
      ListEmptyComponent={
        list.loading ? (
          <ListLoading />
        ) : list.error ? (
          <ListError message={list.error} onRetry={list.retry} />
        ) : (
          <EmptyState
            title="No runs recorded"
            body="Start and stop the generator here every time it runs, including weekly test runs."
          />
        )
      }
      ListFooterComponent={<ListFooter list={list} />}
      onEndReached={list.loadMore}
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

/** Generator & diesel (gate users with the module): status and actions, run log. */
export function GeneratorScreen() {
  const { c } = useTheme();
  const operator = useSelector(selectCanCheckIn);
  const admin = useSelector(selectIsAdmin);
  const now = useNow(30000).getTime();
  const [tab, setTab] = useState('status');
  const [sheet, setSheet] = useState(null);
  const { data, error, isLoading, isFetching, refetch } = useGenStatusQuery();
  const gens = (data?.generators ?? []).filter(g => g.active);
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <FilterBar>
        <FilterTabs
          accessibilityLabel="Generator"
          options={[
            { value: 'status', label: 'Status' },
            { value: 'runs', label: 'Run log' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </FilterBar>
      {tab === 'runs' ? (
        <RunLog />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.content, { gap: moderateScale(14) }]}
          refreshControl={
            <RefreshControl
              refreshing={isFetching && !isLoading}
              onRefresh={refetch}
              tintColor={c.muted}
              colors={[c.accent]}
            />
          }
        >
          {isLoading ? <ListLoading /> : null}
          {error ? (
            <ListError message={errorMessage(error)} onRetry={refetch} />
          ) : null}
          {data && !gens.length ? (
            <EmptyState
              title="No generator set up"
              body={
                admin
                  ? 'Add the generator with its tank size in Settings → Generator on the web.'
                  : 'Ask your admin to add the generator.'
              }
            />
          ) : null}
          {gens.map(g => (
            <GenCard
              key={g.id}
              g={g}
              now={now}
              operator={operator}
              open={(kind, gen) => setSheet({ kind, gen })}
            />
          ))}
        </ScrollView>
      )}
      {sheet ? (
        <GenSheet
          kind={sheet.kind}
          gen={sheet.gen}
          onClose={() => setSheet(null)}
        />
      ) : null}
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
    padding: '14@ms',
    gap: '8@ms',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: '10@ms' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: '8@ms' },
  bar: { height: '10@ms', borderRadius: '5@ms', overflow: 'hidden' },
});
