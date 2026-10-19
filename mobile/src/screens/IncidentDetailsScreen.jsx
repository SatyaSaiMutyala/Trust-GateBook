import React, { useLayoutEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import { ScaledSheet, moderateScale } from 'react-native-size-matters/extend';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { FilterTabs } from '../components/FilterBar';
import { ImagePreview } from '../components/ImagePreview';
import { ListError } from '../components/ListFooter';
import { SelectField } from '../components/SelectField';
import { Thumb } from '../components/Thumb';
import { SeverityTag, StatusTag } from '../components/incidents/IncidentCard';
import {
  errorMessage,
  useGetIncidentQuery,
  useIncidentActionMutation,
  useIncidentAssigneesQuery,
} from '../store/api';
import { selectUser } from '../store/authSlice';
import { useToast } from '../store/hooks';
import { typo, useTheme } from '../theme';
import { fmtDateTime } from '../utils/format';
import { STATUS_LABEL, incidentRights } from '../utils/incidents';

function Fact({ label, value }) {
  const { c } = useTheme();
  if (!value) return null;
  return (
    <View style={{ gap: 2 }}>
      <Text style={[typo.eyebrow, { color: c.muted }]}>{label}</Text>
      <Text style={[typo.body, { color: c.ink }]}>{value}</Text>
    </View>
  );
}

/** One incident (route param `id`): details, photos, updates, and update / close / reopen. */
export function IncidentDetailsScreen({ navigation, route }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const user = useSelector(selectUser);
  const id = route?.params?.id;
  const {
    data: i,
    error,
    refetch,
    isLoading,
  } = useGetIncidentQuery(id, { skip: !id });
  const rights = i ? incidentRights(i, user) : {};
  const { data: assignees = [] } = useIncidentAssigneesQuery(undefined, {
    skip: !rights.assign,
  });
  const [act, { isLoading: saving }] = useIncidentActionMutation();
  const [mode, setMode] = useState(null); // null | 'close' | 'reopen'
  const [text, setText] = useState('');
  const [status, setStatus] = useState('');
  const [assignTo, setAssignTo] = useState('');
  const [failed, setFailed] = useState(null);
  const [preview, setPreview] = useState(null);
  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const run = async (action, body, done) => {
    setFailed(null);
    try {
      await act({ id: i.id, action, body }).unwrap();
      setText('');
      setStatus('');
      setAssignTo('');
      setMode(null);
      toast.show(done);
    } catch (err) {
      setFailed(errorMessage(err));
    }
  };

  const header = (
    <View
      style={[
        styles.head,
        {
          paddingTop: insets.top + moderateScale(8),
          backgroundColor: c.surface,
          borderBottomColor: c.line,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={() => navigation.goBack()}
        style={styles.close}
      >
        <Text style={[typo.h2, { color: c.ink }]}>✕</Text>
      </Pressable>
      {i ? (
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[typo.eyebrow, { color: c.muted }]}>Incident</Text>
          <Text style={[typo.h2, { color: c.ink }]}>{i.type}</Text>
          <Text style={[typo.monoSmall, { color: c.muted }]}>
            {i.id} · {i.site}
          </Text>
          <View style={styles.tags}>
            <SeverityTag severity={i.severity} />
            <StatusTag status={i.status} />
          </View>
        </View>
      ) : null}
    </View>
  );

  if (!i) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        {header}
        <View style={{ padding: moderateScale(16) }}>
          {error ? (
            <ListError message={errorMessage(error)} onRetry={refetch} />
          ) : (
            <Text style={[typo.body, { color: c.muted }]}>
              {isLoading ? 'Loading…' : ''}
            </Text>
          )}
        </View>
      </View>
    );
  }

  const images = (i.photoUrls ?? []).map((url, n) => ({
    url,
    label: `Photo ${n + 1}`,
  }));
  const canSend = !!(text.trim() || status || assignTo);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {header}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        <Text style={[typo.body, { color: c.ink }]}>{i.description}</Text>
        <Fact label="Happened" value={fmtDateTime(i.occurredAt)} />
        <Fact
          label="Reported"
          value={`${fmtDateTime(i.reportedAt)} by ${i.reportedBy?.name ?? ''}`}
        />
        <Fact
          label="Where"
          value={[i.location, i.site].filter(Boolean).join(' · ')}
        />
        <Fact label="People involved" value={i.people} />
        <Fact label="Action taken" value={i.actionTaken} />
        <Fact label="Given to" value={i.assignedTo?.name} />
        {i.status === 'closed' ? (
          <Fact
            label="Resolution"
            value={`${i.resolution} (${i.closedBy?.name}, ${fmtDateTime(
              i.closedAt,
            )})`}
          />
        ) : null}
        {images.length ? (
          <View style={styles.photos}>
            {images.map((img, n) => (
              <Pressable
                key={img.url}
                accessibilityRole="imagebutton"
                accessibilityLabel={`Open ${img.label}`}
                onPress={() => setPreview(n)}
              >
                <Thumb url={img.url} name={img.label} size={96} />
              </Pressable>
            ))}
          </View>
        ) : null}

        {i.updates.length ? (
          <View style={{ gap: moderateScale(10) }}>
            <Text style={[typo.h3, { color: c.ink }]}>Updates</Text>
            {i.updates.map((u, n) => (
              <View
                key={`${u.at}-${n}`}
                style={[styles.update, { borderLeftColor: c.line }]}
              >
                <Text style={[typo.smallMedium, { color: c.ink }]}>
                  {u.by?.name} · {fmtDateTime(u.at)}
                </Text>
                {u.status || u.assignTo ? (
                  <Text style={[typo.small, { color: c.muted }]}>
                    {[
                      u.status && `Status: ${STATUS_LABEL[u.status]}`,
                      u.assignTo && `Given to ${u.assignTo.name}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                ) : null}
                {u.text ? (
                  <Text style={[typo.body, { color: c.ink }]}>{u.text}</Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {mode === 'close' ? (
          <Field
            label="How was it resolved?"
            required
            multiline
            value={text}
            onChangeText={setText}
          />
        ) : mode === 'reopen' ? (
          <Field
            label="Why reopen? (optional)"
            multiline
            value={text}
            onChangeText={setText}
          />
        ) : rights.update ? (
          <View style={{ gap: moderateScale(12) }}>
            <Field
              label="Add an update"
              multiline
              value={text}
              onChangeText={setText}
            />
            {rights.status ? (
              <FilterTabs
                accessibilityLabel="Status"
                options={[
                  { value: 'open', label: 'Open' },
                  { value: 'in_progress', label: 'In progress' },
                ]}
                value={status || i.status}
                onChange={v => setStatus(v === i.status ? '' : v)}
              />
            ) : null}
            {rights.assign ? (
              <SelectField
                label="Give to"
                value={assignTo || i.assignedTo?.id || ''}
                placeholder="Nobody yet"
                options={assignees.map(a => ({
                  value: a.id,
                  label: `${a.name}${
                    a.designation ? ` · ${a.designation}` : ''
                  }`,
                }))}
                onChange={v => setAssignTo(v === i.assignedTo?.id ? '' : v)}
              />
            ) : null}
          </View>
        ) : null}
        {failed ? (
          <Text style={[typo.bodyMedium, { color: c.bad }]}>{failed}</Text>
        ) : null}

        <View style={styles.actions}>
          {mode ? (
            <>
              <Button
                title="Back"
                variant="ghost"
                style={{ flex: 1 }}
                onPress={() => {
                  setMode(null);
                  setFailed(null);
                }}
              />
              {mode === 'close' ? (
                <Button
                  title="Close incident"
                  variant="ok"
                  style={{ flex: 2 }}
                  loading={saving}
                  onPress={() =>
                    text.trim()
                      ? run(
                          'close',
                          { resolution: text.trim() },
                          'Incident closed',
                        )
                      : setFailed('Write how it was resolved.')
                  }
                />
              ) : (
                <Button
                  title="Reopen"
                  style={{ flex: 2 }}
                  loading={saving}
                  onPress={() =>
                    run('reopen', { text: text.trim() }, 'Incident reopened')
                  }
                />
              )}
            </>
          ) : (
            <>
              {rights.update ? (
                <Button
                  title="Save update"
                  style={{ flex: 1 }}
                  disabled={!canSend}
                  loading={saving}
                  onPress={() =>
                    run(
                      'update',
                      {
                        text: text.trim(),
                        status: status || undefined,
                        assignTo: assignTo || undefined,
                      },
                      'Update saved',
                    )
                  }
                />
              ) : null}
              {rights.close ? (
                <Button
                  title="Close incident"
                  variant="ghost"
                  style={{ flex: 1 }}
                  onPress={() => {
                    setText('');
                    setMode('close');
                  }}
                />
              ) : null}
              {rights.reopen ? (
                <Button
                  title="Reopen"
                  variant="ghost"
                  style={{ flex: 1 }}
                  onPress={() => {
                    setText('');
                    setMode('reopen');
                  }}
                />
              ) : null}
            </>
          )}
        </View>
      </ScrollView>
      {preview !== null ? (
        <ImagePreview
          visible
          index={preview}
          images={images}
          onClose={() => setPreview(null)}
        />
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = ScaledSheet.create({
  head: {
    flexDirection: 'row',
    gap: '12@ms',
    paddingHorizontal: '16@ms',
    paddingBottom: '12@vs',
    borderBottomWidth: 1,
  },
  close: { padding: '4@ms' },
  tags: { flexDirection: 'row', gap: '8@ms', flexWrap: 'wrap' },
  content: { padding: '16@ms', gap: '14@ms', paddingBottom: '48@vs' },
  photos: { flexDirection: 'row', gap: '10@ms', flexWrap: 'wrap' },
  update: { borderLeftWidth: 3, paddingLeft: '10@ms', gap: '2@vs' },
  actions: { flexDirection: 'row', gap: '10@ms', flexWrap: 'wrap' },
});
