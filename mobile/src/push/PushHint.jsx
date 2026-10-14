import React from 'react';
import { Linking, Text } from 'react-native';
import { useSelector } from 'react-redux';
import { Banner } from '../components/Layout';
import { Button } from '../components/Button';
import { selectPushPermission } from '../store/pushSlice';
import { typo, useTheme } from '../theme';

/** Shown in Account when the notification permission was refused. */
export function PushHint() {
  const { c } = useTheme();
  const permission = useSelector(selectPushPermission);
  if (permission !== 'denied') return null;
  return (
    <Banner tone="warn">
      <Text style={[typo.body, { color: c.ink }]}>
        Notifications are off — enable them in Settings to hear about post for
        you.
      </Text>
      <Button
        title="Open Settings"
        variant="ghost"
        size="sm"
        style={{ alignSelf: 'flex-start' }}
        onPress={() => Linking.openSettings().catch(() => undefined)}
        accessibilityLabel="Open system settings to enable notifications"
      />
    </Banner>
  );
}
