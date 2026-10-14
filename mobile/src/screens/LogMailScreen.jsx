import React, { useCallback, useLayoutEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Button } from '../components/Button';
import { ChipSelect } from '../components/ChipSelect';
import { Field, FieldShell } from '../components/Field';
import { KindTag } from '../components/KindTag';
import { Banner } from '../components/Layout';
import { mailFromLine } from '../components/MailCard';
import { PhotoTile } from '../components/PhotoTile';
import { SelectField } from '../components/SelectField';
import { Thumb } from '../components/Thumb';
import { RecipientPicker } from '../components/RecipientPicker';
import { fonts, MIN_TOUCH, radius, typo, useTheme } from '../theme';
import { CARRIERS } from '../types';
import { captureImage } from '../utils/camera';
import { ScaledSheet, moderateScale } from 'react-native-size-matters/extend';
import { useDispatch, useSelector } from 'react-redux';
import { errorMessage, useCreateMailMutation } from '../store/api';
import { selectCanHandleMail } from '../store/authSlice';
import {
  logMailCleared,
  logMailFieldSet,
  logMailPatched,
  selectLogMailDraft,
} from '../store/draftsSlice';
import { useSettings, useToast } from '../store/hooks';

/** "Item logged" confirmation after a successful create. */
function ItemLogged({ item, onNext, onPostRoom }) {
  const { c } = useTheme();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={styles.content}
    >
      <View
        style={[
          styles.card,
          { backgroundColor: c.surface, borderColor: c.line },
        ]}
      >
        <Thumb
          url={item.coverPhotoUrl}
          name={item.kind}
          fill
          style={{ aspectRatio: 4 / 3 }}
        />
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: moderateScale(8),
            flexWrap: 'wrap',
          }}
        >
          <KindTag kind={item.kind} />
          <Text style={[typo.bodySemi, { color: c.ink }]}>
            for {item.recipientName}
          </Text>
        </View>
        <Text style={[typo.body, { color: c.muted }]}>
          {mailFromLine(item)}
          {item.broughtBy ? ` · brought by ${item.broughtBy}` : ''}
        </Text>
        <Text style={[typo.mono, { color: c.ink }]}>
          {item.id}
          {item.refNo ? ` · ${item.refNo}` : ''}
        </Text>
      </View>
      {item.notifiedAt ? (
        <Banner tone="accent">
          <Text style={[typo.body, { color: c.ink }]}>
            <Text style={{ fontFamily: fonts.bodySemi }}>
              {item.recipientName} has been notified
            </Text>{' '}
            to collect it at the gate.
          </Text>
        </Banner>
      ) : (
        <Banner tone="warn">
          <Text style={[typo.body, { color: c.ink }]}>
            <Text style={{ fontFamily: fonts.bodySemi }}>
              {item.recipientName}{' '}
              {item.recipient
                ? "can't sign in to Gatebook."
                : "isn't on Gatebook."}
            </Text>{' '}
            Call them to collect it.
          </Text>
        </Banner>
      )}
      <View style={styles.actions}>
        <Button
          title="Post room"
          variant="ghost"
          onPress={onPostRoom}
          style={{ flex: 1 }}
          size="lg"
        />
        <Button
          title="Log next item"
          onPress={onNext}
          style={{ flex: 1.3 }}
          size="lg"
        />
      </View>
    </ScrollView>
  );
}

