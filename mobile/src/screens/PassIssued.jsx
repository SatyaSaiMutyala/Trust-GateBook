import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { Thumb } from '../components/Thumb';
import { fonts, radius, typo, useTheme } from '../theme';
import { fmtDateTime } from '../utils/format';
import { ScaledSheet, moderateScale } from 'react-native-size-matters/extend';

function Row({ label, value }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: moderateScale(1) }}>
      <Text
        style={[typo.eyebrow, { color: c.muted, fontSize: moderateScale(11) }]}
      >
        {label}
      </Text>
      <Text style={[typo.bodySemi, { color: c.ink }]}>{value}</Text>
    </View>
  );
}

/** Shown after a successful check-in: a ticket card with the pass number to hand over. */
export function PassIssued({ visit, onNext, onSeeInside }) {
  const { c } = useTheme();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={styles.content}
    >
      <View
        style={[
          styles.ticket,
          { backgroundColor: c.surface, borderColor: c.line },
        ]}
      >
        <View style={[styles.ticketHead, { backgroundColor: c.rail }]}>
          <Text style={[typo.h2, { color: c.railInk, letterSpacing: 2 }]}>
            VISITOR
          </Text>
          <Text style={[typo.eyebrow, { color: c.accent }]} numberOfLines={1}>
            Main entrance
          </Text>
        </View>
        <View style={styles.ticketBody}>
          <Thumb
            url={visit.photoUrl}
            name={visit.name}
            width={88}
            height={112}
          />
          <View style={{ flex: 1, gap: moderateScale(8) }}>
            <Row label="Name" value={visit.name} />
            <Row
              label="Meeting"
              value={`${visit.host}${visit.dept ? ` · ${visit.dept}` : ''}`}
            />
            <Row
              label="Purpose"
              value={`${visit.purpose}${
                visit.persons > 1 ? ` · ${visit.persons} persons` : ''
              }`}
            />
            <View style={{ gap: moderateScale(1) }}>
              <Text
                style={[
                  typo.eyebrow,
                  { color: c.muted, fontSize: moderateScale(11) },
                ]}
              >
                In
              </Text>
              <Text style={[typo.mono, { color: c.ink }]}>
                {fmtDateTime(visit.inAt)}
              </Text>
            </View>
          </View>
        </View>
        <View style={[styles.divider, { borderColor: c.line }]} />
        <View style={styles.passBlock}>
          <Text style={[typo.eyebrow, { color: c.muted }]}>Pass number</Text>
          <Text
            accessibilityLabel={`Pass number ${visit.badge}`}
            style={{
              fontFamily: fonts.mono,
              fontSize: moderateScale(32),
              lineHeight: moderateScale(38),
              color: c.ink,
              letterSpacing: 2,
            }}
          >
            {visit.badge}
          </Text>
          <Text style={[typo.monoSmall, { color: c.muted }]}>
            Entry {visit.pass}
          </Text>
        </View>
      </View>

      <Text style={[typo.body, { color: c.ink, textAlign: 'center' }]}>
        Hand pass <Text style={{ fontFamily: fonts.mono }}>{visit.badge}</Text>{' '}
        to the visitor. Collect it back at exit.
      </Text>

      <View style={styles.actions}>
        <Button
          title="See who's inside"
          variant="ghost"
          onPress={onSeeInside}
          style={{ flex: 1 }}
          size="lg"
        />
        <Button
          title="Check in next visitor"
          onPress={onNext}
          style={{ flex: 1.3 }}
          size="lg"
        />
      </View>
    </ScrollView>
  );
}

const styles = ScaledSheet.create({
  content: { padding: '16@ms', gap: '16@ms', paddingBottom: '48@vs' },
  ticket: { borderWidth: 1, borderRadius: radius.panel, overflow: 'hidden' },
  ticketHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: '16@s',
    paddingVertical: '10@vs',
    gap: '12@ms',
  },
  ticketBody: { flexDirection: 'row', gap: '14@ms', padding: '16@ms' },
  divider: {
    borderTopWidth: 1.5,
    borderStyle: 'dashed',
    marginHorizontal: '12@s',
  },
  passBlock: { padding: '16@ms', alignItems: 'center', gap: '2@ms' },
  actions: { flexDirection: 'row', gap: '12@ms' },
});
