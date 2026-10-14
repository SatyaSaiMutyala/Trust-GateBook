import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { ScaledSheet, verticalScale } from 'react-native-size-matters/extend';
import { FilterBar, FilterTabs } from '../components/FilterBar';
import { EmptyState } from '../components/Layout';
import { ListError, ListFooter, ListLoading } from '../components/ListFooter';
import { HeaderButton } from '../components/TopBar';
import { useNow } from '../state/useNow';
import {
  errorMessage,
  useListNotificationsInfiniteQuery,
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
  useUnreadCountQuery,
} from '../store/api';
import { useToast } from '../store/hooks';
import { useInfiniteList } from '../store/useInfiniteList';
import { fonts, radius, typo, useTheme } from '../theme';
import { fmtRelative } from '../utils/format';

/** Icon per notification event (SPEC "Notifications screen"). */
export const EVENT_ICONS = {
  mail_logged: '📬',
  mail_reminder: '⏰',
  mail_confirm: '✅',
  mail_disputed: '⚠️',
};

const EMPTY = {
  all: ['No notifications yet', "You'll see post and alerts for you here."],
  unread: ['All caught up', "You're all caught up."],
};

function NotificationRow({ item: n, now, onPress }) {
  const { c } = useTheme();
  const unread = !n.readAt;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${unread ? 'Unread. ' : ''}${n.title}. ${
        n.body
      }. ${fmtRelative(n.createdAt, now)}`}
      accessibilityHint="Opens the post item"
      onPress={() => onPress(n)}
      testID={`notification-${n.id}`}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: pressed ? c.sunk : unread ? c.accentSoft : c.surface,
          borderColor: unread ? c.accentSoft : c.line,
        },
      ]}
    >
      <Text style={styles.icon}>{EVENT_ICONS[n.event] ?? '🔔'}</Text>
      <View style={styles.texts}>
        <Text
          numberOfLines={2}
          style={[typo.bodySemi, { color: c.ink, fontFamily: fonts.bodySemi }]}
        >
          {n.title}
        </Text>
        {n.body ? (
          <Text numberOfLines={3} style={[typo.small, { color: c.muted }]}>
            {n.body}
          </Text>
        ) : null}
        <Text style={[typo.monoSmall, { color: c.muted }]}>
          {fmtRelative(n.createdAt, now)}
        </Text>
      </View>
      {unread ? (
        <View
          accessibilityElementsHidden
          style={[styles.dot, { backgroundColor: c.accent }]}
        />
      ) : null}
    </Pressable>
  );
}

/**
 * Inbox of stored notifications: All · Unread (n), newest first, infinite scroll + pull-to-refresh.
 * Tapping marks the row read and opens the post item. "Mark all read" sits in the app bar.
 */
export function NotificationsScreen({ navigation }) {
  const { c } = useTheme();
  const toast = useToast();
  const now = useNow(30000);
  const [tab, setTab] = useState('all');
  const params = useMemo(
    () => ({ unread: tab === 'unread' ? 'true' : undefined }),
    [tab],
  );
  const list = useInfiniteList(useListNotificationsInfiniteQuery, params);
  const { data: badgeCount } = useUnreadCountQuery();
  const unread =
    typeof badgeCount === 'number'
      ? badgeCount
      : typeof list.extra.unreadCount === 'number'
      ? list.extra.unreadCount
      : 0;
  const [markRead] = useMarkNotificationReadMutation();
  const [markAll, { isLoading: markingAll }] =
    useMarkAllNotificationsReadMutation();

  const onMarkAll = useCallback(async () => {
    try {
      await markAll().unwrap();
    } catch (e) {
      toast.show(errorMessage(e), 'error');
    }
  }, [markAll, toast]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerActions:
        unread > 0 ? (
          <HeaderButton
            title="Mark all read"
            onPress={onMarkAll}
            loading={markingAll}
            accessibilityLabel={`Mark all ${unread} notifications read`}
          />
        ) : null,
    });
  }, [navigation, unread, onMarkAll, markingAll]);

  const open = useCallback(
    n => {
      if (!n.readAt) markRead(n.id);
      if (n.data?.type === 'mail' && n.data.id) {
        navigation.navigate('MailDetails', { id: n.data.id });
      }
    },
    [markRead, navigation],
  );

  const renderItem = useCallback(
    ({ item }) => <NotificationRow item={item} now={now} onPress={open} />,
    [now, open],
  );

  const tabs = [
    { value: 'all', label: 'All' },
    { value: 'unread', label: 'Unread', count: unread },
  ];

  let empty = null;
  if (list.loading) empty = <ListLoading />;
  else if (!list.error)
    empty = <EmptyState title={EMPTY[tab][0]} body={EMPTY[tab][1]} />;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <FilterBar>
        <FilterTabs
          accessibilityLabel="Notification lists"
          options={tabs}
          value={tab}
          onChange={setTab}
        />
      </FilterBar>
      <FlatList
        style={{ flex: 1, backgroundColor: c.bg }}
        contentContainerStyle={styles.content}
        data={list.items}
        keyExtractor={n => n.id}
        renderItem={renderItem}
        extraData={now}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={
          list.error ? (
            <ListError message={list.error} onRetry={list.retry} />
          ) : null
        }
        ListEmptyComponent={empty}
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
    </View>
  );
}

function Separator() {
  return <View style={{ height: verticalScale(8) }} />;
}

const styles = ScaledSheet.create({
  content: { padding: '16@ms', flexGrow: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: '12@ms',
    padding: '12@ms',
    borderRadius: radius.panel,
    borderWidth: 1,
  },
  icon: { includeFontPadding: false, fontSize: '22@ms', lineHeight: '26@ms' },
  texts: { flex: 1, minWidth: 0, gap: '3@ms' },
  dot: {
    width: '10@ms',
    height: '10@ms',
    borderRadius: '5@ms',
    marginTop: '6@ms',
  },
});
