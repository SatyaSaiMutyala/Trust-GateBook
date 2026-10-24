import React, { useLayoutEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { ScaledSheet } from 'react-native-size-matters/extend';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { BellIcon } from '../components/NotificationBell';
import { HeaderButton } from '../components/TopBar';
import { signOut } from '../push/push';
import { LockIcon, PowerIcon, TickIcon } from '../components/Glyphs';
import { TabIcon } from '../components/TabIcons';
import { useUnreadCountQuery } from '../store/api';
import {
  selectHasModule,
  selectIsRecipient,
  selectUser,
} from '../store/authSlice';
import { fonts, radius, typo, useTheme } from '../theme';

/** Coloured square behind a row icon (each section has its own tint, like the web sidebar). */
function IconTile({ tint, children }) {
  return (
    <View style={[styles.tile, { backgroundColor: tint }]}>{children}</View>
  );
}

function Row({ icon, tint, label, hint, count, onPress, last }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={count ? `${label}, ${count}` : label}
      accessibilityHint={hint}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        !last && { borderBottomWidth: 1, borderBottomColor: c.line },
        pressed && { backgroundColor: c.sunk },
      ]}
    >
      <IconTile tint={tint}>{icon}</IconTile>
      <View style={styles.rowText}>
        <Text style={[typo.bodySemi, { color: c.ink }]} numberOfLines={1}>
          {label}
        </Text>
        {hint ? (
          <Text style={[typo.small, { color: c.muted }]} numberOfLines={1}>
            {hint}
          </Text>
        ) : null}
      </View>
      {count ? (
        <View style={[styles.count, { backgroundColor: c.accent }]}>
          <Text style={[styles.countText, { color: c.accentInk }]}>
            {count > 99 ? '99+' : count}
          </Text>
        </View>
      ) : null}
      {/* System font: the bundled fonts have no › glyph. */}
      <Text style={[styles.chevron, { color: c.faint }]}>›</Text>
    </Pressable>
  );
}

function Section({ title, rows }) {
  const { c } = useTheme();
  const shown = rows.filter(Boolean);
  if (!shown.length) return null;
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: c.muted }]}>{title}</Text>
      <View
        style={[
          styles.card,
          { backgroundColor: c.surface, borderColor: c.line },
        ]}
      >
        {shown.map((r, i) => (
          <Row key={r.label} {...r} last={i === shown.length - 1} />
        ))}
      </View>
    </View>
  );
}

/**
 * "More" tab (gate users): everything that isn't on the bottom bar — the visitor log, today's summary, expected
 * visitors, gate passes, keys, incidents, patrols, generator, notifications and the account. Rows for modules the
 * person hasn't been given are left out.
 */
