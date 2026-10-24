import React, { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScaledSheet, verticalScale } from 'react-native-size-matters/extend';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Field } from '../components/Field';
import { KeyboardAwareScrollView } from '../components/KeyboardAwareScrollView';
import { errorMessage, useSignupMutation } from '../store/api';
import { fonts, MIN_TOUCH, radius, typo, useTheme } from '../theme';
import { digitsOnly } from '../utils/format';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMPTY = {
  name: '',
  email: '',
  phone: '',
  dept: '',
  password: '',
  confirm: '',
};

/** Client-side checks; returns `{ field: message }`. */
export function validateSignup(f) {
  const e = {};
  if (!f.name.trim()) e.name = 'Enter your full name.';
  if (!f.email.trim()) e.email = 'Enter your email.';
  else if (!EMAIL_RE.test(f.email.trim()))
    e.email = 'Enter a valid email address.';
  if (digitsOnly(f.phone).length < 10)
    e.phone = 'Enter a mobile number with at least 10 digits.';
  if (f.password.length < 8) e.password = 'Use at least 8 characters.';
  else if (f.password.length > 100) e.password = 'Use at most 100 characters.';
  if (!f.confirm) e.confirm = 'Type the password again.';
  else if (f.confirm !== f.password) e.confirm = "Passwords don't match.";
  return e;
}

/**
 * Self sign-up (only reachable when the server's `signup` switch is on). Creates a pending Employee account
 * that an admin approves; on success a dialog explains that, then we return to Login with the email filled in.
 */
