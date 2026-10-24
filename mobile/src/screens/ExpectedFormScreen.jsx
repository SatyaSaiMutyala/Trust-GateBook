import React, { useLayoutEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSelector } from 'react-redux';
import { ScaledSheet, moderateScale } from 'react-native-size-matters/extend';
import { Button } from '../components/Button';
import { Checkbox } from '../components/Checkbox';
import { ChipSelect } from '../components/ChipSelect';
import { DateTimeField } from '../components/DateTimeField';
import { Field, FieldShell } from '../components/Field';
import { FilterTabs } from '../components/FilterBar';
import { Banner } from '../components/Layout';
import { ListLoading } from '../components/ListFooter';
import { RecipientPicker } from '../components/RecipientPicker';
import { radius, typo, useTheme } from '../theme';
import {
  errorMessage,
  useCreateExpectedMutation,
  useGetExpectedQuery,
  useUpdateExpectedMutation,
} from '../store/api';
import { selectUser } from '../store/authSlice';
import { useSettings, useToast } from '../store/hooks';
import { CrossIcon } from '../components/Glyphs';
import { KeyboardAwareScrollView } from '../components/KeyboardAwareScrollView';

export const CHALLANS = [
  'Delivery challan',
  'Tax invoice',
  'Goods return challan',
  'Transfer challan',
  'Other',
];
const KINDS = [
  { value: 'visitor', label: 'Visitor' },
  { value: 'delivery', label: 'Delivery' },
];

const BASE_WORDING = {
  picked: 'Gets a notification when they arrive',
  typed: 'Pick someone from the list.',
  noMatch: name => `No employee named “${name}” is on TruSentinel.`,
  none: 'No employees are on TruSentinel yet. An admin can add them in Users.',
  useTyped: null,
  changeLabel: name => `Change, currently ${name}`,
};
const HOST_WORDING = {
  ...BASE_WORDING,
  label: 'Visiting',
  idle: 'The employee they are visiting.',
};
const RECEIVER_WORDING = {
  ...BASE_WORDING,
  label: 'Received by',
  idle: 'The employee who accepts the boxes.',
};
const CONTACT_WORDING = {
  ...BASE_WORDING,
  label: 'Received at the location by (optional)',
  picked: 'They meet the visitor when the person visited is elsewhere',
  idle: 'e.g. the lab in-charge who meets the engineer. Leave empty if it is the person above.',
};
const ALSO_WORDING = {
  ...BASE_WORDING,
  label: 'Also meeting (optional)',
  idle: 'Told when the visitor arrives.',
};
/** Server error fields → form fields. */
const FIELD_MAP = {
  hostId: 'host',
  contactId: 'contact',
  alsoIds: 'also',
  untilAt: 'until',
};

/** Next half hour, at least 30 minutes from now. */
function defaultStart(now = new Date()) {
  const step = 30 * 60000;
  return new Date(Math.ceil((now.getTime() + step) / step) * step);
}

/** Form state from an entry (edit) or defaults (new). */
export function initialExpectedForm(entry, kind, user, settings) {
  const self =
    user && (user.role === 'host' || user.isHost)
      ? {
          id: user.id,
          name: user.name,
          dept: user.dept ?? '',
          location: user.location ?? '',
        }
      : null;
  const at = entry ? new Date(entry.expectedAt) : defaultStart();
  return {
    kind: entry?.kind ?? kind ?? 'visitor',
    name: entry?.name ?? '',
    phone: entry?.phone ?? '',
    company: entry?.company ?? '',
    purpose: entry?.purpose ?? '',
    persons: String(entry?.persons ?? 1),
    host: entry ? entry.host : self,
    hostText: entry ? entry.host.name : self?.name ?? '',
    contact: entry?.contact ?? null,
    contactText: entry?.contact?.name ?? '',
    also: entry?.also ?? [],
    alsoText: '',
    at,
    until: entry?.untilAt ? new Date(entry.untilAt) : null,
    vehicle: entry?.vehicle ?? '',
    items: entry?.items ?? '',
    notes: entry?.notes ?? '',
    preapproved: entry
      ? entry.preapproved
      : settings?.expectedPreapproved ?? true,
    boxes: entry?.boxes ? String(entry.boxes) : '',
    challanType: entry?.challanType ?? '',
    challanNo: entry?.challanNo ?? '',
  };
}

