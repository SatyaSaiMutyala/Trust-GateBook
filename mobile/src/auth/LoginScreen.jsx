import React, { useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch } from 'react-redux';
import { errorMessage, useLoginMutation } from '../store/api';
import { loggedIn } from '../store/authSlice';
import { API_URL } from '../api/config';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { fonts, radius, typo, useTheme } from '../theme';
import { ScaledSheet, verticalScale } from 'react-native-size-matters/extend';

export function LoginScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch();
  const [login] = useLoginMutation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef(null);

  const submit = async () => {
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await login({ email: email.trim(), password }).unwrap();
      dispatch(loggedIn(res));
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View
        style={[
          styles.rail,
          {
            backgroundColor: c.rail,
            paddingTop: insets.top + verticalScale(32),
          },
        ]}
      >
        <View style={styles.mark} accessibilityLabel="Gatebook logo">
          <Image
            source={require('../assets/logo-large.png')}
            style={styles.markImage}
            resizeMode="contain"
          />
        </View>
        <Text style={[styles.brand, { color: c.railInk }]}>GATEBOOK</Text>
        <Text style={[typo.body, { color: c.railMuted }]}>
          Visitor register
        </Text>
      </View>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
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
            <Text
              accessibilityRole="header"
              style={[typo.h2, { color: c.ink }]}
            >
              Sign in
            </Text>
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="username"
              autoComplete="email"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              submitBehavior="submit"
            />
            <Field
              ref={passwordRef}
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              textContentType="password"
              autoComplete="current-password"
              returnKeyType="go"
              onSubmitEditing={submit}
            />
            {error ? (
              <Text
                accessibilityLiveRegion="polite"
                style={[typo.bodyMedium, { color: c.bad }]}
              >
                {error}
              </Text>
            ) : null}
            <Button title="Sign in" onPress={submit} loading={busy} size="lg" />
          </View>
          <Text
            style={[typo.monoSmall, { color: c.muted, textAlign: 'center' }]}
          >
            Server: {API_URL}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = ScaledSheet.create({
  rail: { paddingHorizontal: '24@s', paddingBottom: '28@vs', gap: '4@ms' },
  // Logo on a white tile, like the app icon (its teal would disappear on the dark header).
  mark: {
    width: '76@ms',
    height: '76@ms',
    borderRadius: '18@ms',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '12@vs',
  },
  markImage: { width: '62@ms', height: '62@ms' },
  brand: {
    fontFamily: fonts.display,
    fontSize: '32@ms',
    lineHeight: '36@ms',
    letterSpacing: 2,
  },
  body: { padding: '16@ms', gap: '16@ms' },
  card: {
    borderWidth: 1,
    borderRadius: radius.panel,
    padding: '20@ms',
    gap: '16@ms',
  },
});
