import React, { useLayoutEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { ScaledSheet } from 'react-native-size-matters/extend';
import { Button } from '../components/Button';
import { DateTimeField } from '../components/DateTimeField';
import { Field, FieldShell } from '../components/Field';
import { Banner } from '../components/Layout';
import { RecipientPicker } from '../components/RecipientPicker';
import { errorMessage, useIssueKeyMutation } from '../store/api';
import { useSettings, useToast } from '../store/hooks';
import { radius, typo, useTheme } from '../theme';
import { dueChips } from '../utils/keys';

const TAKER_WORDING = {
  label: 'Taken by',
  picked: 'Gets a reminder in TruSentinel when the key is due back',
  typed: 'Not on TruSentinel — the guards are reminded instead.',
  idle: 'Pick the employee, or type the name of anyone else (electrician, vendor).',
  noMatch: name => `No one named “${name}” on TruSentinel. Keep the typed name.`,
  none: 'No employees on TruSentinel yet. Type the name.',
  changeLabel: name => `Change who takes the key, currently ${name}`,
};

/** Pill toggle (return-by quick picks). */
function Pill({ label, selected, onPress }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.pill,
        {
          backgroundColor: selected ? c.ink : c.surface,
          borderColor: selected ? c.ink : c.line,
        },
      ]}
    >
      <Text style={[typo.smallMedium, { color: selected ? c.onInk : c.ink }]}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Hand a copy of a key to someone (route param `key`). */
export function KeyIssueScreen({ navigation, route }) {
  const { c } = useTheme();
  const toast = useToast();
  const settings = useSettings();
  const k = route.params.key;
  const hours = settings?.keyReturnHours ?? 4;
  const [taker, setTaker] = useState(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [purpose, setPurpose] = useState('');
  const [chips] = useState(() => dueChips());
  const [due, setDue] = useState(() =>
    hours > 0 ? new Date(Date.now() + hours * 3_600_000) : null,
  );
  const [chip, setChip] = useState(null);
  const [error, setError] = useState(null);
  const [field, setField] = useState(null);
  const [issue, { isLoading }] = useIssueKeyMutation();

  useLayoutEffect(() => {
    navigation.setOptions({ title: `Issue key ${k.number}` });
  }, [navigation, k.number]);

  const submit = async () => {
    setError(null);
    setField(null);
    if (!taker && !name.trim()) {
      setError('Who is taking the key?');
      setField('takerName');
      return;
    }
    try {
      const r = await issue({
        id: k.id,
        body: {
          takerId: taker?.id,
          takerName: taker ? undefined : name.trim(),
          takerPhone: phone.trim(),
          purpose: purpose.trim(),
          dueAt: due ? due.toISOString() : null,
        },
      }).unwrap();
      toast.show(`Key ${k.number} issued to ${r.move.taker.name}`);
      navigation.goBack();
    } catch (err) {
      setError(errorMessage(err));
      setField(err?.field ?? null);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        <Text style={[typo.h3, { color: c.ink }]}>{k.name}</Text>
        {k.location ? (
          <Text style={[typo.small, { color: c.muted }]}>{k.location}</Text>
        ) : null}
        {k.restricted ? (
          <Banner tone="warn">
            <Text style={[typo.body, { color: c.ink }]}>
              Restricted key.
              {k.authorised
                ? ` Only: ${k.authorised}.`
                : ' Check the person is allowed to take it.'}
            </Text>
          </Banner>
        ) : null}
        <RecipientPicker
          text={name}
          recipient={taker}
          error={field === 'takerName' || field === 'takerId'}
          onText={t => {
            setTaker(null);
            setName(t);
          }}
          onPick={h => {
            setTaker(h);
            setName(h.name);
            if (h.phone && !phone) setPhone(h.phone);
          }}
          onClear={() => {
            setTaker(null);
            setName('');
          }}
          wording={TAKER_WORDING}
        />
        <Field
          label="Phone (optional)"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />
        <Field
          label="Purpose (optional)"
          value={purpose}
          onChangeText={setPurpose}
        />
        <FieldShell label="Return by" error={field === 'dueAt'}>
          <View style={styles.pills}>
            {chips.map(([label, d]) => (
              <Pill
                key={label}
                label={label}
                selected={chip === label}
                onPress={() => {
                  setChip(label);
                  setDue(d);
                }}
              />
            ))}
            <Pill
              label="No return time"
              selected={!due}
              onPress={() => {
                setChip(null);
                setDue(null);
              }}
            />
          </View>
        </FieldShell>
        {due ? (
          <DateTimeField
            label="Return by"
            value={due}
            minimumDate={new Date()}
            onChange={d => {
              setChip(null);
              setDue(d);
            }}
          />
        ) : null}
        <Text style={[typo.small, { color: c.muted }]}>
          {due
            ? 'Security and the holder are reminded if it is not back by then.'
            : 'No reminders.'}
        </Text>
        {error ? (
          <Text style={[typo.bodyMedium, { color: c.bad }]}>{error}</Text>
        ) : null}
        <View style={styles.actions}>
          <Button
            title="Cancel"
            variant="ghost"
            size="lg"
            style={{ flex: 1 }}
            onPress={() => navigation.goBack()}
          />
          <Button
            title="Issue key"
            size="lg"
            style={{ flex: 2 }}
            loading={isLoading}
            onPress={submit}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = ScaledSheet.create({
  content: { padding: '16@ms', gap: '14@ms', paddingBottom: '48@vs' },
  actions: { flexDirection: 'row', gap: '12@ms', marginTop: '6@vs' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: '8@ms' },
  pill: {
    borderWidth: 1,
    borderRadius: radius.chip,
    paddingHorizontal: '12@s',
    paddingVertical: '8@vs',
  },
});