/** Request body for POST / PATCH /api/expected (kind is only sent on create). */
export function expectedBody(f) {
  const delivery = f.kind === 'delivery';
  return {
    name: f.name.trim(),
    phone: f.phone.trim(),
    company: f.company.trim(),
    purpose: delivery ? '' : f.purpose,
    persons: delivery
      ? 1
      : Math.min(50, Math.max(1, parseInt(f.persons, 10) || 1)),
    hostId: f.host?.id,
    contactId: delivery ? null : f.contact?.id ?? null,
    alsoIds: delivery ? [] : f.also.map(a => a.id),
    expectedAt: f.at.toISOString(),
    untilAt: f.until ? f.until.toISOString() : null,
    vehicle: f.vehicle.trim().toUpperCase(),
    items: delivery ? '' : f.items.trim(),
    notes: f.notes.trim(),
    preapproved: delivery ? false : f.preapproved,
    boxes: parseInt(f.boxes, 10) || 0,
    challanType: f.challanType,
    challanNo: f.challanNo.trim().toUpperCase(),
  };
}

/** The form's missing required fields. */
export function missingExpectedFields(f) {
  const delivery = f.kind === 'delivery';
  const m = {};
  if (delivery && !f.company.trim()) m.company = true;
  if (delivery && !(parseInt(f.boxes, 10) > 0)) m.boxes = true;
  if (!delivery && !f.name.trim()) m.name = true;
  if (!f.host) m.host = true;
  if (f.until && f.until.getTime() <= f.at.getTime()) m.until = true;
  return m;
}

/**
 * Pre-register a visitor or a delivery (`route.params.kind`), or edit one (`route.params.code`).
 * Security is notified; the visitor is checked in from it, the delivery marked received.
 */
export function ExpectedFormScreen({ navigation, route }) {
  const code = route?.params?.code;
  const {
    data: entry,
    isLoading,
    error: loadError,
  } = useGetExpectedQuery(code, {
    skip: !code,
    refetchOnMountOrArgChange: true,
  });
  useLayoutEffect(() => {
    navigation.setOptions({
      title: code ? 'Edit expected' : 'Expect a visitor',
    });
  }, [navigation, code]);
  const { c } = useTheme();
  if (code && isLoading) return <ListLoading />;
  if (code && (loadError || !entry)) {
    return (
      <View
        style={{ flex: 1, backgroundColor: c.bg, padding: moderateScale(16) }}
      >
        <Banner tone="bad">
          <Text style={[typo.body, { color: c.bad }]}>
            {errorMessage(loadError) || 'Not found.'}
          </Text>
        </Banner>
      </View>
    );
  }
  return (
    <ExpectedForm
      key={entry?.code ?? 'new'}
      entry={entry}
      kind={route?.params?.kind}
      navigation={navigation}
    />
  );
}

