import React from 'react';
import { Text, View } from 'react-native';
import { radius, typo, useTheme } from '../theme';
import { Button } from './Button';
import { ScaledSheet, verticalScale } from 'react-native-size-matters/extend';
export function Panel({ title, subtitle, children, style, right }) {
  const { c } = useTheme();
  return (
    <View
      style={[
        styles.panel,
        { backgroundColor: c.surface, borderColor: c.line },
        style,
      ]}
    >
      {title ? (
        <View style={styles.panelHead}>
          <View style={{ flex: 1 }}>
            <Text
              accessibilityRole="header"
              style={[typo.h3, { color: c.ink }]}
            >
              {title}
            </Text>
            {subtitle ? (
              <Text
                style={[
                  typo.small,
                  { color: c.muted, marginTop: verticalScale(2) },
                ]}
              >
                {subtitle}
              </Text>
            ) : null}
          </View>
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
}
export function EmptyState({ title, body, action }) {
  const { c } = useTheme();
  return (
    <View style={[styles.empty, { borderColor: c.line }]}>
      <Text style={[typo.h2, { color: c.ink, textAlign: 'center' }]}>
        {title}
      </Text>
      <Text style={[typo.body, { color: c.muted, textAlign: 'center' }]}>
        {body}
      </Text>
      {action ? (
        <Button
          title={action.title}
          onPress={action.onPress}
          style={{ marginTop: verticalScale(8) }}
        />
      ) : null}
    </View>
  );
}
export function Banner({ tone, children }) {
  const { c } = useTheme();
  const bg =
    tone === 'warn' ? c.warnSoft : tone === 'bad' ? c.badSoft : c.accentSoft;
  const border = tone === 'warn' ? c.warn : tone === 'bad' ? c.bad : c.accent;
  return (
    <View style={[styles.banner, { backgroundColor: bg, borderColor: border }]}>
      {children}
    </View>
  );
}
const styles = ScaledSheet.create({
  panel: {
    borderRadius: radius.panel,
    borderWidth: 1,
    padding: '16@ms',
    gap: '12@ms',
  },
  panelHead: { flexDirection: 'row', alignItems: 'flex-start', gap: '8@ms' },
  empty: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: radius.panel,
    padding: '20@ms',
    alignItems: 'center',
    gap: '8@ms',
    marginTop: '8@vs',
  },
  banner: {
    borderWidth: 1,
    borderRadius: radius.control,
    padding: '12@ms',
    gap: '8@ms',
  },
});
