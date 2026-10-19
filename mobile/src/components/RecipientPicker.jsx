import React, { useMemo, useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
import { fonts, MIN_TOUCH, radius, typo, useTheme } from '../theme';
import { useListHostsInfiniteQuery } from '../store/api';
import { useInfiniteList } from '../store/useInfiniteList';
import { initials } from '../utils/format';
import { Button } from './Button';
import { Field, FieldShell } from './Field';
import { ScaledSheet, moderateScale } from 'react-native-size-matters/extend';

function Avatar({ name, picked }) {
  const { c } = useTheme();
  return (
    <View
      style={[
        styles.avatar,
        {
          backgroundColor: picked ? c.accent : c.sunk,
          borderColor: picked ? c.accent : c.line,
        },
      ]}
    >
      <Text
        style={[styles.avatarText, { color: picked ? c.accentInk : c.muted }]}
      >
        {initials(name)}
      </Text>
    </View>
  );
}

/** A plain line inside the dropdown (loading / empty explanations). */
function Note({ children, first }) {
  const { c } = useTheme();
  return (
    <View
      style={[
        styles.note,
        {
          borderTopColor: c.line,
          borderTopWidth: first ? 0 : StyleSheet.hairlineWidth,
        },
      ]}
    >
      <Text style={[typo.small, { color: c.muted }]}>{children}</Text>
    </View>
  );
}

/** Post room wording ("For (receiver)"). Check-in passes its own ("Whom to meet"). */
const POST_WORDING = {
  label: 'For (receiver)',
  picked: 'Gets a notification and must confirm collection',
  typed: 'Not on Gatebook — call them to collect it',
  idle: 'Pick the employee it is addressed to. Not listed? Type their name.',
  noMatch: name => `No one named “${name}” can receive post on Gatebook.`,
  useTyped: name => `Use “${name}” — I'll inform them by phone`,
  none: "No one can receive post on Gatebook yet. An admin can add Employees or tick “Can also receive post” in Users. For now, type the receiver's name — you'll inform them by phone.",
  changeLabel: name => `Change receiver, currently ${name}`,
};

/**
 * Pick an employee (they get notified), or type a name for someone not on Gatebook (security phones them).
 * The list is Gatebook's own users who can receive post / visitors (Employee role or "Can also receive post"),
 * via `/api/hosts`. Focusing the field opens the employee list straight away (no typing needed); typing filters it.
 * Once someone is picked the field turns into a card with a Change button.
 * Post room wording by default ("For (receiver)"); `wording` overrides the texts.
 */
export function RecipientPicker({
  text,
  recipient,
  error,
  onText,
  onPick,
  onClear,
  wording: custom,
}) {
  const wording = { ...POST_WORDING, ...custom };
  const { c } = useTheme();
  const inputRef = useRef(null);
  const [focused, setFocused] = useState(false);
  const query = text.trim();
  const open = focused && !recipient;
  const params = useMemo(() => ({ q: query, limit: 8, sort: 'name' }), [query]);
  const hosts = useInfiniteList(useListHostsInfiniteQuery, params, {
    skip: !open,
  });

  const close = () => {
    setFocused(false);
    Keyboard.dismiss();
  };

  if (recipient) {
    const where = [recipient.dept, recipient.location]
      .filter(Boolean)
      .join(' · ');
    return (
      <FieldShell label={wording.label} required hint={wording.picked}>
        <View
          style={[
            styles.card,
            { backgroundColor: c.surface, borderColor: c.ok },
          ]}
        >
          <Avatar name={recipient.name} picked />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={[typo.bodySemi, { color: c.ink }]}>
              {recipient.name}
            </Text>
            <Text numberOfLines={1} style={[typo.small, { color: c.muted }]}>
              {where || 'Employee'}
            </Text>
          </View>
          <Button
            title="Change"
            variant="ghost"
            size="sm"
            accessibilityLabel={wording.changeLabel(recipient.name)}
            onPress={() => {
              onClear();
              setTimeout(() => inputRef.current?.focus(), 50);
            }}
          />
        </View>
      </FieldShell>
    );
  }

  let rows;
  if (hosts.loading) {
    rows = <Note first>Loading employees…</Note>;
  } else if (hosts.error) {
    // Show the server's message when the list can't load.
    rows = (
      <Note first>
        {typeof hosts.error === 'string'
          ? hosts.error
          : "Couldn't load employees. You can still type the name."}
      </Note>
    );
  } else if (!hosts.items.length) {
    rows = query ? (
      <>
        <Note first>{wording.noMatch(query)}</Note>
        {/* `useTyped: null` = only employees from the list (e.g. pre-registration). */}
        {wording.useTyped ? (
          <Pressable
            accessibilityRole="button"
            onPress={close}
            style={({ pressed }) => [
              styles.row,
              {
                borderTopColor: c.line,
                backgroundColor: pressed ? c.sunk : 'transparent',
              },
            ]}
          >
            <Text style={[typo.bodySemi, { color: c.ink, flex: 1 }]}>
              {wording.useTyped(query)}
            </Text>
          </Pressable>
        ) : null}
      </>
    ) : (
      <Note first>{wording.none}</Note>
    );
  } else {
    rows = (
      <>
        {hosts.items.map((h, i) => (
          <Pressable
            key={h.id}
            accessibilityRole="button"
            accessibilityLabel={`${h.name}, ${[h.dept, h.location]
              .filter(Boolean)
              .join(', ')}`}
            onPress={() => {
              onPick(h);
              close();
            }}
            style={({ pressed }) => [
              styles.row,
              {
                borderTopColor: c.line,
                borderTopWidth: i ? StyleSheet.hairlineWidth : 0,
                backgroundColor: pressed ? c.sunk : 'transparent',
              },
            ]}
          >
            <Avatar name={h.name} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={[typo.bodySemi, { color: c.ink }]}>
                {h.name}
              </Text>
              <Text numberOfLines={1} style={[typo.small, { color: c.muted }]}>
                {[h.dept, h.location].filter(Boolean).join(' · ') || 'Employee'}
              </Text>
            </View>
          </Pressable>
        ))}
        {hosts.pagination?.hasNextPage ? (
          <Pressable
            accessibilityRole="button"
            onPress={hosts.loadMore}
            style={({ pressed }) => [
              styles.more,
              {
                borderTopColor: c.line,
                backgroundColor: pressed ? c.sunk : 'transparent',
              },
            ]}
          >
            <Text style={[typo.smallMedium, { color: c.ink }]}>
              Show more employees
            </Text>
          </Pressable>
        ) : null}
      </>
    );
  }

  const hint = focused ? null : query ? wording.typed : wording.idle;

  return (
    <Field
      ref={inputRef}
      label={wording.label}
      required
      value={text}
      onChangeText={onText}
      onFocus={() => setFocused(true)}
      onBlur={() => setTimeout(() => setFocused(false), 150)}
      autoCapitalize="words"
      autoCorrect={false}
      returnKeyType="done"
      error={error}
      placeholder="Search employees or type a name"
      hint={hint}
      hintTone={query && !focused ? 'warn' : 'muted'}
      dropdown={open ? rows : null}
    />
  );
}

const styles = ScaledSheet.create({
  avatar: {
    width: '34@ms',
    height: '34@ms',
    borderRadius: '17@ms',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: fonts.display,
    fontSize: '14@ms',
    includeFontPadding: false,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: '10@ms',
    borderWidth: 1.5,
    borderRadius: radius.control,
    paddingVertical: '8@vs',
    paddingLeft: '10@s',
    paddingRight: '6@s',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: '10@ms',
    paddingHorizontal: '12@s',
    minHeight: MIN_TOUCH + moderateScale(8),
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  note: { paddingHorizontal: '12@s', paddingVertical: '10@vs' },
  more: {
    minHeight: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
