import React, { useState } from 'react';
import { Linking, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { ScaledSheet, moderateScale } from 'react-native-size-matters/extend';
import { Button } from '../components/Button';
import { FilterTabs } from '../components/FilterBar';
import { EmptyState } from '../components/Layout';
import { ListError, ListLoading } from '../components/ListFooter';
import { useNow } from '../state/useNow';
import {
  api,
  errorMessage,
  useAllowVisitMutation,
  useTrackQuery,
} from '../store/api';
import { selectIsGateUser } from '../store/authSlice';
import { useSheets, useToast } from '../store/hooks';
import { selectSite } from '../store/siteSlice';
import { radius, typo, useTheme } from '../theme';
import { hhmm } from '../utils/ops';

const QUIET_MS = 5 * 60000;

/** Card colours per tone. */
function toneColors(tone, c) {
  if (tone === 'alarm') return { bg: c.bad, fg: '#FFFFFF', border: c.bad };
  if (tone === 'go') return { bg: c.okSoft, fg: c.ink, border: c.ok };
  if (tone === 'bad') return { bg: c.badSoft, fg: c.ink, border: c.bad };
  return { bg: c.warnSoft, fg: c.ink, border: c.warn };
}

/** The buttons for one item: [label, onPress, variant]. */
function useActions(navigation, quiet, isQuiet) {
  const dispatch = useDispatch();
  const toast = useToast();
  const { openExit } = useSheets();
  const [allow] = useAllowVisitMutation();
  const exitVisit = async id => {
    try {
      const v = await dispatch(api.endpoints.getVisit.initiate(id)).unwrap();
      openExit(v);
    } catch (err) {
      toast.show(errorMessage(err), 'error');
    }
  };
  const letIn = async (x, viaPhone) => {
    try {
      const v = await allow({ id: x.visitId, viaPhone }).unwrap();
      toast.show(`${v?.name ?? x.name} allowed in`);
    } catch (err) {
      toast.show(errorMessage(err), 'error');
    }
  };
  const call = phone => phone && Linking.openURL(`tel:${phone}`);
  return i => {
    const x = i.extra ?? {};
    switch (i.kind) {
      case 'visit_go':
        return [['Allowed in', () => letIn(x, false), 'ok']];
      case 'visit_declined':
        return [['Mark exit', () => exitVisit(x.visitId), 'exit']];
      case 'visit_noreply':
        return [
          ...(x.hostPhone
            ? [['Call host', () => call(x.hostPhone), 'ghost']]
            : []),
          ['Confirmed by phone', () => letIn(x, true), 'ok'],
          ['Exit', () => exitVisit(x.visitId), 'ghost'],
        ];
      case 'visit_manual':
        return [
          ['Confirmed, allow in', () => letIn(x, true), 'ok'],
          ['Exit', () => exitVisit(x.visitId), 'ghost'],
        ];
      case 'mail_disputed':
        return [
          [
            'View',
            () => navigation.navigate('MailDetails', { id: i.ref.id }),
            'primary',
          ],
        ];
      case 'material_disputed':
      case 'material_overdue':
        return [
          [
            'View',
            () => navigation.navigate('MaterialDetails', { id: i.ref.id }),
            'primary',
          ],
        ];
      case 'key_overdue':
        return [
          ...(x.phone ? [['Call', () => call(x.phone), 'ghost']] : []),
          ['Key board', () => navigation.navigate('Keys'), 'primary'],
        ];
      case 'patrol_late':
        return [
          [
            isQuiet(i.id) ? 'Silenced' : 'Silence 5 min',
            () => quiet(i.id),
            'ghost',
          ],
          ['Scan now', () => navigation.navigate('PatrolScan'), 'primary'],
        ];
      case 'patrol_due':
        return [['Scan', () => navigation.navigate('PatrolScan'), 'primary']];
      case 'incident_critical':
        return [
          [
            'View',
            () => navigation.navigate('IncidentDetails', { id: i.ref.id }),
            'primary',
          ],
        ];
      case 'gen_low':
      case 'gen_check':
        return [
          [
            i.kind === 'gen_low' ? 'Log fill' : 'Check now',
            () => navigation.navigate('Generator'),
            'primary',
          ],
        ];
      default:
        return [];
    }
  };
}

function ItemCard({ item: i, actions }) {
  const { c } = useTheme();
  const t = toneColors(i.tone, c);
  return (
    <View
      style={[styles.card, { backgroundColor: t.bg, borderColor: t.border }]}
      accessibilityLabel={`${i.title}. ${i.body}`}
    >
      <Text style={[typo.bodySemi, { color: t.fg }]}>{i.title}</Text>
      <Text style={[typo.small, { color: t.fg, opacity: 0.9 }]}>{i.body}</Text>
      <View style={styles.acts}>
        {actions.map(([label, onPress, variant]) => (
          <Button
            key={label}
            title={label}
            size="sm"
            variant={variant}
            onPress={onPress}
          />
        ))}
      </View>
    </View>
  );
}

/** TRACK (gate users): everything at this gate that needs someone to act now. */
export function TrackScreen({ navigation }) {
  const { c } = useTheme();
  const gate = useSelector(selectIsGateUser);
  const site = useSelector(selectSite);
  useNow(30000);
  const { data, error, isLoading, isFetching, refetch } = useTrackQuery(
    undefined,
    { skip: !gate, pollingInterval: 30000 },
  );
  const [cat, setCat] = useState('all');
  const [quietUntil, setQuietUntil] = useState({});
  const isQuiet = id => (quietUntil[id] ?? 0) > Date.now();
  const quiet = id =>
    setQuietUntil(q => ({ ...q, [id]: Date.now() + QUIET_MS }));
  const actionsFor = useActions(navigation, quiet, isQuiet);

  const items = data?.items ?? [];
  const byCat = data?.counts?.byCat ?? {};
  const cats = (data?.cats ?? []).filter(k => byCat[k.key]);
  const shown = cat !== 'all' && byCat[cat] ? cat : 'all';
  const n = items.length;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={isFetching && !isLoading}
          onRefresh={refetch}
          tintColor={c.muted}
          colors={[c.accent]}
        />
      }
    >
      <Text style={[typo.eyebrow, { color: c.muted }]}>
        {site ? `${site} · ` : ''}live
      </Text>
      <Text
        accessibilityRole="header"
        style={[typo.h2, { color: n ? c.bad : c.ok }]}
      >
        {n ? `${n} item${n === 1 ? ' needs' : 's need'} action` : 'All clear'}
      </Text>
      {error ? (
        <ListError message={errorMessage(error)} onRetry={refetch} />
      ) : null}
      {isLoading ? <ListLoading /> : null}
      {cats.length > 1 ? (
        <FilterTabs
          accessibilityLabel="TRACK categories"
          options={[
            { value: 'all', label: 'All' },
            ...cats.map(k => ({
              value: k.key,
              label: k.label,
              count: byCat[k.key],
            })),
          ]}
          value={shown}
          onChange={setCat}
        />
      ) : null}
      {data && !n ? (
        <EmptyState
          title="All clear"
          body="Nothing needs action right now. Visitors to send in, unanswered hosts, overdue keys and material, late patrols, critical incidents and diesel alerts all appear here."
        />
      ) : null}
      {cats
        .filter(k => shown === 'all' || k.key === shown)
        .map(k => (
          <View key={k.key} style={{ gap: moderateScale(10) }}>
            {shown === 'all' ? (
              <Text style={[typo.h3, { color: c.ink }]}>
                {k.label} · {byCat[k.key]}
              </Text>
            ) : null}
            {items
              .filter(i => i.cat === k.key)
              .map(i => (
                <ItemCard key={i.id} item={i} actions={actionsFor(i)} />
              ))}
          </View>
        ))}
      {data?.materialInProgress ? (
        <Button
          title={`Material in progress · ${data.materialInProgress}`}
          variant="ghost"
          onPress={() => navigation.navigate('Material')}
        />
      ) : null}
      {data?.expectedSoon?.length ? (
        <View style={{ gap: moderateScale(8) }}>
          <Text style={[typo.h3, { color: c.ink }]}>
            Expected in the next 2 hours · {data.expectedSoon.length}
          </Text>
          {data.expectedSoon.map(e => (
            <View
              key={e.id}
              style={[
                styles.card,
                { backgroundColor: c.surface, borderColor: c.line },
              ]}
            >
              <Text style={[typo.bodySemi, { color: c.ink }]}>
                {hhmm(e.at)} · {e.title}
              </Text>
              <Text style={[typo.small, { color: c.muted }]}>{e.body}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = ScaledSheet.create({
  content: { padding: '16@ms', gap: '14@ms', paddingBottom: '48@vs' },
  card: {
    borderWidth: 1.5,
    borderRadius: radius.panel,
    padding: '12@ms',
    gap: '6@ms',
  },
  acts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: '8@ms',
    marginTop: '4@vs',
  },
});
