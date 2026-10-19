import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useDispatch, useSelector } from 'react-redux';
import { ScaledSheet, moderateScale } from 'react-native-size-matters/extend';
import { Button } from './Button';
import { Banner } from './Layout';
import { fonts, MIN_TOUCH, radius, typo, useTheme } from '../theme';
import {
  useExpectedMatchQuery,
  useExpectedTodayCountQuery,
} from '../store/api';
import { selectHasModule } from '../store/authSlice';
import { checkInPatched } from '../store/draftsSlice';
import { useSettings, useToast } from '../store/hooks';
import {
  boxesLine,
  checkInPatchFrom,
  expectedTitle,
  expectedWhen,
} from '../utils/expected';
import { fmtTime, plural } from '../utils/format';

/** Top of Check in: "3 expected today" → the Expected list. Hidden when no one is expected. */
export function ExpectedTodayStrip() {
  const { c } = useTheme();
  const navigation = useNavigation();
  const expected = useSelector(selectHasModule('expected'));
  const { data: count = 0 } = useExpectedTodayCountQuery(undefined, {
    skip: !expected,
  });
  if (!count) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${plural(
        count,
        'visitor or delivery',
        'visitors and deliveries',
      )} expected today. Open the list`}
      onPress={() => navigation.navigate('Expected')}
      style={({ pressed }) => [
        styles.strip,
        {
          backgroundColor: c.accentSoft,
          borderColor: c.accent,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text style={[typo.bodySemi, { color: c.ink, flex: 1 }]}>
        📅 {count} expected today
      </Text>
      <Text style={[typo.bodySemi, { color: c.ink }]}>View ›</Text>
    </Pressable>
  );
}

/** The check-in was filled from a pre-registration: what it says, and a way to unlink it. */
export function ExpectedBanner({ expected: e }) {
  const { c } = useTheme();
  const dispatch = useDispatch();
  const meet = e.contact ?? e.host;
  return (
    <Banner tone="accent">
      <Text style={[typo.body, { color: c.ink }]}>
        <Text style={{ fontFamily: fonts.bodySemi }}>Expected visitor.</Text>{' '}
        {e.contact
          ? `Received by ${meet.name} for ${e.host.name}`
          : `To meet ${meet.name}`}{' '}
        · {expectedWhen(e)}
        {e.preapproved ? (
          <Text style={{ fontFamily: fonts.bodySemi, color: c.ok }}>
            {' '}
            · pre-approved, no need to wait for {meet.name}
          </Text>
        ) : null}
      </Text>
      {e.notes ? (
        <Text style={[typo.small, { color: c.ink, fontStyle: 'italic' }]}>
          “{e.notes}”
        </Text>
      ) : null}
      {boxesLine(e) ? (
        <Text style={[typo.small, { color: c.ink }]}>
          Bringing {boxesLine(e)}
        </Text>
      ) : null}
      <View style={styles.row}>
        <Text style={[typo.monoSmall, { color: c.muted, flex: 1 }]}>
          {e.code}
        </Text>
        <Button
          title="Not this visitor"
          variant="ghost"
          size="sm"
          onPress={() => dispatch(checkInPatched({ expected: null }))}
        />
      </View>
    </Banner>
  );
}

/**
 * The typed mobile number matches someone expected today: offer to fill the form from it.
 * `phone` is the debounced 10+ digit number (empty = skip).
 */
export function ExpectedPhoneMatch({ phone }) {
  const { c } = useTheme();
  const dispatch = useDispatch();
  const settings = useSettings();
  const toast = useToast();
  const expected = useSelector(selectHasModule('expected'));
  const { data: match } = useExpectedMatchQuery(phone, {
    skip: !phone || !expected,
  });
  if (!phone || !match || match.kind !== 'visitor') return null;
  const meet = match.contact ?? match.host;
  return (
    <Banner tone="accent">
      <Text style={[typo.body, { color: c.ink }]}>
        <Text style={{ fontFamily: fonts.bodySemi }}>Expected today.</Text>{' '}
        {expectedTitle(match)} at {fmtTime(match.expectedAt)} for {meet.name}
        {match.company ? ` · ${match.company}` : ''}
        {match.preapproved ? ' · pre-approved' : ''}
      </Text>
      <Button
        title="Fill details"
        size="sm"
        style={{ alignSelf: 'flex-start' }}
        onPress={() => {
          dispatch(checkInPatched(checkInPatchFrom(match, settings.purposes)));
          toast.show(
            `${match.name}'s details are filled in. Take the photo and give the pass.`,
          );
        }}
      />
    </Banner>
  );
}

const styles = ScaledSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: '8@ms',
    minHeight: MIN_TOUCH,
    paddingHorizontal: '14@s',
    borderRadius: radius.panel,
    borderWidth: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: moderateScale(8),
  },
});
