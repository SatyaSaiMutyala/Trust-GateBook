import React, { useEffect, useMemo } from 'react';
import { Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { moderateScale } from 'react-native-size-matters/extend';
import { useListMaterialInfiniteQuery } from '../../store/api';
import {
  selectCanCheckIn,
  selectHasModule,
  selectUser,
} from '../../store/authSlice';
import { useInfiniteList } from '../../store/useInfiniteList';
import { typo, useTheme } from '../../theme';
import { Banner } from '../Layout';
import { Button } from '../Button';
import { Field } from '../Field';
import { MaterialCard } from './MaterialCard';

/** "Material IN / OUT with this visitor" (security; the visited employee can send OUT). */
export function VisitMaterialButtons({ visit, onNavigate }) {
  const navigation = useNavigation();
  const nav = onNavigate ?? navigation.navigate;
  const user = useSelector(selectUser);
  const gate = useSelector(selectCanCheckIn);
  const material = useSelector(selectHasModule('material'));
  if (!material || visit.outAt) return null;
  const host = visit.hostId === user?.id;
  if (!gate && !host) return null;
  return (
    <View
      style={{ flexDirection: 'row', gap: moderateScale(10), flexWrap: 'wrap' }}
    >
      {gate ? (
        <Button
          title="↓ Material IN"
          variant="ghost"
          size="sm"
          onPress={() =>
            nav('MaterialForm', { direction: 'in', visitId: visit.id })
          }
        />
      ) : null}
      <Button
        title={gate ? '↑ Material OUT' : '↑ Material OUT with this visitor'}
        variant="ghost"
        size="sm"
        onPress={() =>
          nav('MaterialForm', { direction: 'out', visitId: visit.id })
        }
      />
    </View>
  );
}

/** Visit details → "Material": the visit's gate passes and the buttons to add one. */
export function VisitMaterial({ visit, onNavigate }) {
  const { c } = useTheme();
  const navigation = useNavigation();
  const nav = onNavigate ?? navigation.navigate;
  const material = useSelector(selectHasModule('material'));
  const list = useInfiniteList(
    useListMaterialInfiniteQuery,
    useMemo(
      () => ({ visitId: visit.id, tab: 'all', days: 120, limit: 20 }),
      [visit.id],
    ),
    { skip: !material },
  );
  if (!material) return null;
  return (
    <View style={{ gap: moderateScale(8) }}>
      <Text style={[typo.h3, { color: c.ink }]}>Material</Text>
      <VisitMaterialButtons visit={visit} onNavigate={onNavigate} />
      {list.items.length ? (
        list.items.map(p => (
          <MaterialCard
            key={p.id}
            pass={p}
            onPress={x => nav('MaterialDetails', { id: x.id })}
          />
        ))
      ) : (
        <Text style={[typo.small, { color: c.muted }]}>
          {list.loading ? 'Loading…' : 'No material recorded for this visitor.'}
        </Text>
      )}
    </View>
  );
}

/**
 * Exit sheet: OUT passes ready with this visitor need a box count (released after the exit); OUT passes still
 * waiting for approval and returnable IN material are flagged. `counts`: `{ [passId]: string }`.
 */
export function ExitMaterial({ visit, counts, setCounts, onPasses }) {
  const { c } = useTheme();
  const gate = useSelector(selectCanCheckIn);
  const material = useSelector(selectHasModule('material'));
  const list = useInfiniteList(
    useListMaterialInfiniteQuery,
    useMemo(
      () => ({ visitId: visit.id, tab: 'all', days: 120, limit: 50 }),
      [visit.id],
    ),
    { skip: !material || !gate },
  );
  const ready = list.items.filter(
    p => p.direction === 'out' && p.status === 'ready',
  );
  const waiting = list.items.filter(
    p => p.direction === 'out' && p.status === 'awaiting_approval',
  );
  const returnableIn = list.items.filter(
    p =>
      p.direction === 'in' &&
      ['pending_return', 'partly_returned'].includes(p.status),
  );
  const key = ready.map(p => p.id).join(',');
  useEffect(() => onPasses?.(ready), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!material || !gate) return null;
  return (
    <View style={{ gap: moderateScale(10) }}>
      {ready.length ? (
        <View style={{ gap: moderateScale(8) }}>
          <Text style={[typo.bodySemi, { color: c.ink }]}>
            Boxes going out with {visit.name}
          </Text>
          {ready.map(p => {
            const v = counts[p.id] ?? '';
            return (
              <View
                key={p.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: moderateScale(10),
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[typo.bodySemi, { color: c.ink }]}>
                    {p.boxes} box{p.boxes === 1 ? '' : 'es'} · {p.id}
                  </Text>
                  <Text style={[typo.small, { color: c.muted }]}>
                    from {p.authorisedBy?.name ?? 'security'}
                  </Text>
                </View>
                <Field
                  label="Counted"
                  value={v}
                  keyboardType="number-pad"
                  mono
                  error={!!v && Number(v) !== p.boxes}
                  style={{ width: moderateScale(96) }}
                  onChangeText={t =>
                    setCounts(x => ({
                      ...x,
                      [p.id]: t.replace(/\D/g, '').slice(0, 4),
                    }))
                  }
                />
              </View>
            );
          })}
          <Text style={[typo.small, { color: c.muted }]}>
            The visitor can leave only when each count matches the pass.
          </Text>
        </View>
      ) : null}
      {waiting.map(p => (
        <Banner key={p.id} tone="bad">
          <Text style={[typo.body, { color: c.bad }]}>
            Not approved yet: {p.boxes} box{p.boxes === 1 ? '' : 'es'} ({p.id}).
            Do not let the boxes go.
          </Text>
        </Banner>
      ))}
      {returnableIn.length ? (
        <Banner tone="warn">
          <Text style={[typo.body, { color: c.ink }]}>
            Returnable material brought in:{' '}
            {returnableIn
              .map(p => `${p.boxes} box${p.boxes === 1 ? '' : 'es'} (${p.id})`)
              .join(', ')}
            . Check whether it is being taken back out.
          </Text>
        </Banner>
      ) : null}
    </View>
  );
}