export function CreateAccountScreen({ navigation }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [signup, { isLoading }] = useSignupMutation();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [showPw, setShowPw] = useState(false);
  const [done, setDone] = useState(null); // server success message
  const refs = {
    email: useRef(null),
    phone: useRef(null),
    dept: useRef(null),
    password: useRef(null),
    confirm: useRef(null),
  };

  const set = (key, value) => {
    setForm(f => ({ ...f, [key]: value }));
    setErrors(e => (e[key] ? { ...e, [key]: undefined } : e));
  };

  const submit = async () => {
    const e = validateSignup(form);
    setErrors(e);
    setFormError(null);
    if (Object.keys(e).length) {
      setFormError('Check the highlighted fields.');
      return;
    }
    try {
      const res = await signup({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        password: form.password,
        dept: form.dept.trim() || undefined,
      }).unwrap();
      setDone(
        res?.message ||
          "Account requested. An admin will approve it — you can sign in once it's approved.",
      );
    } catch (err) {
      const message = errorMessage(err);
      if (err?.status === 409) setErrors({ email: message });
      else if (err?.field && err.field in EMPTY)
        setErrors({ [err.field]: message });
      else setFormError(message); // 429 rate limit, network, other
    }
  };

  const finish = () => {
    const email = form.email.trim();
    setDone(null);
    setForm(EMPTY);
    navigation.navigate('Login', { email });
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View
        style={[
          styles.rail,
          {
            backgroundColor: c.rail,
            paddingTop: insets.top + verticalScale(8),
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to sign in"
          onPress={() => navigation.goBack()}
          hitSlop={8}
          style={({ pressed }) => [
            styles.back,
            { backgroundColor: pressed ? '#1E2E28' : 'transparent' },
          ]}
        >
          <Text style={[styles.backText, { color: c.railInk }]}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text
            accessibilityRole="header"
            style={[styles.title, { color: c.railInk }]}
          >
            Create account
          </Text>
          <Text style={[typo.small, { color: c.railMuted }]}>
            An admin approves new accounts
          </Text>
        </View>
      </View>
      <View style={{ flex: 1 }}>
        <KeyboardAwareScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.body,
            { paddingBottom: insets.bottom + verticalScale(24) },
          ]}
        >
          <View
            style={[
              styles.card,
              { backgroundColor: c.surface, borderColor: c.line },
            ]}
          >
            <Field
              label="Full name"
              required
              value={form.name}
              onChangeText={t => set('name', t)}
              autoCapitalize="words"
              textContentType="name"
              autoComplete="name"
              returnKeyType="next"
              onSubmitEditing={() => refs.email.current?.focus()}
              submitBehavior="submit"
              error={!!errors.name}
              hint={errors.name}
              hintTone="bad"
            />
            <Field
              ref={refs.email}
              label="Email"
              required
              value={form.email}
              onChangeText={t => set('email', t)}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete="email"
              returnKeyType="next"
              onSubmitEditing={() => refs.phone.current?.focus()}
              submitBehavior="submit"
              error={!!errors.email}
              hint={errors.email}
              hintTone="bad"
            />
            <Field
              ref={refs.phone}
              label="Mobile number"
              required
              value={form.phone}
              onChangeText={t =>
                set('phone', t.replace(/[^\d+]/g, '').slice(0, 14))
              }
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              mono
              error={!!errors.phone}
              hint={errors.phone}
              hintTone="bad"
            />
            <Field
              ref={refs.dept}
              label="Department"
              value={form.dept}
              onChangeText={t => set('dept', t)}
              placeholder="Optional, e.g. Accounts"
              autoCapitalize="words"
              returnKeyType="next"
              onSubmitEditing={() => refs.password.current?.focus()}
              submitBehavior="submit"
              error={!!errors.dept}
              hint={errors.dept}
              hintTone="bad"
            />
            <Field
              ref={refs.password}
              label="Password"
              required
              value={form.password}
              onChangeText={t => set('password', t)}
              secureTextEntry={!showPw}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="newPassword"
              autoComplete="new-password"
              returnKeyType="next"
              onSubmitEditing={() => refs.confirm.current?.focus()}
              submitBehavior="submit"
              error={!!errors.password}
              hint={errors.password ?? '8 characters or more.'}
              hintTone={errors.password ? 'bad' : 'muted'}
            />
            <Field
              ref={refs.confirm}
              label="Confirm password"
              required
              value={form.confirm}
              onChangeText={t => set('confirm', t)}
              secureTextEntry={!showPw}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="newPassword"
              returnKeyType="go"
              onSubmitEditing={submit}
              error={!!errors.confirm}
              hint={errors.confirm}
              hintTone="bad"
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={showPw ? 'Hide passwords' : 'Show passwords'}
              onPress={() => setShowPw(v => !v)}
              style={styles.toggle}
              testID="toggle-password"
            >
              <Text style={[typo.label, { color: c.ink }]}>
                {showPw ? 'Hide passwords' : 'Show passwords'}
              </Text>
            </Pressable>
            {formError ? (
              <Text
                accessibilityLiveRegion="polite"
                style={[typo.bodyMedium, { color: c.bad }]}
              >
                {formError}
              </Text>
            ) : null}
            <Button
              title="Create account"
              onPress={submit}
              loading={isLoading}
              size="lg"
            />
          </View>
        </KeyboardAwareScrollView>
      </View>
      <ConfirmDialog
        visible={!!done}
        tone="success"
        title="Account requested"
        message={done ?? ''}
        confirmLabel="OK"
        hideCancel
        onConfirm={finish}
        onCancel={finish}
      />
    </View>
  );
}

const styles = ScaledSheet.create({
  rail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: '10@ms',
    paddingHorizontal: '16@s',
    paddingBottom: '14@vs',
  },
  back: {
    width: '36@ms',
    height: '36@ms',
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: '-8@s',
  },
  backText: {
    includeFontPadding: false,
    fontSize: '26@ms',
    lineHeight: '28@ms',
  },
  title: {
    includeFontPadding: false,
    fontFamily: fonts.display,
    fontSize: '22@ms',
    lineHeight: '26@ms',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  body: { padding: '16@ms', gap: '16@ms' },
  card: {
    borderWidth: 1,
    borderRadius: radius.panel,
    padding: '20@ms',
    gap: '14@ms',
  },
  toggle: {
    alignSelf: 'flex-start',
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
  },
});
