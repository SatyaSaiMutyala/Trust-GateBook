import React, { useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { useSelector } from 'react-redux';
import { ScaledSheet, moderateScale } from 'react-native-size-matters/extend';
import { fileUrl } from '../api/config';
import { errorMessage, useMakeAgreementMutation } from '../store/api';
import { selectCanCheckIn } from '../store/authSlice';
import { useSettings, useToast } from '../store/hooks';
import { typo, useTheme } from '../theme';
import { termsSections } from '../utils/terms';
import { Button } from './Button';
import { Sheet } from './Sheet';

/** The terms text as headed sections. */
export function TermsDoc({ body }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: moderateScale(8) }}>
      {termsSections(body).map((s, i) => (
        <View key={i} style={{ gap: 2 }}>
          {s.heading ? (
            <Text style={[typo.bodySemi, { color: c.ink }]}>{s.heading}</Text>
          ) : null}
          <Text style={[typo.body, { color: c.ink }]}>{s.text}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * The current terms in a bottom sheet. From the check-in form (`onAgree`) it ends with "Visitor agrees".
 */
export function TermsSheet({ visible, onClose, onAgree }) {
  const { c } = useTheme();
  const settings = useSettings();
  const terms = settings.terms;
  if (!terms) return null;
  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={styles.body}>
        <Text style={[typo.eyebrow, { color: c.muted }]}>
          {terms.company || settings.company?.legalName || 'Visitor terms'} ·
          version {terms.version}
        </Text>
        <Text accessibilityRole="header" style={[typo.h2, { color: c.ink }]}>
          {terms.title}
        </Text>
        <TermsDoc body={terms.body} />
        <View style={styles.actions}>
          <Button
            title="Close"
            variant="ghost"
            onPress={onClose}
            style={{ flex: 1 }}
          />
          {onAgree ? (
            <Button
              title="Visitor agrees"
              variant="ok"
              onPress={onAgree}
              style={{ flex: 2 }}
            />
          ) : null}
        </View>
      </View>
    </Sheet>
  );
}

/**
 * "Agreement PDF" for a visit that accepted the terms: opens it, or (security) creates it when it is missing.
 */
export function AgreementButton({ visit, size = 'sm', style }) {
  const toast = useToast();
  const canAct = useSelector(selectCanCheckIn);
  const [make, { isLoading }] = useMakeAgreementMutation();
  const [made, setMade] = useState(null);
  const url = made?.agreementUrl ?? visit.agreementUrl;
  if (!visit.termsAt) return null;
  const open = async u => {
    try {
      await Linking.openURL(fileUrl(u));
    } catch {
      toast.show('Could not open the PDF on this phone.', 'error');
    }
  };
  if (url) {
    return (
      <Button
        title="Agreement PDF"
        variant="ghost"
        size={size}
        style={style}
        onPress={() => open(url)}
      />
    );
  }
  if (!canAct) return null;
  return (
    <Button
      title="Create agreement PDF"
      variant="ghost"
      size={size}
      style={style}
      loading={isLoading}
      onPress={async () => {
        try {
          const v = await make(visit.id).unwrap();
          setMade(v);
          toast.show('Agreement PDF created');
          if (v.agreementUrl) open(v.agreementUrl);
        } catch (e) {
          toast.show(errorMessage(e), 'error');
        }
      }}
    />
  );
}

const styles = ScaledSheet.create({
  body: { gap: '12@ms', paddingBottom: '8@vs' },
  actions: { flexDirection: 'row', gap: '12@ms', marginTop: '8@vs' },
});
