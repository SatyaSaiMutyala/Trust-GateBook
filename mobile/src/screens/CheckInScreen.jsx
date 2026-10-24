import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Button } from '../components/Button';
import { Checkbox } from '../components/Checkbox';
import { ChipSelect } from '../components/ChipSelect';
import { TermsSheet } from '../components/Terms';
import {
  ExpectedBanner,
  ExpectedPhoneMatch,
  ExpectedTodayStrip,
} from '../components/ExpectedHints';
import { Field, FieldShell } from '../components/Field';
import { KeyboardAwareScrollView } from '../components/KeyboardAwareScrollView';
import { Banner } from '../components/Layout';
import { HeaderText } from '../components/TopBar';
import { SelectField } from '../components/SelectField';
import { useDebounced } from '../state/useDebounced';
import { useNow } from '../state/useNow';
import { fonts, MIN_TOUCH, radius, typo, useTheme } from '../theme';
import { ID_TYPES } from '../types';
import { captureImage } from '../utils/camera';
import {
  digitsOnly,
  firstName,
  fmtDate,
  fmtTime,
  plural,
} from '../utils/format';
import { PassIssued } from './PassIssued';
import { PhotoTile } from '../components/PhotoTile';
import {
  ScaledSheet,
  moderateScale,
  scale,
} from 'react-native-size-matters/extend';
import { useDispatch, useSelector } from 'react-redux';
import {
  errorMessage,
  useBadgeCheckQuery,
  useCheckInMutation,
  useLookupInfiniteQuery,
} from '../store/api';
import { selectCanCheckIn } from '../store/authSlice';
import {
  checkInCleared,
  checkInFieldSet,
  checkInPatched,
  selectCheckInDraft,
} from '../store/draftsSlice';
import { useSettings, useToast } from '../store/hooks';
import { useInfiniteList } from '../store/useInfiniteList';
import { RecipientPicker } from '../components/RecipientPicker';

/** "Whom to meet": a picked employee is asked to accept in the app; a typed name is confirmed by phone. */
const HOST_WORDING = {
  label: 'Whom to meet',
  picked: 'Gets a notification and accepts or declines in TruSentinel',
  typed: 'Not on TruSentinel — call them before letting the visitor in',
  idle: 'Pick the employee being visited. Not listed? Type their name.',
  noMatch: name => `No employee named “${name}” is on TruSentinel.`,
  useTyped: name => `Use “${name}” — I'll confirm by phone`,
  none: "No employees are on TruSentinel yet. An admin can add them in Users. For now, type the name — you'll confirm by phone.",
  changeLabel: name => `Change whom to meet, currently ${name}`,
};
/** Server error fields → form fields. */
const FIELD_MAP = { hostId: 'host' };

/** Live clock for the app bar, in its own component so ticking never re-renders the form. */
function LiveClock() {
  const now = useNow(15000);
  return (
    <HeaderText accessibilityLabel={`Time ${fmtTime(now)}`}>
      {fmtTime(now)}
    </HeaderText>
  );
}