function ExpectedForm({ entry, kind, navigation }) {
  const { c } = useTheme();
  const toast = useToast();
  const settings = useSettings();
  const user = useSelector(selectUser);
  const [f, setF] = useState(() =>
    initialExpectedForm(entry, kind, user, settings),
  );
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [create, { isLoading: creating }] = useCreateExpectedMutation();
  const [update, { isLoading: updating }] = useUpdateExpectedMutation();
  const delivery = f.kind === 'delivery';

  useLayoutEffect(() => {
    if (entry) return;
    navigation.setOptions({
      title: delivery ? 'Expect a delivery' : 'Expect a visitor',
    });
  }, [navigation, entry, delivery]);

  const set = (k, v) => {
    setF(x => ({ ...x, [k]: v }));
    setErrors(e => (e[k] ? { ...e, [k]: false } : e));
  };

  const save = async () => {
    const missing = missingExpectedFields(f);
    setErrors(missing);
    if (Object.keys(missing).length) {
      setFormError(
        missing.until
          ? '"Until" must be after the expected time.'
          : missing.host && Object.keys(missing).length === 1
          ? 'Pick the employee from the list.'
          : 'Fill the highlighted fields.',
      );
      return;
    }
    setFormError(null);
    const body = expectedBody(f);
    try {
      if (entry) await update({ id: entry.code, ...body }).unwrap();
      else await create({ kind: f.kind, ...body }).unwrap();
      toast.show(
        entry
          ? 'Saved. Security has the update.'
          : 'Saved. Security at the gate has been notified.',
      );
      navigation.goBack();
    } catch (err) {
      setFormError(errorMessage(err));
      if (err?.field)
        setErrors(e => ({ ...e, [FIELD_MAP[err.field] ?? err.field]: true }));
    }
  };

  const excludeIds = [f.host?.id, f.contact?.id, ...f.also.map(a => a.id)];
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAwareScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        {entry ? (
          <Text style={[typo.monoSmall, { color: c.muted }]}>{entry.code}</Text>
        ) : (
          <FilterTabs
            accessibilityLabel="Visitor or delivery"
            options={KINDS}
            value={f.kind}
            onChange={v => set('kind', v)}
          />
        )}

        {delivery ? (
          <>
            <Field
              label="Delivery from"
              required
              value={f.company}
              onChangeText={t => set('company', t)}
              error={errors.company}
              placeholder="Supplier / company"
            />
            <View style={styles.row2}>
              <Field
                label="No. of boxes"
                required
                value={f.boxes}
                onChangeText={t =>
                  set('boxes', t.replace(/\D/g, '').slice(0, 4))
                }
                keyboardType="number-pad"
                mono
                error={errors.boxes}
                style={{ flex: 1 }}
              />
              <Field
                label="Challan / invoice no."
                value={f.challanNo}
                onChangeText={t => set('challanNo', t.toUpperCase())}
                autoCapitalize="characters"
                autoCorrect={false}
                mono
                style={{ flex: 1.6 }}
              />
            </View>
            <FieldShell label="Document type">
              <ChipSelect
                accessibilityLabel="Document type"
                options={CHALLANS}
                value={f.challanType}
                onChange={v => set('challanType', v === f.challanType ? '' : v)}
              />
            </FieldShell>
            <Field
              label="Brought by (optional)"
              value={f.name}
              onChangeText={t => set('name', t)}
              autoCapitalize="words"
              placeholder="Delivery person / courier"
            />
            <Field
              label="Their mobile (optional)"
              value={f.phone}
              onChangeText={t =>
                set('phone', t.replace(/[^\d+]/g, '').slice(0, 14))
              }
              keyboardType="phone-pad"
              mono
            />
          </>
        ) : (
          <>
            <Field
              label="Visitor name"
              required
              value={f.name}
              onChangeText={t => set('name', t)}
              autoCapitalize="words"
              error={errors.name}
            />
            <Field
              label="Mobile number"
              value={f.phone}
              onChangeText={t =>
                set('phone', t.replace(/[^\d+]/g, '').slice(0, 14))
              }
              keyboardType="phone-pad"
              mono
              hint="Security finds them by this number at the gate."
            />
            <View style={styles.row2}>
              <Field
                label="Coming from"
                value={f.company}
                onChangeText={t => set('company', t)}
                style={{ flex: 2 }}
                placeholder="Company / place"
              />
              <Field
                label="Persons"
                value={f.persons}
                onChangeText={t =>
                  set('persons', t.replace(/\D/g, '').slice(0, 2))
                }
                keyboardType="number-pad"
                mono
                style={{ flex: 1 }}
              />
            </View>
            <FieldShell label="Purpose">
              <ChipSelect
                accessibilityLabel="Purpose"
                options={settings.purposes}
                value={f.purpose}
                onChange={v => set('purpose', v === f.purpose ? '' : v)}
              />
            </FieldShell>
          </>
        )}

        <RecipientPicker
          wording={delivery ? RECEIVER_WORDING : HOST_WORDING}
          text={f.hostText}
          recipient={f.host}
          error={errors.host}
          onText={t => set('hostText', t)}
          onPick={h => {
            setF(x => ({ ...x, host: h, hostText: h.name }));
            setErrors(e => ({ ...e, host: false }));
          }}
          onClear={() => setF(x => ({ ...x, host: null, hostText: '' }))}
        />
        {!delivery ? (
          <>
            <RecipientPicker
              wording={CONTACT_WORDING}
              text={f.contactText}
              recipient={f.contact}
              error={errors.contact}
              onText={t => set('contactText', t)}
              onPick={h =>
                setF(x => ({ ...x, contact: h, contactText: h.name }))
              }
              onClear={() =>
                setF(x => ({ ...x, contact: null, contactText: '' }))
              }
            />
            {f.also.length ? (
              <View style={styles.chips}>
                {f.also.map(a => (
                  <Pressable
                    key={a.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${a.name}`}
                    onPress={() =>
                      setF(x => ({
                        ...x,
                        also: x.also.filter(y => y.id !== a.id),
                      }))
                    }
                    style={[
                      styles.chip,
                      styles.chipRow,
                      { backgroundColor: c.sunk, borderColor: c.line },
                    ]}
                  >
                    <Text style={[typo.small, { color: c.ink }]}>{a.name}</Text>
                    <CrossIcon color={c.muted} size={9} />
                  </Pressable>
                ))}
              </View>
            ) : null}
            {f.also.length < 10 ? (
              <RecipientPicker
                wording={ALSO_WORDING}
                text={f.alsoText}
                recipient={null}
                error={errors.also}
                onText={t => set('alsoText', t)}
                onPick={h =>
                  setF(x => ({
                    ...x,
                    alsoText: '',
                    also: excludeIds.includes(h.id)
                      ? x.also
                      : [...x.also, { id: h.id, name: h.name }],
                  }))
                }
                onClear={() => set('alsoText', '')}
              />
            ) : null}
          </>
        ) : null}

        <DateTimeField
          label="Expected at"
          value={f.at}
          minimumDate={new Date()}
          onChange={d => set('at', d)}
          error={errors.expectedAt}
        />
        {f.until ? (
          <View style={{ gap: moderateScale(6) }}>
            <DateTimeField
              label="Until"
              value={f.until}
              minimumDate={f.at}
              onChange={d => set('until', d)}
              error={errors.until}
            />
            <Button
              title="Remove end time"
              variant="ghost"
              size="sm"
              style={{ alignSelf: 'flex-start' }}
              onPress={() => set('until', null)}
            />
          </View>
        ) : (
          <Button
            title="+ Add an end time"
            variant="ghost"
            size="sm"
            style={{ alignSelf: 'flex-start' }}
            onPress={() => set('until', new Date(f.at.getTime() + 3600000))}
          />
        )}

        <Field
          label="Vehicle number"
          value={f.vehicle}
          onChangeText={t => set('vehicle', t.toUpperCase())}
          autoCapitalize="characters"
          autoCorrect={false}
          mono
          placeholder="KA01AB1234"
        />
        {!delivery ? (
          <Field
            label="Bringing in"
            value={f.items}
            onChangeText={t => set('items', t)}
            placeholder="Laptop, tools, samples…"
          />
        ) : null}
        <Field
          label="Note for security"
          value={f.notes}
          onChangeText={t => set('notes', t)}
          multiline
          maxLength={500}
          placeholder="e.g. Machine engineer for the analyser, send to the lab"
        />
        {!delivery ? (
          <Checkbox
            checked={f.preapproved}
            onChange={v => set('preapproved', v)}
            label="Pre-approved: send them in when they arrive"
          >
            <Text style={[typo.bodySemi, { color: c.ink }]}>
              Pre-approved: send them in when they arrive
            </Text>
            {'\n'}
            <Text style={[typo.small, { color: c.muted }]}>
              The employee is told they have arrived instead of being asked to
              accept.
            </Text>
          </Checkbox>
        ) : null}

        {formError ? (
          <Banner tone="bad">
            <Text
              accessibilityLiveRegion="polite"
              style={[typo.bodyMedium, { color: c.bad }]}
            >
              {formError}
            </Text>
          </Banner>
        ) : null}
        <View style={styles.row2}>
          <Button
            title="Cancel"
            variant="ghost"
            size="lg"
            style={{ flex: 1 }}
            onPress={() => navigation.goBack()}
          />
          <Button
            title={entry ? 'Save' : 'Save & tell security'}
            size="lg"
            style={{ flex: 2 }}
            loading={creating || updating}
            onPress={save}
          />
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = ScaledSheet.create({
  content: { padding: '16@ms', gap: '14@ms', paddingBottom: '48@vs' },
  row2: { flexDirection: 'row', gap: '12@ms', alignItems: 'flex-start' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: '6@ms' },
  chip: {
    borderWidth: 1,
    borderRadius: radius.chip,
    paddingHorizontal: '12@s',
    paddingVertical: '6@vs',
  },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: '6@ms' },
});
