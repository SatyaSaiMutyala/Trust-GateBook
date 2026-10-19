import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { ListError } from '../components/ListFooter';
import { PassBadge } from '../components/PassBadge';
import { StatusChip } from '../components/StatusChip';
import { Thumb } from '../components/Thumb';
import { ImagePreview, ZoomBadge } from '../components/ImagePreview';
import { visitState } from '../components/VisitorCard';
import { useNow } from '../state/useNow';
import { fonts, MIN_TOUCH, radius, typo, useTheme } from '../theme';
import { fmtDateTime, fmtDuration, fmtTime } from '../utils/format';
import { hostStage, isLegacyVisit } from '../utils/visit';
import { HostActions } from '../components/HostActions';
import { HostRespond } from '../components/HostRespond';
import { HostStageChip } from '../components/HostStageChip';
import { AgreementButton } from '../components/Terms';
import { VisitMaterial } from '../components/material/VisitMaterial';
import {
  ScaledSheet,
  moderateScale,
  verticalScale,
} from 'react-native-size-matters/extend';
import { useSelector } from 'react-redux';
import {
  errorMessage,
  useGetMyVisitQuery,
  useGetVisitQuery,
} from '../store/api';
import {
  selectCanCheckIn,
  selectIsAdmin,
  selectIsGateUser,
  selectUser,
} from '../store/authSlice';
import { useSettings, useSheets } from '../store/hooks';
import { CrossIcon } from '../components/Glyphs';

function Detail({ label, value, mono }) {
  const { c } = useTheme();
  return (
    <View style={styles.detail}>
      <Text
        style={[typo.eyebrow, { color: c.muted, fontSize: moderateScale(11) }]}
      >
        {label}
      </Text>
      <Text
        style={[
          mono ? typo.mono : typo.body,
          { color: value ? c.ink : c.muted },
        ]}
      >
        {value || '—'}
      </Text>
    </View>
  );
}

function TimelineItem({ dot, children }) {
  const { c } = useTheme();
  const dotStyle =
    dot === 'in'
      ? { backgroundColor: c.ok, borderColor: c.ok }
      : dot === 'out'
      ? { backgroundColor: c.ink, borderColor: c.ink }
      : dot === 'bad'
      ? { backgroundColor: c.bad, borderColor: c.bad }
      : {
          backgroundColor: 'transparent',
          borderColor: c.muted,
          borderStyle: 'dashed',
        };
  return (
    <View style={styles.tlItem}>
      <View style={[styles.tlDot, dotStyle]} />
      <Text style={[typo.body, { color: c.ink, flex: 1 }]}>{children}</Text>
    </View>
  );
}

/** Timeline rows between "In" and "Out": the host's answer, then when security let the visitor in. */
function HostSteps({ visit: v, now }) {
  const open = !v.outAt;
  let answer;
  if (v.hostStatus === 'waiting') {
    answer = (
      <TimelineItem dot="still">
        <Text style={{ fontFamily: fonts.bodySemi }}>Waiting for {v.host}</Text>{' '}
        · asked {fmtDuration(v.inAt, null, now)} ago
        {v.escalatedAt
          ? ` · no reply, security alerted at ${fmtTime(v.escalatedAt)}`
          : ''}
      </TimelineItem>
    );
  } else if (v.hostStatus === 'manual') {
    answer = (
      <TimelineItem dot="still">
        <Text style={{ fontFamily: fonts.bodySemi }}>
          Confirm with {v.host} by phone
        </Text>{' '}
        · not on Gatebook
      </TimelineItem>
    );
  } else {
    const accepted = v.hostStatus === 'accepted';
    const by =
      v.hostVia === 'phone'
        ? `confirmed by phone${v.hostBy ? ` by ${v.hostBy.name}` : ''}`
        : `by ${v.host} in ${fmtDuration(v.inAt, v.hostAt)}`;
    answer = (
      <TimelineItem dot={accepted ? 'in' : 'bad'}>
        <Text style={{ fontFamily: fonts.bodySemi }}>
          {accepted ? 'Accepted ' : 'Declined '}
        </Text>
        <Text style={{ fontFamily: fonts.mono }}>{fmtTime(v.hostAt)}</Text> ·{' '}
        {by}
        {v.hostNote ? ` · “${v.hostNote}”` : ''}
      </TimelineItem>
    );
  }
  let allowed = null;
  if (v.allowedAt) {
    allowed = (
      <TimelineItem dot="in">
        <Text style={{ fontFamily: fonts.bodySemi }}>Let in </Text>
        <Text style={{ fontFamily: fonts.mono }}>{fmtTime(v.allowedAt)}</Text>
        {v.allowedBy ? ` · by ${v.allowedBy.name}` : ''}
      </TimelineItem>
    );
  } else if (open && v.hostStatus !== 'declined') {
    allowed = (
      <TimelineItem dot="still">
        <Text style={{ fontFamily: fonts.bodySemi }}>Not let in yet</Text>
      </TimelineItem>
    );
  }
  return (
    <>
      {answer}
      {allowed}
    </>
  );
}

