import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { useListMailInfiniteQuery } from '../store/api';
import { selectCanHandleMail, selectHasModule } from '../store/authSlice';
import { useSheets } from '../store/hooks';
import { selectIssuePulse } from '../store/uiSlice';
import { useInfiniteList } from '../store/useInfiniteList';
import { fonts, MIN_TOUCH, typo, useTheme } from '../theme';
import { fmtTime } from '../utils/format';
import { Button } from './Button';
import { Thumb } from './Thumb';
import { ScaledSheet } from 'react-native-size-matters/extend';

/**
 * Red alert rows for disputed post, shown above the content of every gate screen.
 * Briefly pulses amber when a new dispute arrives over the socket.
 */
export function IssueAlerts() {
  const { c } = useTheme();
  const navigation = useNavigation();
  const canAct = useSelector(selectCanHandleMail);
  const pulse = useSelector(selectIssuePulse);
  const { openResolve } = useSheets();
  const params = useMemo(
    () => ({ status: 'disputed', limit: 5, sort: '-receivedAt' }),
    [],
  );
  const post = useSelector(selectHasModule('post'));
  const list = useInfiniteList(useListMailInfiniteQuery, params, {
    skip: !post,
  });
  const [flash] = useState(() => new Animated.Value(0));
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    flash.setValue(1);
    Animated.timing(flash, {
      toValue: 0,
      duration: 1600,
      useNativeDriver: false,
    }).start();
  }, [pulse, flash]);

  if (list.items.length === 0) return null;
  const { items, total } = list;
  const more = total - items.length;
  const bg = flash.interpolate({
    inputRange: [0, 1],
    outputRange: [c.badSoft, c.accentSoft],
  });

  return (
    <Animated.View
      style={[styles.wrap, { backgroundColor: bg, borderBottomColor: c.bad }]}
    >
      {items.map(m => (
        <View key={m.id} style={styles.row} accessibilityRole="alert">
          <Thumb url={m.coverPhotoUrl} name={m.kind} size={36} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={[typo.label, { color: c.bad }]}>
              {m.recipientName} says they did not get it
            </Text>
            <Text numberOfLines={2} style={[typo.small, { color: c.ink }]}>
              {m.kind} from {m.sender}
              {m.collectedBy ? `, handed to ${m.collectedBy}` : ''}
              {m.handedAt ? ` at ${fmtTime(m.handedAt)}` : ''}
              {m.disputeNote ? (
                <Text style={{ fontFamily: fonts.bodySemi }}>
                  {' '}
                  · “{m.disputeNote}”
                </Text>
              ) : null}
            </Text>
          </View>
          <View style={styles.actions}>
            <Button
              title="View"
              variant="ghost"
              size="sm"
              onPress={() => navigation.navigate('MailDetails', { id: m.id })}
              accessibilityLabel={`View issue for ${m.recipientName}`}
            />
            {canAct ? (
              <Button
                title="Resolve"
                variant="danger"
                size="sm"
                onPress={() => openResolve(m)}
              />
            ) : null}
          </View>
        </View>
      ))}
      {more > 0 ? (
        <Pressable
          accessibilityRole="link"
          onPress={() =>
            navigation.navigate('Main', {
              screen: 'Post',
              params: { tab: 'disputed' },
            })
          }
          style={styles.more}
        >
          <Text style={[typo.label, { color: c.bad }]}>
            {more} more {more === 1 ? 'issue' : 'issues'} · Open issues
          </Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

const styles = ScaledSheet.create({
  wrap: {
    borderBottomWidth: 1,
    paddingHorizontal: '12@s',
    paddingVertical: '6@vs',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: '10@ms',
    paddingVertical: '4@vs',
  },
  actions: { flexDirection: 'row', gap: '6@ms' },
  more: { minHeight: MIN_TOUCH, justifyContent: 'center' },
});
