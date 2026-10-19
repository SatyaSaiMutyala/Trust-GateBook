import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { ScaledSheet } from 'react-native-size-matters/extend';
import { Button } from '../components/Button';
import { ChipSelect } from '../components/ChipSelect';
import { DateTimeField } from '../components/DateTimeField';
import { Field, FieldShell } from '../components/Field';
import { SelectField } from '../components/SelectField';
import { PhotoStrip } from '../components/material/PhotoStrip';
import { errorMessage, useReportIncidentMutation } from '../store/api';
import { useSettings, useToast } from '../store/hooks';
import { typo, useTheme } from '../theme';
import { SEVERITIES, SEVERITY_HINT } from '../utils/incidents';

const LABEL_TO_SEVERITY = Object.fromEntries(
  SEVERITIES.map(([k, l]) => [l, k]),
);
const SEVERITY_TO_LABEL = Object.fromEntries(SEVERITIES);

/** Report an incident: type, how serious, where, when, what happened, up to 3 photos. */
export function IncidentFormScreen({ navigation, route }) {
  // From a patrol issue scan: where and what happened are filled in.
  const prefill = route?.params ?? {};
  const { c } = useTheme();
  const toast = useToast();
  const settings = useSettings();
  const types = settings?.incidentTypes ?? [];
  const sites = settings?.sites ?? [];
  const [type, setType] = useState('');
  const [severity, setSeverity] = useState('');
  const [site, setSite] = useState(sites[0] ?? '');
  const [location, setLocation] = useState(prefill.location ?? '');
  const [occurredAt, setOccurredAt] = useState(() => new Date());
  const [description, setDescription] = useState(prefill.description ?? '');
  const [people, setPeople] = useState('');
  const [actionTaken, setActionTaken] = useState('');
  const [photos, setPhotos] = useState([]);
  const [error, setError] = useState(null);
  const [field, setField] = useState(null);
  const [report, { isLoading }] = useReportIncidentMutation();

  const fail = (message, f) => {
    setError(message);
    setField(f);
  };
  const submit = async () => {
    setError(null);
    setField(null);
    if (!type) return fail('Pick the type of incident.', 'type');
    if (!severity) return fail('Pick how serious it is.', 'severity');
    if (!description.trim())
      return fail('Describe what happened.', 'description');
    try {
      const incident = await report({
        fields: {
          type,
          severity,
          site,
          location: location.trim(),
          source: prefill.source === 'patrol' ? 'patrol' : undefined,
          occurredAt: occurredAt.toISOString(),
          description: description.trim(),
          people: people.trim(),
          actionTaken: actionTaken.trim(),
        },
        photos,
      }).unwrap();
      toast.show(`Incident ${incident.id} reported`);
      navigation.replace('IncidentDetails', { id: incident.id });
    } catch (err) {
      fail(errorMessage(err), err?.field ?? null);
    }
    return undefined;
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
        <FieldShell label="What happened?" required error={field === 'type'}>
          <ChipSelect
            accessibilityLabel="Type of incident"
            options={types}
            value={type}
            onChange={setType}
            error={field === 'type'}
          />
        </FieldShell>
        <FieldShell
          label="How serious?"
          required
          error={field === 'severity'}
          hint={SEVERITY_HINT}
        >
          <ChipSelect
            accessibilityLabel="How serious"
            options={SEVERITIES.map(([, l]) => l)}
            value={SEVERITY_TO_LABEL[severity] ?? ''}
            onChange={l => setSeverity(LABEL_TO_SEVERITY[l])}
            error={field === 'severity'}
          />
        </FieldShell>
        {sites.length > 1 ? (
          <SelectField
            label="Gate / site"
            value={site}
            options={sites.map(s => ({ value: s, label: s }))}
            onChange={setSite}
            error={field === 'site'}
          />
        ) : null}
        <Field
          label="Where"
          placeholder="e.g. Lab 2, parking"
          value={location}
          onChangeText={setLocation}
        />
        <DateTimeField
          label="When"
          value={occurredAt}
          maximumDate={new Date()}
          onChange={setOccurredAt}
          error={field === 'occurredAt'}
        />
        <Field
          label="What happened"
          required
          multiline
          value={description}
          onChangeText={setDescription}
          error={field === 'description'}
        />
        <Field
          label="People involved (optional)"
          value={people}
          onChangeText={setPeople}
        />
        <Field
          label="Action taken (optional)"
          multiline
          value={actionTaken}
          onChangeText={setActionTaken}
        />
        <PhotoStrip
          title="Photos"
          label="Photo"
          value={photos}
          onChange={setPhotos}
          max={3}
          kind="boxes"
        />
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
            title="Report incident"
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
});