export function VisitDetailsScreen({ navigation, route }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const canCheckIn = useSelector(selectCanCheckIn);
  const isAdmin = useSelector(selectIsAdmin);
  const gate = useSelector(selectIsGateUser);
  const me = useSelector(selectUser);
  const settings = useSettings();
  const { openExit } = useSheets();
  const now = useNow(30000);
  const id = route.params.id;
  // Gate users read the register; a host reads their own visitor (the register is 403 for them).
  const gateQuery = useGetVisitQuery(id, { skip: !gate });
  const mineQuery = useGetMyVisitQuery(id, { skip: gate });
  const {
    data: visit = null,
    error: loadError,
    refetch: load,
  } = gate ? gateQuery : mineQuery;
  const error = loadError ? errorMessage(loadError) : null;

  const close = () =>
    navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Main');

  const header = (
    <View
      style={[
        styles.top,
        {
          paddingTop: insets.top + verticalScale(8),
          backgroundColor: c.surface,
          borderBottomColor: c.line,
        },
      ]}
    >
      <View style={{ flex: 1, gap: moderateScale(4) }}>
        {visit ? (
          <View style={styles.row}>
            <PassBadge badge={visit.badge} large />
            <Text style={[typo.monoSmall, { color: c.muted }]}>
              Entry {visit.pass}
            </Text>
          </View>
        ) : null}
        <Text
          accessibilityRole="header"
          numberOfLines={2}
          style={[typo.h1, { color: c.ink }]}
        >
          {visit ? visit.name : 'Visitor'}
        </Text>
        {visit ? (
          <View style={styles.row}>
            <StatusChip
              state={visitState(visit, now, settings.overstayHours)}
            />
            <HostStageChip stage={hostStage(visit)} />
          </View>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={close}
        hitSlop={8}
        style={[styles.close, { borderColor: c.line }]}
      >
        <CrossIcon color={c.ink} size={16} />
      </Pressable>
    </View>
  );

  // Full-screen photo viewer: index into `photos`, or null when closed.
  const [preview, setPreview] = useState(null);

  if (!visit) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        {header}
        <View style={{ padding: moderateScale(16) }}>
          {error ? (
            <ListError message={error} onRetry={load} />
          ) : (
            <ActivityIndicator color={c.muted} size="large" />
          )}
        </View>
      </View>
    );
  }

  const inside = !visit.outAt;
  // The visited host looking at their own visitor who is still waiting for their answer.
  const myWaiting =
    inside && visit.hostStatus === 'waiting' && !!me && visit.hostId === me.id;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {header}
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + verticalScale(24) },
        ]}
      >
        <View style={styles.photos}>
          <View style={{ flex: 1, gap: moderateScale(4) }}>
            <Text
              style={[
                typo.eyebrow,
                { color: c.muted, fontSize: moderateScale(11) },
              ]}
            >
              Photo
            </Text>
            <Pressable
              disabled={!visit.photoUrl}
              onPress={() => setPreview(0)}
              accessibilityRole="imagebutton"
              accessibilityLabel={`Photo of ${visit.name}`}
              accessibilityHint="Opens the full photo"
              style={({ pressed }) => pressed && { opacity: 0.85 }}
            >
              <Thumb
                url={visit.photoUrl}
                name={visit.name}
                fill
                style={{ aspectRatio: 3 / 4 }}
              />
              {visit.photoUrl ? <ZoomBadge /> : null}
            </Pressable>
          </View>
          <View style={{ flex: 1, gap: moderateScale(4) }}>
            <Text
              style={[
                typo.eyebrow,
                { color: c.muted, fontSize: moderateScale(11) },
              ]}
            >
              ID proof
            </Text>
            {visit.idPhotoUrl ? (
              <Pressable
                onPress={() => setPreview(visit.photoUrl ? 1 : 0)}
                accessibilityRole="imagebutton"
                accessibilityLabel="ID proof"
                accessibilityHint="Opens the full photo"
                style={({ pressed }) => pressed && { opacity: 0.85 }}
              >
                <Thumb
                  url={visit.idPhotoUrl}
                  name="ID"
                  fill
                  style={{ aspectRatio: 16 / 10 }}
                />
                <ZoomBadge />
              </Pressable>
            ) : (
              <View
                style={[
                  styles.noId,
                  { backgroundColor: c.sunk, borderColor: c.line },
                ]}
              >
                <Text style={[typo.small, { color: c.muted }]}>
                  No ID photo
                </Text>
              </View>
            )}
          </View>
        </View>

        <View
          style={[
            styles.card,
            { backgroundColor: c.surface, borderColor: c.line },
          ]}
        >
          <TimelineItem dot="in">
            <Text style={{ fontFamily: fonts.bodySemi }}>In </Text>
            <Text style={{ fontFamily: fonts.mono }}>
              {fmtDateTime(visit.inAt)}
            </Text>
            {visit.guardIn ? ` · logged by ${visit.guardIn.name}` : ''}
          </TimelineItem>
          {isLegacyVisit(visit) ? null : <HostSteps visit={visit} now={now} />}
          {visit.outAt ? (
            <TimelineItem dot="out">
              <Text style={{ fontFamily: fonts.bodySemi }}>Out </Text>
              <Text style={{ fontFamily: fonts.mono }}>
                {fmtDateTime(visit.outAt)}
              </Text>{' '}
              · Stayed {fmtDuration(visit.inAt, visit.outAt)}
              {visit.guardOut ? ` · logged by ${visit.guardOut.name}` : ''}
              {visit.badge ? (
                visit.passReturned === false ? (
                  <Text style={{ color: c.bad, fontFamily: fonts.bodySemi }}>
                    {' '}
                    · pass not returned
                  </Text>
                ) : (
                  ' · pass returned'
                )
              ) : null}
              {visit.exitNote ? ` · ${visit.exitNote}` : ''}
            </TimelineItem>
          ) : (
            <TimelineItem dot="still">
              <Text style={{ fontFamily: fonts.bodySemi }}>Still inside </Text>
              <Text style={{ fontFamily: fonts.mono }}>
                {fmtDuration(visit.inAt, null, now)}
              </Text>
            </TimelineItem>
          )}
        </View>

        <VisitMaterial visit={visit} />

        {visit.termsAt ? (
          <View
            style={[
              styles.card,
              { backgroundColor: c.surface, borderColor: c.line, gap: 6 },
            ]}
          >
            <Text style={[typo.bodySemi, { color: c.ink }]}>
              Terms & confidentiality agreement
            </Text>
            <Text style={[typo.small, { color: c.muted }]}>
              Accepted with photo at {fmtDateTime(visit.termsAt)} · terms
              version {visit.termsVersion}
            </Text>
            {gate ? (
              <AgreementButton
                visit={visit}
                style={{ alignSelf: 'flex-start' }}
              />
            ) : null}
          </View>
        ) : null}

        <View
          style={[
            styles.card,
            styles.grid,
            { backgroundColor: c.surface, borderColor: c.line },
          ]}
        >
          <Detail label="Mobile" value={visit.phone} mono />
          <Detail label="Coming from" value={visit.company} />
          <Detail label="Purpose" value={visit.purpose} />
          <Detail label="Persons" value={String(visit.persons)} mono />
          <Detail
            label="Whom to meet"
            value={[visit.host, visit.hostLocation].filter(Boolean).join(' · ')}
          />
          <Detail label="Department" value={visit.dept} />
          {gate && visit.hostPhone ? (
            <Detail label="Host's mobile" value={visit.hostPhone} mono />
          ) : null}
          <Detail
            label="ID shown"
            value={
              visit.idType === 'None'
                ? 'None'
                : `${visit.idType}${
                    visit.idLast4 ? ` ·· ${visit.idLast4}` : ''
                  }`
            }
          />
          <Detail label="Vehicle" value={visit.vehicle} mono />
          <Detail label="Items carried" value={visit.items} />
          <Detail label="Remarks" value={visit.notes} />
          {visit.hostNote ? (
            <Detail label="Host's message" value={`“${visit.hostNote}”`} />
          ) : null}
        </View>

        {myWaiting ? <HostRespond visit={visit} /> : null}
        {inside && canCheckIn ? (
          <View style={styles.hostActions}>
            <HostActions visit={visit} size="lg" style={{ flexGrow: 1 }} />
          </View>
        ) : null}
        {inside && canCheckIn ? (
          <Button
            title="Mark exit"
            variant="exit"
            size="lg"
            onPress={() => openExit(visit)}
          />
        ) : null}
        {!inside && isAdmin ? (
          <Button
            title="Correct exit time"
            variant="ghost"
            size="lg"
            onPress={() => openExit(visit)}
          />
        ) : null}
      </ScrollView>
      <ImagePreview
        visible={preview !== null}
        index={preview ?? 0}
        onClose={() => setPreview(null)}
        images={[
          { url: visit.photoUrl, label: `Visitor · ${visit.name}` },
          {
            url: visit.idPhotoUrl,
            label: `ID proof · ${visit.idType || 'ID'}`,
          },
        ]}
      />
    </View>
  );
}

const styles = ScaledSheet.create({
  top: {
    flexDirection: 'row',
    gap: '12@ms',
    paddingHorizontal: '16@s',
    paddingBottom: '14@vs',
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: 'flex-start',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: '8@ms',
    flexWrap: 'wrap',
  },
  hostActions: { flexDirection: 'row', flexWrap: 'wrap', gap: '10@ms' },
  close: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: radius.control,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { padding: '16@ms', gap: '14@ms' },
  photos: { flexDirection: 'row', gap: '12@ms', alignItems: 'flex-start' },
  noId: {
    aspectRatio: 16 / 10,
    borderRadius: radius.control,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    borderWidth: 1,
    borderRadius: radius.panel,
    padding: '16@ms',
    gap: '14@ms',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: '12@s',
    rowGap: '14@vs',
  },
  detail: { flexBasis: '46%', flexGrow: 1, gap: '2@ms' },
  tlItem: { flexDirection: 'row', gap: '12@ms', alignItems: 'flex-start' },
  tlDot: {
    width: '12@ms',
    height: '12@ms',
    borderRadius: '6@ms',
    borderWidth: 2,
    marginTop: '5@vs',
  },
});