export function LogMailScreen({ navigation }) {
  const { c } = useTheme();
  const toast = useToast();
  const settings = useSettings();

  const dispatch = useDispatch();
  const canAct = useSelector(selectCanHandleMail);
  // The half-filled form lives in the drafts slice: it survives gate changes, navigation and live updates.
  const { form, recipient, coverUri, personUri } =
    useSelector(selectLogMailDraft);
  const [createMail] = useCreateMailMutation();
  const [carrierFocused, setCarrierFocused] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [serverError, setServerError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [logged, setLogged] = useState(null);

  // App bar title follows the step: the form, then the confirmation.
  useLayoutEffect(() => {
    navigation.setOptions({
      title: logged ? 'Item logged' : 'Log incoming post',
    });
  }, [navigation, logged]);

  const set = useCallback(
    (key, value) => {
      dispatch(logMailFieldSet({ key, value }));
      setErrors(e => (e[key] ? { ...e, [key]: false } : e));
    },
    [dispatch],
  );

  const carrierSuggestions = carrierFocused
    ? CARRIERS.filter(
        x =>
          x.toLowerCase().includes(form.carrier.trim().toLowerCase()) &&
          x.toLowerCase() !== form.carrier.trim().toLowerCase(),
      )
    : [];

  const pickHost = h => {
    dispatch(
      logMailPatched({
        recipient: {
          id: h.id,
          name: h.name,
          dept: h.dept,
          location: h.location,
        },
        form: { recipientText: h.name, dept: h.dept || form.dept },
      }),
    );
    setErrors(e => ({ ...e, recipient: false }));
  };

  const take = async kind => {
    try {
      const uri = await captureImage(kind);
      if (!uri) return;
      dispatch(
        logMailPatched(
          kind === 'cover' ? { coverUri: uri } : { personUri: uri },
        ),
      );
      setErrors(e => ({ ...e, [kind]: false }));
    } catch (e) {
      toast.show(errorMessage(e), 'error');
    }
  };

  const clear = () => {
    dispatch(logMailCleared());
    setErrors({});
    setFormError(null);
    setServerError(null);
  };

  const submit = async () => {
    setServerError(null);
    const e = {};
    if (!coverUri) e.cover = true;
    if (!personUri) e.person = true;
    if (!form.kind) e.kind = true;
    if (!form.sender.trim()) e.sender = true;
    if (!form.broughtBy.trim()) e.broughtBy = true;
    if (!recipient && !form.recipientText.trim()) e.recipient = true;
    const pieces = parseInt(form.pieces, 10);
    if (!Number.isFinite(pieces) || pieces < 1 || pieces > 99) e.pieces = true;
    setErrors(e);
    if (Object.keys(e).length) {
      setFormError('Fill the highlighted fields and take both photos.');
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      const res = await createMail({
        kind: form.kind,
        sender: form.sender.trim(),
        refNo: form.refNo.trim().toUpperCase(),
        carrier: form.carrier.trim(),
        broughtBy: form.broughtBy.trim(),
        broughtPhone: form.broughtPhone.trim(),
        pieces,
        recipientId: recipient?.id,
        recipientName: recipient ? undefined : form.recipientText.trim(),
        dept: form.dept,
        notes: form.notes.trim(),
        coverUri,
        personUri,
      }).unwrap();
      toast.show(
        res.item.notifiedAt
          ? `Logged · ${res.item.recipientName} notified`
          : `Logged · call ${res.item.recipientName}`,
      );
      clear();
      setLogged(res.item);
    } catch (err) {
      setServerError(errorMessage(err));
      const map = {
        recipientId: 'recipient',
        recipientName: 'recipient',
        cover: 'cover',
        person: 'person',
      };
      if (err && err.field)
        setErrors(prev => ({ ...prev, [map[err.field] ?? err.field]: true }));
    } finally {
      setSaving(false);
    }
  };

  if (!canAct) {
    return (
      <View
        style={{ flex: 1, backgroundColor: c.bg, padding: moderateScale(16) }}
      >
        <Banner tone="warn">
          <Text style={[typo.body, { color: c.ink }]}>
            Only security staff and admins can log incoming post.
          </Text>
        </Banner>
      </View>
    );
  }

  if (logged) {
    return (
      <ItemLogged
        item={logged}
        onNext={() => setLogged(null)}
        onPostRoom={() =>
          navigation.navigate('Main', {
            screen: 'Post',
            params: { tab: 'lodged' },
          })
        }
      />
    );
  }

  const deptOptions = [
    { value: '', label: 'Not set' },
    ...settings.departments.map(d => ({ value: d, label: d })),
  ];
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.content}
      >
        <View style={styles.photos}>
          <View style={{ flex: 1.25 }}>
            <PhotoTile
              label="Photo of the cover"
              sub="Show the address label and tracking number"
              uri={coverUri}
              aspect={4 / 3}
              required
              error={errors.cover}
              onPress={() => take('cover')}
            />
          </View>
          <View style={{ flex: 1 }}>
            <PhotoTile
              label="Photo of delivery person"
              sub="Front camera"
              uri={personUri}
              aspect={3 / 4}
              required
              error={errors.person}
              onPress={() => take('person')}
            />
          </View>
        </View>

        <FieldShell label="Type" required error={errors.kind}>
          <ChipSelect
            accessibilityLabel="Type of post"
            options={settings.mailKinds}
            value={form.kind}
            onChange={v => set('kind', v)}
            error={errors.kind}
          />
        </FieldShell>

        <Field
          label="From (sender)"
          required
          value={form.sender}
          onChangeText={t => set('sender', t)}
          autoCapitalize="words"
          error={errors.sender}
          placeholder="Income Tax Department"
        />
        <Field
          label="Tracking / reference no."
          value={form.refNo}
          onChangeText={t => set('refNo', t.toUpperCase())}
          autoCapitalize="characters"
          autoCorrect={false}
          mono
        />
        <View>
          <Field
            label="Brought by"
            value={form.carrier}
            onChangeText={t => set('carrier', t)}
            onFocus={() => setCarrierFocused(true)}
            onBlur={() => setCarrierFocused(false)}
            placeholder="Post / courier company"
          />
          {carrierSuggestions.length ? (
            <View style={styles.suggestRow}>
              {carrierSuggestions.slice(0, 6).map(x => (
                <Pressable
                  key={x}
                  accessibilityRole="button"
                  accessibilityLabel={`Brought by ${x}`}
                  onPress={() => set('carrier', x)}
                  style={[
                    styles.suggestChip,
                    { borderColor: c.line, backgroundColor: c.surface },
                  ]}
                >
                  <Text style={[typo.smallMedium, { color: c.ink }]}>{x}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
        <Field
          label="Delivery person's name"
          required
          value={form.broughtBy}
          onChangeText={t => set('broughtBy', t)}
          autoCapitalize="words"
          error={errors.broughtBy}
        />
        <View style={styles.row2}>
          <Field
            label="Delivery person's mobile"
            value={form.broughtPhone}
            onChangeText={t =>
              set('broughtPhone', t.replace(/[^\d+]/g, '').slice(0, 14))
            }
            keyboardType="phone-pad"
            mono
            style={{ flex: 2 }}
          />
          <Field
            label="No. of pieces"
            value={form.pieces}
            onChangeText={t => set('pieces', t.replace(/\D/g, '').slice(0, 2))}
            keyboardType="number-pad"
            mono
            error={errors.pieces}
            style={{ flex: 1 }}
          />
        </View>

        <RecipientPicker
          text={form.recipientText}
          recipient={recipient}
          error={errors.recipient}
          onText={t => {
            set('recipientText', t);
            setErrors(e => ({ ...e, recipient: false }));
          }}
          onPick={pickHost}
          onClear={() =>
            dispatch(
              logMailPatched({ recipient: null, form: { recipientText: '' } }),
            )
          }
        />

        <SelectField
          label="Department"
          value={form.dept}
          options={deptOptions}
          onChange={v => set('dept', v)}
        />
        <Field
          label="Remarks"
          value={form.notes}
          onChangeText={t => set('notes', t)}
          multiline
          maxLength={500}
        />

        {formError ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[typo.bodySemi, { color: c.bad }]}
          >
            {formError}
          </Text>
        ) : null}
        {serverError ? (
          <Banner tone="bad">
            <Text
              accessibilityLiveRegion="polite"
              style={[typo.bodyMedium, { color: c.bad }]}
            >
              {serverError}
            </Text>
          </Banner>
        ) : null}

        <View style={styles.actions}>
          <Button
            title="Clear"
            variant="ghost"
            onPress={clear}
            style={{ flex: 1 }}
            size="lg"
          />
          <Button
            title="Log & notify receiver"
            onPress={submit}
            loading={saving}
            style={{ flex: 2.2 }}
            size="lg"
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = ScaledSheet.create({
  content: { padding: '16@ms', gap: '14@ms', paddingBottom: '48@vs' },
  photos: { flexDirection: 'row', gap: '12@ms', alignItems: 'flex-start' },
  row2: { flexDirection: 'row', gap: '12@ms', alignItems: 'flex-start' },
  actions: { flexDirection: 'row', gap: '12@ms', marginTop: '6@vs' },
  card: {
    borderWidth: 1,
    borderRadius: radius.panel,
    padding: '16@ms',
    gap: '10@ms',
  },
  suggestRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: '6@ms',
    marginTop: '8@vs',
  },
  suggestChip: {
    borderWidth: 1,
    borderRadius: radius.chip,
    paddingHorizontal: '12@s',
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
  },
});