export function MoreScreen({ navigation }) {
  const { c } = useTheme();
  const user = useSelector(selectUser);
  const recipient = useSelector(selectIsRecipient);
  const visitors = useSelector(selectHasModule('visitors'));
  const track = useSelector(selectHasModule('track'));
  const expected = useSelector(selectHasModule('expected'));
  const material = useSelector(selectHasModule('material'));
  const keys = useSelector(selectHasModule('keys'));
  const incidents = useSelector(selectHasModule('incidents'));
  const patrol = useSelector(selectHasModule('patrol'));
  const gen = useSelector(selectHasModule('gen'));
  const { data: unread = 0 } = useUnreadCountQuery(undefined, {
    skip: !user,
  });
  const register = visitors || track;
  const go = (name, params) => () => navigation.navigate(name, params);
  const ink = c.ink;
  const dispatch = useDispatch();
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  // Sign out on the right of the app bar.
  useLayoutEffect(() => {
    navigation.setOptions({
      headerActions: (
        <HeaderButton
          title="Sign out"
          onPress={() => setConfirmSignOut(true)}
        />
      ),
    });
  }, [navigation]);

  return (
    <>
      <ScrollView
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        style={{ backgroundColor: c.bg }}
        contentContainerStyle={styles.content}
      >
        <Section
          title="Register"
          rows={[
            register && {
              label: 'Visitor log',
              hint: 'Every entry, search and export',
              tint: '#DDEFF8',
              icon: <TabIcon name="log" color={ink} bg="#DDEFF8" size={20} />,
              onPress: go('Log'),
            },
            register && {
              label: 'Today at the gate',
              hint: 'Counts and what needs attention',
              tint: '#FFE7CC',
              icon: <TabIcon name="today" color={ink} bg="#FFE7CC" size={20} />,
              onPress: go('Today'),
            },
            expected && {
              label: 'Expected visitors',
              hint: 'Pre-registered visitors and deliveries',
              tint: '#FFF3C4',
              icon: (
                <TabIcon name="calendar" color={ink} bg="#FFF3C4" size={20} />
              ),
              onPress: go('Expected'),
            },
            material && {
              label: 'Material passes',
              hint: 'Goods in and out of the gate',
              tint: '#ECE5FF',
              icon: <TabIcon name="box" color={ink} bg="#ECE5FF" size={20} />,
              onPress: go('Material'),
            },
            recipient && {
              label: 'My visitors',
              hint: 'Visitors who came to see you',
              tint: '#DDF3EA',
              icon: (
                <TabIcon name="inside" color={ink} bg="#DDF3EA" size={20} />
              ),
              onPress: go('MyVisitors'),
            },
          ]}
        />
        <Section
          title="Site safety"
          rows={[
            keys && {
              label: 'Key register',
              hint: 'Keys issued and returned',
              tint: '#FFEFD1',
              icon: <LockIcon color={ink} size={18} />,
              onPress: go('Keys'),
            },
            incidents && {
              label: 'Incidents',
              hint: 'Report and follow up',
              tint: '#FCE1E1',
              icon: <Text style={[styles.bang, { color: c.bad }]}>!</Text>,
              onPress: go('Incidents'),
            },
            patrol && {
              label: 'Patrols',
              hint: 'Rounds and checkpoint scans',
              tint: '#DFF5E3',
              icon: <TickIcon color={c.ok} size={18} />,
              onPress: go('Patrol'),
            },
            gen && {
              label: 'Generator & diesel',
              hint: 'Running log and fuel',
              tint: '#D9F2F2',
              icon: <PowerIcon color={ink} bg="#D9F2F2" size={18} />,
              onPress: go('Generator'),
            },
          ]}
        />
        <Section
          title="You"
          rows={[
            {
              label: 'Notifications',
              hint: 'Alerts sent to you',
              tint: '#FFE9D6',
              icon: <BellIcon color={ink} size={18} />,
              count: unread,
              onPress: go('Notifications'),
            },
            {
              label: 'Account & settings',
              hint: user?.name,
              tint: '#E8ECEF',
              icon: (
                <TabIcon name="settings" color={ink} bg="#E8ECEF" size={20} />
              ),
              onPress: go('Account'),
            },
          ]}
        />
      </ScrollView>
      <ConfirmDialog
        visible={confirmSignOut}
        tone="danger"
        title="Sign out?"
        message="You will need your email and password to sign in again."
        confirmLabel="Sign out"
        onCancel={() => setConfirmSignOut(false)}
        onConfirm={() => {
          setConfirmSignOut(false);
          dispatch(signOut());
        }}
      />
    </>
  );
}

const styles = ScaledSheet.create({
  content: { padding: '16@ms', paddingBottom: '32@ms', gap: '18@ms' },
  section: { gap: '8@ms' },
  sectionTitle: {
    fontFamily: fonts.display,
    fontSize: '13@ms',
    letterSpacing: 1,
    textTransform: 'uppercase',
    paddingHorizontal: '4@ms',
  },
  card: {
    borderWidth: 1,
    borderRadius: radius.panel,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: '12@ms',
    paddingHorizontal: '14@ms',
    paddingVertical: '12@ms',
    minHeight: '60@ms',
  },
  tile: {
    width: '38@ms',
    height: '38@ms',
    borderRadius: '10@ms',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, minWidth: 0, gap: '1@ms' },
  count: {
    minWidth: '22@ms',
    height: '22@ms',
    borderRadius: '11@ms',
    paddingHorizontal: '6@ms',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    includeFontPadding: false,
    fontFamily: fonts.bodySemi,
    fontSize: '12@ms',
  },
  chevron: { fontSize: '24@ms', lineHeight: '26@ms', marginLeft: '2@ms' },
  bang: {
    fontFamily: fonts.display,
    fontSize: '22@ms',
    lineHeight: '26@ms',
    includeFontPadding: false,
  },
});
