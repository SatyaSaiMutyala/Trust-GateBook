import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { ScaledSheet } from 'react-native-size-matters/extend';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Panel } from '../../components/Layout';
import { ListError } from '../../components/ListFooter';
import { SelectField } from '../../components/SelectField';
import { useNow } from '../../state/useNow';
import {
  errorMessage,
  useApproveUserMutation,
  useListUsersInfiniteQuery,
  useRejectUserMutation,
} from '../../store/api';
import { ROLE_LABELS } from '../../store/authSlice';
import { useToast } from '../../store/hooks';
import { useInfiniteList } from '../../store/useInfiniteList';
import { fonts, radius, typo, useTheme } from '../../theme';
import { fmtRelative } from '../../utils/format';

const ROLE_OPTIONS = ['host', 'security', 'viewer', 'admin'].map(value => ({
  value,
  label: ROLE_LABELS[value],
}));

function PendingRow({ item: u, now, onReject }) {
  const { c } = useTheme();
  const toast = useToast();
  const [role, setRole] = useState('host');
  const [approve, { isLoading }] = useApproveUserMutation();

  const onApprove = async () => {
    try {
      await approve({ id: u.id, role }).unwrap();
      toast.show(`${u.name} approved as ${ROLE_LABELS[role]}`);
    } catch (e) {
      toast.show(errorMessage(e), 'error');
    }
  };

  return (
    <View
      testID={`pending-${u.id}`}
      style={[styles.row, { backgroundColor: c.sunk, borderColor: c.line }]}
    >
      <Text style={[typo.bodySemi, { color: c.ink }]} numberOfLines={1}>
        {u.name}
      </Text>
      <Text style={[typo.small, { color: c.muted }]} numberOfLines={1}>
        {u.email}
      </Text>
      <Text style={[typo.small, { color: c.muted }]} numberOfLines={1}>
        {[u.phone, u.dept].filter(Boolean).join(' · ') || '—'}
      </Text>
      <Text style={[typo.monoSmall, { color: c.muted }]}>
        Requested {u.createdAt ? fmtRelative(u.createdAt, now) : ''}
      </Text>
      <SelectField
        label={`Role for ${u.name}`}
        value={role}
        options={ROLE_OPTIONS}
        onChange={setRole}
      />
      <View style={styles.actions}>
        <Button
          title="Reject"
          variant="danger"
          size="sm"
          onPress={() => onReject(u)}
          style={styles.action}
          accessibilityLabel={`Reject ${u.name}`}
        />
        <Button
          title="Approve"
          variant="ok"
          size="sm"
          loading={isLoading}
          onPress={onApprove}
          style={styles.action}
          accessibilityLabel={`Approve ${u.name}`}
        />
      </View>
    </View>
  );
}

/**
 * Admin: self sign-up requests waiting for approval (GET /api/users?status=pending, paginated).
 * Approve (with a role, default Employee) or Reject (confirmed). Hidden when there are none.
 */
export function PendingRequests({ onLayout }) {
  const { c } = useTheme();
  const toast = useToast();
  const now = useNow(60000);
  const params = useMemo(() => ({ status: 'pending', sort: '-createdAt' }), []);
  const list = useInfiniteList(useListUsersInfiniteQuery, params);
  const [reject, { isLoading: rejecting }] = useRejectUserMutation();
  const [confirm, setConfirm] = useState(null);

  if (!list.error && list.total === 0) return null;

  const doReject = async () => {
    const u = confirm;
    try {
      await reject(u.id).unwrap();
      toast.show(`Request from ${u.name} rejected`);
    } catch (e) {
      toast.show(errorMessage(e), 'error');
    } finally {
      setConfirm(null);
    }
  };

  return (
    <View onLayout={onLayout}>
      <Panel
        title={`Pending requests (${list.total})`}
        subtitle="People who created an account in the app. Approve to let them sign in."
      >
        {list.error ? (
          <ListError message={list.error} onRetry={list.retry} />
        ) : null}
        {list.items.map(u => (
          <PendingRow key={u.id} item={u} now={now} onReject={setConfirm} />
        ))}
        {list.pagination.hasNextPage ? (
          <Button
            title="Load more"
            variant="ghost"
            size="sm"
            loading={list.loadingMore}
            onPress={list.loadMore}
          />
        ) : null}
        <Text style={[styles.note, { color: c.muted }]}>
          Approved people move to the user list below.
        </Text>
      </Panel>
      <ConfirmDialog
        visible={!!confirm}
        tone="danger"
        title="Reject request?"
        message={
          confirm
            ? `${confirm.name} (${confirm.email}) won't be able to sign in. The request is deleted.`
            : ''
        }
        confirmLabel="Reject"
        loading={rejecting}
        onCancel={() => setConfirm(null)}
        onConfirm={doReject}
      />
    </View>
  );
}

const styles = ScaledSheet.create({
  row: {
    borderWidth: 1,
    borderRadius: radius.control,
    padding: '12@ms',
    gap: '6@ms',
  },
  actions: { flexDirection: 'row', gap: '10@ms', marginTop: '4@ms' },
  action: { flex: 1 },
  note: { fontFamily: fonts.body, fontSize: '12@ms' },
});