export function CheckInScreen() {
  const { c } = useTheme();
  const navigation = useNavigation();
  const toast = useToast();
  const settings = useSettings();

  const dispatch = useDispatch();
  const canCheckIn = useSelector(selectCanCheckIn);
  // The half-filled form lives in the drafts slice: it survives gate changes, navigation and live updates.
  const { form, photoUri, idPhotoUri, hostPick, expected } =
    useSelector(selectCheckInDraft);
  const [checkIn] = useCheckInMutation();
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [serverError, setServerError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [issued, setIssued] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const termsOn = !!settings.terms?.required;
  const [termsOpen, setTermsOpen] = useState(false);
  const scrollRef = useRef(null);

  // App bar: "Check in" with the live clock, switching to "Pass issued" after a check-in.
  useLayoutEffect(() => {
    navigation.setOptions({
      title: issued ? 'Pass issued' : 'Check in',
      headerActions: canCheckIn && !issued ? <LiveClock /> : null,
    });
  }, [navigation, issued, canCheckIn]);

  const set = useCallback(
    (key, value) => {
      dispatch(checkInFieldSet({ key, value }));
      setErrors(e => (e[key] ? { ...e, [key]: false } : e));
    },
    [dispatch],
  );

  // ---- Returning-visitor lookup: open visit + paginated history (limit 5) ----
  const phoneDigits = digitsOnly(form.phone);
  const lookupPhone = useDebounced(
    phoneDigits.length >= 10 ? phoneDigits : '',
    400,
  );
  const lookupParams = useMemo(
    () => ({ phone: lookupPhone, limit: 5 }),
    [lookupPhone],
  );
  const history = useInfiniteList(useLookupInfiniteQuery, lookupParams, {
    skip: !(lookupPhone.length >= 10),
  });
  const lookupReady =
    lookupPhone.length >= 10 &&
    lookupPhone === phoneDigits &&
    !history.loading &&
    !history.error;
  const openVisit = lookupReady ? history.extra.open ?? null : null;
  const previous = lookupReady ? history.items : [];
  const previousCount = lookupReady ? history.total : 0;
  useEffect(() => setShowHistory(false), [lookupPhone]);

  // ---- Badge check while typing ----
  const badgeTyped = useDebounced(form.badge.trim(), 400);
  const { data: badgeData } = useBadgeCheckQuery(badgeTyped, {
    skip: !badgeTyped,
    refetchOnMountOrArgChange: true,
  });
  const badgeHolder = badgeTyped ? badgeData?.inUse ?? null : null;
  const badgeHeld =
    badgeHolder &&
    badgeHolder.badge.toUpperCase() === form.badge.trim().toUpperCase()
      ? badgeHolder
      : null;

  const fillFromLast = () => {
    const last = previous[0];
    if (!last) return;
    dispatch(
      checkInPatched({
        form: {
          name: last.name || form.name,
          company: last.company || form.company,
          host: last.host || form.host,
          dept: last.dept || form.dept,
          vehicle: last.vehicle || form.vehicle,
          idType: last.idType || form.idType,
          idLast4: last.idLast4 || form.idLast4,
        },
        // Same employee as last time (the server re-checks they can still receive visitors).
        hostPick: last.hostId
          ? {
              id: last.hostId,
              name: last.host,
              dept: last.dept ?? '',
              location: last.hostLocation ?? '',
            }
          : hostPick,
      }),
    );
    setErrors({});
    toast.show('Details filled from last visit. Take a fresh photo.');
  };

  const take = async kind => {
    try {
      const uri = await captureImage(kind);
      if (!uri) return;
      if (kind === 'photo') {
        dispatch(checkInPatched({ photoUri: uri }));
        setErrors(e => ({ ...e, photo: false }));
      } else {
        dispatch(checkInPatched({ idPhotoUri: uri }));
      }
    } catch (e) {
      toast.show(errorMessage(e), 'error');
    }
  };

  const clear = () => {
    dispatch(checkInCleared());
    setErrors({});
    setFormError(null);
    setServerError(null);
  };

  const submit = async () => {
    setServerError(null);
    const e = {};
    // Photo and pass number can be made optional in Settings → Visitors.
    const photoRequired = settings.visitorPhotoRequired !== false;
    const passRequired = settings.visitorPassRequired !== false;
    if (photoRequired && !photoUri) e.photo = true;
    if (phoneDigits.length < 10) e.phone = true;
    if (!form.name.trim()) e.name = true;
    if (!form.purpose) e.purpose = true;
    if (!form.host.trim()) e.host = true;
    if (passRequired && !form.badge.trim()) e.badge = true;
    const persons = parseInt(form.persons, 10);
    if (!Number.isFinite(persons) || persons < 1 || persons > 50)
      e.persons = true;
    if (termsOn && !form.terms) e.terms = true;
    setErrors(e);
    if (Object.keys(e).length) {
      setFormError('Fill the highlighted fields.');
      return;
    }
    setFormError(null);
    setSubmitting(true);
    try {
      const res = await checkIn({
        badge: form.badge.trim().toUpperCase(),
        phone: form.phone.trim(),
        name: form.name.trim(),
        company: form.company.trim(),
        persons,
        purpose: form.purpose,
        hostId: hostPick?.id,
        host: form.host.trim(),
        dept: form.dept,
        idType: form.idType,
        idLast4: form.idLast4,
        vehicle: form.vehicle.trim().toUpperCase(),
        items: form.items.trim(),
        notes: form.notes.trim(),
        expectedId: expected?.code,
        termsAccepted: termsOn ? !!form.terms : undefined,
        photoUri,
        idPhotoUri,
      }).unwrap();
      toast.show(
        res.visit.hostVia === 'preapproved'
          ? `Checked in · pre-approved for ${res.visit.host}, send them in`
          : res.visit.hostStatus === 'waiting'
          ? `Checked in · ${res.visit.host} notified`
          : `Checked in · call ${res.visit.host} to confirm`,
      );
      clear();
      setIssued(res.visit);
    } catch (err) {
      setServerError(errorMessage(err));
      if (err && err.field)
        setErrors(prev => ({
          ...prev,
          [FIELD_MAP[err.field] ?? err.field]: true,
        }));
      if (err && err.code === 'badge_in_use')
        setErrors(prev => ({ ...prev, badge: true }));
      if (err && err.code === 'already_inside')
        setErrors(prev => ({ ...prev, phone: true }));
    } finally {
      setSubmitting(false);
    }
  };

  if (!canCheckIn) {
    return (
      <View
        style={[
          styles.screen,
          { backgroundColor: c.bg, padding: moderateScale(16) },
        ]}
      >
        <Banner tone="warn">
          <Text style={[typo.body, { color: c.ink }]}>
            Your account is read-only. Ask an admin for security access to check
            visitors in.
          </Text>
        </Banner>
      </View>
    );
  }

  if (issued) {
    return (
      <PassIssued
        visit={issued}
        onNext={() => setIssued(null)}
        onSeeInside={() => {
          setIssued(null);
          navigation.navigate('Inside');
        }}
      />
    );
  }

  const deptOptions = [
    { value: '', label: 'Not set' },
    ...settings.departments.map(d => ({ value: d, label: d })),
  ];
  const idOptions = ID_TYPES.map(t => ({ value: t, label: t }));

  return (
    <View style={[styles.screen, { backgroundColor: c.bg }]}>
      <KeyboardAwareScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        {expected ? (
          <ExpectedBanner expected={expected} />
        ) : (
          <ExpectedTodayStrip />
        )}
        <View style={styles.photos}>
          <View style={{ flex: 1 }}>
            <PhotoTile
              label="Take visitor photo"
              sub="Face, shoulders up"
              uri={photoUri}
              aspect={3 / 4}
              required={settings.visitorPhotoRequired !== false}
              error={errors.photo}
              onPress={() => take('photo')}
            />
          </View>
          <View style={{ flex: 1.2, gap: moderateScale(6) }}>
            <PhotoTile
              label="ID proof"
              sub="Optional · back camera"
              uri={idPhotoUri}
              aspect={16 / 10}
              onPress={() => take('id')}
            />
            {idPhotoUri ? (
              <Button
                title="Remove ID photo"
                variant="ghost"
                size="sm"
                onPress={() => dispatch(checkInPatched({ idPhotoUri: null }))}
              />
            ) : null}
          </View>
        </View>

        <Field
          label="Mobile number"
          required
          value={form.phone}
          onChangeText={t =>
            set('phone', t.replace(/[^\d+]/g, '').slice(0, 14))
          }
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          maxLength={14}
          mono
          error={errors.phone}
          placeholder="98xxxxxxxx"
        />

        {!expected && !openVisit ? (
          <ExpectedPhoneMatch phone={lookupPhone} />
        ) : null}
        {openVisit ? (
          <Banner tone="warn">
            <Text style={[typo.body, { color: c.ink }]}>
              <Text style={{ fontFamily: fonts.bodySemi }}>
                Already inside.
              </Text>{' '}
              {firstName(openVisit.name)} checked in at{' '}
              {fmtTime(openVisit.inAt)}. Close that entry before checking in
              again.
            </Text>
            <Button
              title="View entry"
              variant="ghost"
              size="sm"
              style={{ alignSelf: 'flex-start' }}
              onPress={() =>
                navigation.navigate('VisitDetails', { id: openVisit.id })
              }
            />
          </Banner>
        ) : previous.length > 0 ? (
          <Banner tone="accent">
            <Text style={[typo.body, { color: c.ink }]}>
              <Text style={{ fontFamily: fonts.bodySemi }}>
                Returning visitor.
              </Text>{' '}
              {firstName(previous[0].name)}
              {previous[0].company ? ` · ${previous[0].company}` : ''} ·{' '}
              {plural(previousCount, 'earlier visit')}, last on{' '}
              {fmtDate(previous[0].inAt)}
            </Text>
            <View
              style={{
                flexDirection: 'row',
                gap: moderateScale(8),
                flexWrap: 'wrap',
              }}
            >
              <Button title="Fill details" size="sm" onPress={fillFromLast} />
              <Button
                title={showHistory ? 'Hide visits' : 'Earlier visits'}
                variant="ghost"
                size="sm"
                onPress={() => setShowHistory(v => !v)}
              />
            </View>
            {showHistory ? (
              <View>
                {previous.map(v => (
                  <Pressable
                    key={v.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Visit on ${fmtDate(v.inAt)}, ${
                      v.purpose
                    }, ${v.host}`}
                    onPress={() =>
                      navigation.navigate('VisitDetails', { id: v.id })
                    }
                    style={[styles.histRow, { borderTopColor: c.line }]}
                  >
                    <Text
                      style={[
                        typo.monoSmall,
                        { color: c.muted, width: scale(92) },
                      ]}
                    >
                      {fmtDate(v.inAt)}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[typo.small, { color: c.ink, flex: 1 }]}
                    >
                      {v.purpose} · {v.host}
                      {v.dept ? ` (${v.dept})` : ''}
                    </Text>
                  </Pressable>
                ))}
                {history.pagination.hasNextPage || history.moreError ? (
                  <Button
                    title={history.moreError ? 'Retry' : 'Show more'}
                    variant="ghost"
                    size="sm"
                    loading={history.loadingMore}
                    onPress={
                      history.moreError ? history.retry : history.loadMore
                    }
                  />
                ) : null}
              </View>
            ) : null}
          </Banner>
        ) : null}

        <Field
          label="Visitor name"
          required
          value={form.name}
          onChangeText={t => set('name', t)}
          autoCapitalize="words"
          textContentType="name"
          error={errors.name}
        />
        <View style={styles.row2}>
          <Field
            label="Coming from"
            value={form.company}
            onChangeText={t => set('company', t)}
            style={{ flex: 2 }}
            placeholder="Company / place"
          />
          <Field
            label="No. of persons"
            value={form.persons}
            onChangeText={t => set('persons', t.replace(/\D/g, '').slice(0, 2))}
            keyboardType="number-pad"
            mono
            error={errors.persons}
            style={{ flex: 1 }}
          />
        </View>

        <FieldShell label="Purpose" required error={errors.purpose}>
          <ChipSelect
            accessibilityLabel="Purpose"
            options={settings.purposes}
            value={form.purpose}
            onChange={v => set('purpose', v)}
            error={errors.purpose}
          />
        </FieldShell>

        <RecipientPicker
          wording={HOST_WORDING}
          text={form.host}
          recipient={hostPick}
          error={errors.host}
          onText={t => {
            set('host', t);
            setErrors(e => ({ ...e, host: false }));
          }}
          onPick={h => {
            dispatch(
              checkInPatched({
                hostPick: h,
                form: { host: h.name, dept: h.dept || form.dept },
              }),
            );
            setErrors(e => ({ ...e, host: false }));
          }}
          onClear={() =>
            dispatch(checkInPatched({ hostPick: null, form: { host: '' } }))
          }
        />
        <SelectField
          label="Department"
          value={form.dept}
          options={deptOptions}
          onChange={v => set('dept', v)}
        />

        <View style={styles.row2}>
          <SelectField
            label="ID shown"
            value={form.idType}
            options={idOptions}
            onChange={v => set('idType', v)}
            style={{ flex: 1.3 }}
          />
          <Field
            label="ID last 4 digits"
            value={form.idLast4}
            onChangeText={t => set('idLast4', t.replace(/\D/g, '').slice(0, 4))}
            keyboardType="number-pad"
            maxLength={4}
            mono
            style={{ flex: 1 }}
          />
        </View>

        <Field
          label="Vehicle number"
          value={form.vehicle}
          onChangeText={t => set('vehicle', t.toUpperCase())}
          autoCapitalize="characters"
          autoCorrect={false}
          mono
          placeholder="KA01AB1234"
        />
        <Field
          label="Items carried in"
          value={form.items}
          onChangeText={t => set('items', t)}
          placeholder="Laptop, samples…"
        />

        <Field
          label="Pass number"
          required={settings.visitorPassRequired !== false}
          value={form.badge}
          onChangeText={t =>
            set(
              'badge',
              t
                .toUpperCase()
                .replace(/[^A-Z0-9-]/g, '')
                .slice(0, 12),
            )
          }
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={12}
          mono
          large
          error={errors.badge || !!badgeHeld}
          hint={
            badgeHeld
              ? `Pass ${badgeHeld.badge} is with ${
                  badgeHeld.name
                } (inside since ${fmtTime(badgeHeld.inAt)}).`
              : null
          }
          hintTone="bad"
        />
        <Field
          label="Remarks"
          value={form.notes}
          onChangeText={t => set('notes', t)}
          multiline
          maxLength={500}
        />

        {termsOn ? (
          <View
            style={[
              styles.termsRow,
              {
                borderColor: errors.terms ? c.bad : form.terms ? c.ok : c.line,
                backgroundColor: form.terms ? c.okSoft : 'transparent',
              },
            ]}
          >
            <Checkbox
              checked={!!form.terms}
              onChange={v => set('terms', v)}
              label="Visitor agrees to the terms and conditions, including confidentiality"
            >
              <Text style={[typo.bodySemi, { color: c.ink }]}>
                Visitor agrees to the terms, including confidentiality
                <Text style={{ color: c.bad }}> *</Text>
              </Text>
            </Checkbox>
            <Button
              title="Read the terms & conditions"
              variant="ghost"
              size="sm"
              style={{ alignSelf: 'flex-start' }}
              onPress={() => setTermsOpen(true)}
            />
            <Text style={[typo.small, { color: c.muted }]}>
              Show or read the terms to the visitor. Checking in with their
              photo records their agreement, and the photo is placed on a
              confidentiality agreement saved as a PDF.
            </Text>
            {errors.terms ? (
              <Text style={[typo.small, { color: c.bad }]}>
                The visitor must agree to the terms before check-in.
              </Text>
            ) : null}
            <TermsSheet
              visible={termsOpen}
              onClose={() => setTermsOpen(false)}
              onAgree={() => {
                set('terms', true);
                setTermsOpen(false);
              }}
            />
          </View>
        ) : null}

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
            title="Check in & issue pass"
            onPress={submit}
            loading={submitting}
            style={{ flex: 2.2 }}
            size="lg"
          />
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = ScaledSheet.create({
  screen: { flex: 1 },
  content: { padding: '16@ms', gap: '14@ms', paddingBottom: '48@vs' },
  photos: { flexDirection: 'row', gap: '12@ms', alignItems: 'flex-start' },
  row2: { flexDirection: 'row', gap: '12@ms', alignItems: 'flex-start' },
  histRow: {
    flexDirection: 'row',
    gap: '8@ms',
    minHeight: MIN_TOUCH,
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actions: { flexDirection: 'row', gap: '12@ms', marginTop: '6@vs' },
  termsRow: {
    borderWidth: 1.5,
    borderRadius: radius.panel,
    padding: '12@ms',
    gap: '6@ms',
  },
});
