import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Button } from '../components/Button';
import { EmptyState } from '../components/Layout';
import { ListError, ListFooter, ListLoading } from '../components/ListFooter';
import { MailCard } from '../components/MailCard';
import { Thumb } from '../components/Thumb';
import { useNow } from '../state/useNow';
import { fonts, MIN_TOUCH, radius, typo, useTheme } from '../theme';
import { fmtTime, fmtTimeOrDate } from '../utils/format';
import {
  ScaledSheet,
  moderateScale,
  verticalScale,
} from 'react-native-size-matters/extend';
import { useDispatch, useSelector } from 'react-redux';
import { useListMailInfiniteQuery } from '../store/api';
import { selectUser } from '../store/authSlice';
import { disputeNoteSet } from '../store/draftsSlice';
import { useConfirmMail } from '../store/mailActions';
import { useInfiniteList } from '../store/useInfiniteList';

const EARLIER = ['confirmed', 'closed', 'disputed', 'resolved'];

function SectionTitle({ title, count, tone }) {
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
        <View
          style={[
            styles.count,
            { backgroundColor: tone === 'warn' ? c.accent : c.sunk },
          ]}
        >
          <Text
            style={[
              typo.label,
              { color: tone === 'warn' ? c.accentInk : c.muted },
            ]}
          >
            {count}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** Large green-bordered card asking the receiver to confirm collection. */
function ConfirmCard({ item: m, note, onNote, onConfirm, busy, onOpen, now }) {
  const { c } = useTheme();
  return (
    <View
      style={[
        styles.confirmCard,
        { backgroundColor: c.surface, borderColor: c.ok },
      ]}
    >
      <View style={{ flexDirection: 'row', gap: moderateScale(12) }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open item details"
          onPress={() => onOpen(m)}
        >
          <Thumb url={m.coverPhotoUrl} name={m.kind} width={96} height={72} />
        </Pressable>
        <View style={{ flex: 1, gap: moderateScale(3) }}>
          <Text style={[typo.h2, { color: c.ink }]} numberOfLines={2}>
            {m.kind} from {m.sender}
          </Text>
          <Text style={[typo.small, { color: c.muted }]}>
            {[
              m.carrier ? `Via ${m.carrier}` : null,
              m.refNo || null,
              m.pieces > 1 ? `${m.pieces} pieces` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
            {` · arrived ${fmtTimeOrDate(m.receivedAt, now)}`}
          </Text>
        </View>
      </View>
      <Text style={[typo.body, { color: c.ink }]}>
        Security handed it to{' '}
        <Text style={{ fontFamily: fonts.bodySemi }}>
          {m.collectedBy || '—'}
        </Text>
        {m.handedAt ? ` at ${fmtTime(m.handedAt)}` : ''}
      </Text>
      <TextInput
        accessibilityLabel="If you did not get it, tell security why"
        placeholder="If you did not get it, tell security why"
        placeholderTextColor={c.muted}
        value={note}
        onChangeText={t => onNote(m.id, t)}
        multiline
        maxLength={300}
        style={[
          styles.note,
          {
            color: c.ink,
            borderColor: c.line,
            backgroundColor: c.sunk,
            fontFamily: fonts.body,
          },
        ]}
      />
      <View style={{ flexDirection: 'row', gap: moderateScale(10) }}>
        <Button
          title="I did not get it"
          variant="danger"
          onPress={() => onConfirm(m, false)}
          loading={busy}
          style={{ flex: 1 }}
        />
        <Button
          title="Yes, I collected it"
          variant="ok"
          onPress={() => onConfirm(m, true)}
          loading={busy}
          style={{ flex: 1.2 }}
        />
      </View>
    </View>
  );
}

export function MyPostScreen({ navigation }) {
  const { c } = useTheme();
  const user = useSelector(selectUser);
  const now = useNow(30000);
  useLayoutEffect(() => {
    navigation.setOptions({ headerSubtitle: user?.name });
  }, [navigation, user?.name]);
  const dispatch = useDispatch();
  const { confirm, busyId } = useConfirmMail();
  // Notes are keyed by item id in the drafts slice, so live refreshes never wipe what was typed.
  const notes = useSelector(st => st.drafts.disputeNotes);
  const setNote = useCallback(
    (id, note) => dispatch(disputeNoteSet({ id, note })),
    [dispatch],
  );

  const toConfirm = useInfiniteList(
    useListMailInfiniteQuery,
    useMemo(
      () => ({
        recipient: 'me',
        status: 'handed',
        sort: '-handedAt',
        limit: 10,
      }),
      [],
    ),
  );
  const waiting = useInfiniteList(
    useListMailInfiniteQuery,
    useMemo(
      () => ({
        recipient: 'me',
        status: 'lodged',
        sort: 'receivedAt',
        limit: 10,
      }),
      [],
    ),
  );
  const earlier = useInfiniteList(
    useListMailInfiniteQuery,
    useMemo(
      () => ({
        recipient: 'me',
        status: EARLIER.join(','),
        sort: '-receivedAt',
      }),
      [],
    ),
  );

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      toConfirm.refresh(),
      waiting.refresh(),
      earlier.refresh(),
    ]);
    setRefreshing(false);
  };

  const openDetails = useCallback(
    m => navigation.navigate('MailDetails', { id: m.id }),
    [navigation],
  );
  const onConfirm = async (m, ok) => {
    await confirm(m, ok, notes[m.id]);
  };

  const header = (
    <View style={{ gap: moderateScale(14), marginBottom: verticalScale(10) }}>
      {toConfirm.error ? (
        <ListError message={toConfirm.error} onRetry={toConfirm.retry} />
      ) : null}
      {toConfirm.items.length > 0 ? (
        <View style={{ gap: moderateScale(10) }}>
          <SectionTitle
            title="Please confirm you received these"
            count={toConfirm.total}
            tone="warn"
          />
          {toConfirm.items.map(m => (
            <ConfirmCard
              key={m.id}
              item={m}
              now={now}
              note={notes[m.id] ?? ''}
              onNote={setNote}
              onConfirm={onConfirm}
              busy={busyId === m.id}
              onOpen={openDetails}
            />
          ))}
          {toConfirm.pagination.hasNextPage ? (
            <Button
              title="Load more"
              variant="ghost"
              onPress={toConfirm.loadMore}
              loading={toConfirm.loadingMore}
            />
          ) : null}
        </View>
      ) : null}

      <View style={{ gap: moderateScale(10) }}>
        <SectionTitle
          title="Waiting for you at the gate"
          count={waiting.total}
          tone="warn"
        />
        {waiting.error ? (
          <ListError message={waiting.error} onRetry={waiting.retry} />
        ) : null}
        {waiting.loading ? <ListLoading /> : null}
        {!waiting.loading && !waiting.error && waiting.items.length === 0 ? (
          <EmptyState
            title="Nothing waiting"
            body="You'll see post here as soon as security logs it for you."
          />
        ) : null}
        {waiting.items.map(m => (
          <MailCard
            key={m.id}
            item={m}
            now={now}
            collectAt
            onPress={openDetails}
          />
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

      <SectionTitle title="Earlier" count={earlier.total} />
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
      keyExtractor={m => m.id}
      renderItem={({ item }) => (
        <MailCard item={item} now={now} onPress={openDetails} />
      )}
      extraData={now}
      ItemSeparatorComponent={Separator}
      ListHeaderComponent={header}
      ListEmptyComponent={
        earlier.loading ? (
          <ListLoading />
        ) : earlier.error ? null : (
          <Text style={[typo.small, { color: c.muted }]}>
            Collected and closed items will be listed here.
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
  confirmCard: {
    borderWidth: 2,
    borderRadius: radius.panel,
    padding: '14@ms',
    gap: '10@ms',
  },
  note: {
    borderWidth: 1,
    borderRadius: radius.control,
    paddingHorizontal: '12@s',
    paddingTop: '10@vs',
    minHeight: MIN_TOUCH * 1.6,
    textAlignVertical: 'top',
    fontSize: '15@ms',
  },
});
