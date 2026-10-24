import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { BrandMark } from '../components/BrandMark';
import { Button } from '../components/Button';
import { HostActions } from '../components/HostActions';
import { AgreementButton } from '../components/Terms';
import { VisitMaterialButtons } from '../components/material/VisitMaterial';
import { Thumb } from '../components/Thumb';
import { useGetVisitQuery } from '../store/api';
import { useSettings } from '../store/hooks';
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

/** What happens next with the host (kept live: the host may answer while this screen is open). */
function HostNote({ visit: v }) {
  const { c } = useTheme();
  const settings = useSettings();
  let tone;
  let text;
  if (v.allowedAt) {
    tone = 'go';
    text = `${v.name} has been let in.`;
  } else if (v.hostStatus === 'declined') {
    tone = 'bad';
    text = `${v.host} declined.${
      v.hostNote ? ` “${v.hostNote}”` : ''
    } Collect pass ${v.badge} and record the exit.`;
  } else if (v.hostStatus === 'accepted') {
    tone = 'go';
    text = `${v.host} accepted.${v.hostNote ? ` “${v.hostNote}”` : ''} Send ${
      v.name
    } in.`;
  } else if (v.hostStatus === 'manual') {
    tone = 'wait';
    text = `${v.host} isn't on TruSentinel. Call them to confirm, then let ${v.name} in.`;
  } else {
    tone = 'wait';
    text = `${
      v.host
    } has been notified. Ask the visitor to wait. If there is no reply in ${
      settings.hostReplyMinutes ?? 5
    } minutes, you'll get an alert to call them.`;
  }
  const colors = {
    go: { bg: c.okSoft, fg: c.ok },
    bad: { bg: c.badSoft, fg: c.bad },
    wait: { bg: c.accentSoft, fg: c.warn },
  }[tone];
  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.note,
        { backgroundColor: colors.bg, borderColor: colors.fg },
      ]}
    >
      <Text style={[typo.body, { color: c.ink }]}>{text}</Text>
      <View style={styles.noteActions}>
        <HostActions visit={v} />
      </View>
    </View>
  );
}

/** Shown after a successful check-in: a ticket card with the pass number to hand over. */
export function PassIssued({ visit, onNext, onSeeInside }) {
  const { c } = useTheme();
  const company = useSettings().company;
  // Socket events keep this cache entry current (host answers, let in).
  const { data: live } = useGetVisitQuery(visit.id);
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      showsHorizontalScrollIndicator={false}
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
          <View style={styles.headLeft}>
            {company?.logoUrl ? (
              <BrandMark size={26} logoUrl={company.logoUrl} />
            ) : null}
            <Text style={[typo.h2, { color: c.railInk, letterSpacing: 2 }]}>
              VISITOR
            </Text>
          </View>
          <Text
            style={[typo.eyebrow, { color: c.accent, flexShrink: 1 }]}
            numberOfLines={1}
          >
            {company?.name ? `${company.name} · ${visit.site}` : visit.site}
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
          {visit.badge ? (
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
          ) : (
            <Text style={[typo.h3, { color: c.ink }]}>No pass card</Text>
          )}
          <Text style={[typo.monoSmall, { color: c.muted }]}>
            Entry {visit.pass}
          </Text>
        </View>
      </View>

      {visit.badge ? (
        <Text style={[typo.body, { color: c.ink, textAlign: 'center' }]}>
          Hand pass{' '}
          <Text style={{ fontFamily: fonts.mono }}>{visit.badge}</Text> to the
          visitor. Collect it back at exit.
        </Text>
      ) : null}

      <HostNote visit={live ?? visit} />
      <VisitMaterialButtons visit={live ?? visit} />
      {(live ?? visit).termsAt ? (
        <View
          style={[
            styles.termsNote,
            { backgroundColor: c.sunk, borderColor: c.line },
          ]}
        >
          <Text style={[typo.body, { color: c.ink }]}>
            <Text style={{ fontFamily: fonts.bodySemi }}>Terms accepted.</Text>{' '}
            Confidentiality agreement saved with the visitor's photo
            {(live ?? visit).agreementUrl ? '.' : ' (the PDF is being made).'}
          </Text>
          <AgreementButton
            visit={live ?? visit}
            style={{ alignSelf: 'flex-start' }}
          />
        </View>
      ) : null}

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
  headLeft: { flexDirection: 'row', alignItems: 'center', gap: '8@ms' },
  termsNote: {
    borderWidth: 1,
    borderRadius: radius.panel,
    padding: '12@ms',
    gap: '8@ms',
  },
  ticketBody: { flexDirection: 'row', gap: '14@ms', padding: '16@ms' },
  divider: {
    borderTopWidth: 1.5,
    borderStyle: 'dashed',
    marginHorizontal: '12@s',
  },
  passBlock: { padding: '16@ms', alignItems: 'center', gap: '2@ms' },
  note: {
    borderWidth: 1,
    borderRadius: radius.panel,
    padding: '12@ms',
    gap: '8@ms',
  },
  noteActions: { flexDirection: 'row', flexWrap: 'wrap', gap: '8@ms' },
  actions: { flexDirection: 'row', gap: '12@ms' },
});
