import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { typo, useTheme } from '../theme';
import { Button } from './Button';
import { ScaledSheet, verticalScale } from 'react-native-size-matters/extend';

/** FlatList footer: spinner while the next page loads, error + retry if it failed. */
export function ListFooter({ list }) {
  const { c } = useTheme();
  if (list.loadingMore) {
    return (
      <View style={styles.wrap} accessibilityLabel="Loading more">
        <ActivityIndicator color={c.muted} />
      </View>
    );
  }
  if (list.moreError) {
    return (
      <View style={styles.wrap}>
        <Text style={[typo.small, { color: c.bad, textAlign: 'center' }]}>
          {list.moreError}
        </Text>
        <Button title="Retry" variant="ghost" size="sm" onPress={list.retry} />
      </View>
    );
  }
  return <View style={{ height: verticalScale(24) }} />;
}

/** Full-list error with a retry button (first page failed). */
export function ListError({ message, onRetry }) {
  const { c } = useTheme();
  return (
    <View
      style={[styles.error, { borderColor: c.bad, backgroundColor: c.badSoft }]}
    >
      <Text style={[typo.bodyMedium, { color: c.bad }]}>{message}</Text>
      <Button
        title="Retry"
        variant="ghost"
        size="sm"
        onPress={onRetry}
        style={{ alignSelf: 'flex-start' }}
      />
    </View>
  );
}

export function ListLoading() {
  const { c } = useTheme();
  return (
    <View style={[styles.wrap, { paddingVertical: verticalScale(40) }]}>
      <ActivityIndicator color={c.muted} size="large" />
    </View>
  );
}

const styles = ScaledSheet.create({
  wrap: { paddingVertical: '20@vs', alignItems: 'center', gap: '8@ms' },
  error: {
    borderWidth: 1,
    borderRadius: '8@ms',
    padding: '12@ms',
    gap: '8@ms',
    marginVertical: '8@vs',
  },
});
