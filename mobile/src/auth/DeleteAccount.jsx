import React, { useState } from 'react';
import { Text } from 'react-native';
import { useDispatch } from 'react-redux';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Field } from '../components/Field';
import { signOutDeletedAccount } from '../push/push';
import { errorMessage, useDeleteMeMutation, useFeatures } from '../store/api';
import { toastShown } from '../store/uiSlice';
import { typo, useTheme } from '../theme';

export const DELETE_ACCOUNT_TEXT =
  "This permanently removes your name, contact details and login from TruSentinel. Gate-register records stay for the audit trail. This can't be undone.";

/**
 * "Delete account" (danger outline) + confirm dialog with a password field. Rendered only when the
 * server's `accountDeletion` switch is on. Wrong password (401) / last admin (409) stay in the dialog.
 */
export function DeleteAccount() {
  const { c } = useTheme();
  const dispatch = useDispatch();
  const { accountDeletion } = useFeatures();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [deleteMe, { isLoading }] = useDeleteMeMutation();

  if (!accountDeletion) return null;

  const close = () => {
    setOpen(false);
    setPassword('');
    setError(null);
  };

  const confirm = async () => {
    if (!password) {
      setError('Enter your password to confirm.');
      return;
    }
    setError(null);
    try {
      await deleteMe({ password }).unwrap();
      close();
      dispatch(toastShown('Your account has been deleted.'));
      await dispatch(signOutDeletedAccount());
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <>
      <Button
        title="Delete account"
        variant="danger"
        onPress={() => setOpen(true)}
        testID="delete-account"
        accessibilityLabel="Delete my account"
      />
      <ConfirmDialog
        visible={open}
        tone="danger"
        title="Delete your account?"
        message={DELETE_ACCOUNT_TEXT}
        confirmLabel="Delete account"
        loading={isLoading}
        onCancel={close}
        onConfirm={confirm}
      >
        <Field
          label="Password"
          value={password}
          onChangeText={t => {
            setPassword(t);
            setError(null);
          }}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="password"
          autoComplete="current-password"
          error={!!error}
          testID="delete-password"
        />
        {error ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[typo.bodyMedium, { color: c.bad }]}
          >
            {error}
          </Text>
        ) : null}
      </ConfirmDialog>
    </>
  );
}
