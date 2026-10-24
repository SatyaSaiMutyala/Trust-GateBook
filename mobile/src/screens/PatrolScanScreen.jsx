import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { ScaledSheet } from 'react-native-size-matters/extend';
import { Button } from '../components/Button';
import { Field, FieldShell } from '../components/Field';
import { FilterTabs } from '../components/FilterBar';
import { Banner } from '../components/Layout';
import { PhotoStrip } from '../components/material/PhotoStrip';
import { QrScanner } from '../components/QrScanner';
import { KeyboardAwareScrollView } from '../components/KeyboardAwareScrollView';
import {
  errorMessage,
  useLazyPatrolLookupQuery,
  usePatrolScanMutation,
} from '../store/api';
import { useToast } from '../store/hooks';
import { typo, useTheme } from '../theme';
import { fmtTime } from '../utils/format';
import { codeFrom, hhmm } from '../utils/ops';

/**
 * Scan a checkpoint: the camera opens to read its QR (or type the 6-letter code printed under it; route param `code`
 * skips this), confirm the condition, note and photo, then see the round's progress.
 */
export function PatrolScanScreen({ navigation, route }) {
  const { c } = useTheme();
  const toast = useToast();
  const [typed, setTyped] = useState(route?.params?.code ?? '');
  const [look, setLook] = useState(null);
  const [status, setStatus] = useState('ok');
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [lookup, { isFetching: looking }] = useLazyPatrolLookupQuery();
  const [scan, { isLoading: saving }] = usePatrolScanMutation();
  const [scanning, setScanning] = useState(false);
  const [viaQr, setViaQr] = useState(false);
  // Typed by hand (not read from the QR, nor opened from a QR link).
  const manual = !route?.params?.code && !viaQr;

  // Straight to the camera, unless the code came with the link.
  useEffect(() => {
    if (!route?.params?.code) setScanning(true);
  }, [route?.params?.code]);

  /** Back to the start; `scanNext` opens the camera again. */
  const reset = (scanNext = false) => {
    setTyped('');
    setViaQr(false);
    setScanning(scanNext === true);
    setLook(null);
    setStatus('ok');
    setNote('');
    setPhotos([]);
    setResult(null);
    setError(null);
  };

  const find = async (scanned = null) => {
    setError(null);
    const code = scanned ?? codeFrom(typed);
    if (!code) {
      setError('Enter the 6-letter code printed under the QR');
      return;
    }
    try {
      setLook({ ...(await lookup(code).unwrap()), code });
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const save = async () => {
    setError(null);
    if (status === 'issue' && !note.trim()) {
      setError('Describe the issue in the note');
      return;
    }
    if (look.checkpoint.photoRequired && !photos.length) {
      setError('Take a photo at this checkpoint');
      return;
    }
    try {
      const r = await scan({
        fields: { code: look.code, status, note: note.trim(), manual },
        photo: photos[0] ?? null,
      }).unwrap();
      toast.show(`${r.checkpoint.name} scanned`);
      setResult(r);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const errorLine = error ? (
    <Text style={[typo.bodyMedium, { color: c.bad }]}>{error}</Text>
  ) : null;

  let body;
  if (result) {
    const issue = result.scan.status === 'issue';
    const cp = result.checkpoint;
    body = (
      <>
        <Text accessibilityRole="header" style={[typo.h2, { color: c.ink }]}>
          {cp.name} scanned
        </Text>
        <Text style={[typo.small, { color: c.muted }]}>
          {fmtTime(result.scan.at)}
          {issue ? ' · issue noted' : ''}
        </Text>
        <Text style={[typo.body, { color: c.ink }]}>
          {result.slot
            ? result.done === result.total
              ? `${result.round.name} complete. All ${result.total} checkpoints scanned.`
              : `${result.done} of ${result.total} done in ${
                  result.round.name
                }. Still to scan: ${result.missing.join(', ')}.`
            : 'Saved as an extra scan (no round due).'}
        </Text>
        {issue ? (
          <Button
            title="Report as incident"
            variant="danger"
            onPress={() =>
              navigation.navigate('IncidentForm', {
                location: cp.name + (cp.location ? `, ${cp.location}` : ''),
                description: result.scan.note,
                source: 'patrol',
              })
            }
          />
        ) : null}
        <View style={styles.actions}>
          <Button
            title="Done"
            variant="ghost"
            size="lg"
            style={{ flex: 1 }}
            onPress={() => navigation.goBack()}
          />
          <Button
            title="Scan next"
            size="lg"
            style={{ flex: 2 }}
            onPress={() => reset(true)}
          />
        </View>
      </>
    );
  } else if (look) {
    const cp = look.checkpoint;
    body = (
      <>
        <Text accessibilityRole="header" style={[typo.h2, { color: c.ink }]}>
          {cp.name}
        </Text>
        {cp.location ? (
          <Text style={[typo.small, { color: c.muted }]}>{cp.location}</Text>
        ) : null}
        <Banner tone={look.slot ? 'accent' : 'warn'}>
          <Text style={[typo.body, { color: c.ink }]}>
            {look.slot
              ? `Counts for ${look.round.name} ${hhmm(look.slot.at)} · ${
                  look.done
                } of ${look.total} done so far`
              : 'No round is due at this checkpoint right now. It will be saved as an extra scan.'}
          </Text>
        </Banner>
        <FieldShell label="Condition">
          <FilterTabs
            accessibilityLabel="Condition"
            options={[
              { value: 'ok', label: 'All OK' },
              { value: 'issue', label: 'Issue found' },
            ]}
            value={status}
            onChange={setStatus}
          />
        </FieldShell>
        <Field
          label={status === 'issue' ? 'Note (describe the issue)' : 'Note'}
          required={status === 'issue'}
          placeholder="e.g. Door locked, lights off"
          value={note}
          onChangeText={setNote}
          multiline
        />
        <PhotoStrip
          title={cp.photoRequired ? 'Photo (required here)' : 'Photo'}
          label="Photo"
          value={photos}
          onChange={setPhotos}
          max={1}
          kind="boxes"
          required={cp.photoRequired}
        />
        {errorLine}
        <View style={styles.actions}>
          <Button
            title="Back"
            variant="ghost"
            size="lg"
            style={{ flex: 1 }}
            onPress={() => reset()}
          />
          <Button
            title="Save scan"
            size="lg"
            style={{ flex: 2 }}
            loading={saving}
            onPress={save}
          />
        </View>
      </>
    );
  } else {
    body = (
      <>
        <Button
          title="Scan QR code"
          size="lg"
          loading={looking && viaQr}
          onPress={() => setScanning(true)}
        />
        <Text style={[typo.body, { color: c.muted }]}>
          Or type the 6-letter code printed under the checkpoint’s QR.
        </Text>
        <Field
          label="Checkpoint code"
          value={typed}
          onChangeText={t =>
            setTyped(
              t
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, '')
                .slice(0, 6),
            )
          }
          autoCapitalize="characters"
          autoCorrect={false}
          mono
          large
          onSubmitEditing={() => find()}
        />
        {errorLine}
        <Button
          title="Continue"
          variant="ghost"
          size="lg"
          loading={looking && !viaQr}
          onPress={() => find()}
        />
      </>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAwareScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        {body}
      </KeyboardAwareScrollView>
      <QrScanner
        visible={scanning}
        title="Scan checkpoint"
        hint="Point the camera at the QR code on the wall"
        invalidText="Not a checkpoint QR. Try again or type the code."
        parse={codeFrom}
        onCode={code => {
          setScanning(false);
          setTyped(code);
          setViaQr(true);
          find(code);
        }}
        onClose={() => setScanning(false)}
        onDenied={() =>
          setError(
            'Camera permission is off. Allow camera access for TruSentinel in Settings, or type the code.',
          )
        }
      />
    </View>
  );
}

const styles = ScaledSheet.create({
  content: { padding: '16@ms', gap: '14@ms', paddingBottom: '48@vs' },
  actions: { flexDirection: 'row', gap: '12@ms', marginTop: '6@vs' },
});
