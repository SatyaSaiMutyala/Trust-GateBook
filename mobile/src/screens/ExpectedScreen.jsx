import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
} from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import {
  ScaledSheet,
  moderateScale,
  verticalScale,
} from 'react-native-size-matters/extend';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FilterBar, FilterTabs, SearchBar } from '../components/FilterBar';
import { HostStageChip } from '../components/HostStageChip';
import { Banner, EmptyState } from '../components/Layout';
import { ListError, ListFooter, ListLoading } from '../components/ListFooter';
import { HeaderButton } from '../components/TopBar';
import { useNow } from '../state/useNow';
import { fonts, radius, typo, useTheme } from '../theme';
import {
  errorMessage,
  useCancelExpectedMutation,
  useListExpectedInfiniteQuery,
  useReceivedExpectedMutation,
} from '../store/api';
import {
  selectCanCheckIn,
  selectHasModule,
  selectIsGateUser,
  selectUser,
} from '../store/authSlice';
import { checkInCleared, checkInPatched } from '../store/draftsSlice';
import { useSettings, useToast } from '../store/hooks';
import { useInfiniteList } from '../store/useInfiniteList';
import {
  boxesLine,
  checkInPatchFrom,
  expectedStateChip,
  expectedTitle,
  expectedWhen,
  mayManageExpected,
  mayPreRegister,
} from '../utils/expected';
import { fmtTime } from '../utils/format';

const GATE_TABS = [
  { value: 'today', label: 'Today' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'earlier', label: 'Earlier' },
];
const OTHER_TABS = GATE_TABS.slice(1);

/** One expected visitor / delivery with what the viewer can do with it. */
function ExpectedCard({
  e,
  user,
  canOperate,
  onCheckIn,
  onReceive,
  onEdit,
  onCancel,
  busy,
}) {
  const { c } = useTheme();
  const delivery = e.kind === 'delivery';
  const open = e.status === 'expected';
  const chip = expectedStateChip(e);
  const people = [e.host.name, ...e.also.map(a => a.name)].join(', ');
  const visitorLine = [
    e.company,
    e.purpose,
    e.persons > 1 ? `${e.persons} persons` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const manage = mayManageExpected(e, user);
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: c.surface,
          borderColor: c.line,
          borderLeftColor: delivery ? c.ok : c.accent,
          opacity: open ? 1 : 0.8,
        },
      ]}
    >
      <Text style={[typo.monoSmall, { color: c.muted }]}>
        {expectedWhen(e)}
      </Text>
      <Text style={[typo.h3, { color: c.ink }]} numberOfLines={2}>
        {delivery ? '📦 ' : ''}
        {expectedTitle(e)}
      </Text>
      <View style={styles.chips}>
        <HostStageChip stage={chip} />
        {!delivery && e.preapproved && open ? (
          <HostStageChip stage={{ label: 'Pre-approved', tone: 'go' }} />
        ) : null}
      </View>
      {delivery ? (
        <Text style={[typo.small, { color: c.muted }]}>
          {boxesLine(e)}
          {e.name ? ` · carried by ${e.name}` : ''}
        </Text>
      ) : visitorLine ? (
        <Text style={[typo.small, { color: c.muted }]}>{visitorLine}</Text>
      ) : null}
      <Text style={[typo.small, { color: c.ink }]}>
        {delivery
          ? 'To be received by '
          : e.contact
          ? `Received by ${e.contact.name} · for `
          : 'To meet '}
        <Text style={{ fontFamily: fonts.bodySemi }}>{people}</Text>
        {e.createdBy.id !== e.host.id ? (
          <Text style={{ color: c.muted }}>
            {' '}
            · registered by {e.createdBy.name}
          </Text>
        ) : null}
      </Text>
      {!delivery && boxesLine(e) ? (
        <Text style={[typo.small, { color: c.ink }]}>
          Bringing {boxesLine(e)}
        </Text>
      ) : null}
      {e.items || e.vehicle ? (
        <Text style={[typo.small, { color: c.muted }]}>
          {[
            e.items ? `Bringing: ${e.items}` : '',
            e.vehicle ? `Vehicle ${e.vehicle}` : '',
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      ) : null}
      {e.notes ? (
        <Text style={[typo.small, { color: c.ink, fontStyle: 'italic' }]}>
          “{e.notes}”
        </Text>
      ) : null}
      <Text style={[typo.monoSmall, { color: c.muted }]}>
        {e.phone ? `${e.phone} · ` : ''}
        {e.code}
        {e.arrivedAt
          ? ` · ${delivery ? 'received' : 'arrived'} ${fmtTime(e.arrivedAt)}${
              e.arrivedBy ? ` by ${e.arrivedBy.name}` : ''
            }`
          : ''}
        {e.cancelledBy ? ` · cancelled by ${e.cancelledBy.name}` : ''}
      </Text>
      {(open && canOperate) || manage ? (
        <View style={styles.actions}>
          {open && canOperate && !delivery ? (
            <Button
              title="Check in"
              variant="ok"
              size="sm"
              onPress={() => onCheckIn(e)}
            />
          ) : null}
          {open && canOperate && delivery ? (
            <Button
              title="Received"
              variant="ok"
              size="sm"
              loading={busy}
              onPress={() => onReceive(e)}
            />
          ) : null}
          {manage ? (
            <>
              <Button
                title="Edit"
                variant="ghost"
                size="sm"
                onPress={() => onEdit(e)}
              />
              <Button
                title="Cancel"
                variant="danger"
                size="sm"
                onPress={() => onCancel(e)}
              />
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Expected visitors and deliveries. Gate users: Today · Upcoming · Earlier (everything at the gate); employees:
 * Upcoming · Earlier (what they registered, host, receive or are told about). `route.params.q` (from a
 * notification) searches every tab. Socket `expected:changed` refreshes the list (tag Expected).
 */
export function ExpectedScreen({ navigation, route }) {
  const { c } = useTheme();
  const dispatch = useDispatch();
  const toast = useToast();
  const settings = useSettings();
  const user = useSelector(selectUser);
  const gate = useSelector(selectIsGateUser);
  const material = useSelector(selectHasModule('material'));
  const canOperate = useSelector(selectCanCheckIn);
  useNow(60000); // re-render so "Late" / "Today" stay right; the server's state refreshes with the list
  const tabs = gate ? GATE_TABS : OTHER_TABS;
  const [tab, setTab] = useState(tabs[0].value);
  const [q, setQ] = useState(route?.params?.q ?? '');
  useEffect(() => {
    if (route?.params?.q) setQ(route.params.q);
  }, [route?.params?.q]);
  const searching = !!q.trim();
  const list = useInfiniteList(useListExpectedInfiniteQuery, {
    when: searching ? 'all' : tab,
    q,
  });

  const [received, { isLoading: receiving }] = useReceivedExpectedMutation();
  const [cancelExpected, { isLoading: cancelling }] =
    useCancelExpectedMutation();
  const [receivingId, setReceivingId] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const canAdd = mayPreRegister(user);
  useLayoutEffect(() => {
    navigation.setOptions({
      headerActions: canAdd ? (
        <HeaderButton
          title="+ Expect"
          primary
          onPress={() =>
            navigation.navigate('ExpectedForm', { kind: 'visitor' })
          }
          accessibilityLabel="Expect a visitor or delivery"
        />
      ) : null,
    });
  }, [navigation, canAdd]);

  const checkIn = useCallback(
    e => {
      dispatch(checkInCleared());
      dispatch(checkInPatched(checkInPatchFrom(e, settings.purposes)));
      navigation.navigate('Main', { screen: 'CheckIn' });
      toast.show(
        `${e.name}'s details are filled in. Take the photo and give the pass.`,
      );
    },
    [dispatch, navigation, settings.purposes, toast],
  );
  const receive = async e => {
    // With Material gate passes, security counts the boxes on a Material IN pass made from the entry.
    if (material) {
      navigation.navigate('MaterialForm', { direction: 'in', expected: e });
      return;
    }
    setReceivingId(e.code);
    try {
      const s = await received(e.code).unwrap();
      toast.show(
        `${s.company} received${s.boxes ? ` · ${boxesLine(s)}` : ''}. ${
          s.host.name
        } has been told.`,
      );
    } catch (err) {
      toast.show(errorMessage(err), 'error');
    } finally {
      setReceivingId(null);
    }
  };
  const doCancel = async () => {
    const e = confirm;
    try {
      await cancelExpected(e.code).unwrap();
      setConfirm(null);
      toast.show('Cancelled. Security has been told.');
    } catch (err) {
      setConfirm(null);
      toast.show(errorMessage(err), 'error');
    }
  };

  const renderItem = ({ item }) => (
    <ExpectedCard
      e={item}
      user={user}
      canOperate={canOperate}
      busy={receiving && receivingId === item.code}
      onCheckIn={checkIn}
      onReceive={receive}
      onEdit={e => navigation.navigate('ExpectedForm', { code: e.code })}
      onCancel={setConfirm}
    />
  );

  const header = (
    <View style={{ gap: moderateScale(10), marginBottom: verticalScale(10) }}>
      {!canAdd && user?.role !== 'viewer' ? (
        <Banner tone="accent">
          <Text style={[typo.small, { color: c.ink }]}>
            You have not been given the right to pre-register visitors. An admin
            can switch it on in Users.
          </Text>
        </Banner>
      ) : null}
      {list.error ? (
        <ListError message={list.error} onRetry={list.retry} />
      ) : null}
    </View>
  );

  let empty = null;
  if (list.loading) empty = <ListLoading />;
  else if (!list.error) {
    empty = searching ? (
      <EmptyState
        title="No match"
        body="Try a different name, number or code."
      />
    ) : (
      <EmptyState
        title={tab === 'earlier' ? 'Nothing earlier' : 'No one expected'}
        body={
          gate
            ? 'Employees pre-register visitors and deliveries from their phone or computer.'
            : 'Register a visitor or a delivery before it comes. Security is told and fills in the check-in from your entry.'
        }
        action={
          canAdd
            ? {
                title: 'Expect a visitor',
                onPress: () =>
                  navigation.navigate('ExpectedForm', { kind: 'visitor' }),
              }
            : undefined
        }
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <FilterBar>
        <SearchBar
          value={q}
          onChangeText={setQ}
          placeholder="Name, mobile, company, code…"
          label="Search expected visitors"
        />
        {searching ? null : (
          <FilterTabs
            accessibilityLabel="Expected lists"
            options={tabs}
            value={tab}
            onChange={setTab}
          />
        )}
      </FilterBar>
      <FlatList
        style={{ flex: 1, backgroundColor: c.bg }}
        contentContainerStyle={styles.content}
        data={list.items}
        keyExtractor={e => e.code}
        renderItem={renderItem}
        extraData={receivingId}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={<ListFooter list={list} />}
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.4}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl
            refreshing={list.refreshing}
            onRefresh={list.refresh}
            tintColor={c.muted}
            colors={[c.accent]}
          />
        }
      />
      <ConfirmDialog
        visible={!!confirm}
        tone="danger"
        title="Cancel this pre-registration?"
        message={
          confirm
            ? `${expectedTitle(
                confirm,
              )} · security and the people concerned are told.`
            : ''
        }
        confirmLabel="Cancel it"
        cancelLabel="Keep"
        loading={cancelling}
        onCancel={() => setConfirm(null)}
        onConfirm={doCancel}
      />
    </View>
  );
}

function Separator() {
  return <View style={{ height: verticalScale(10) }} />;
}

const styles = ScaledSheet.create({
  content: { padding: '16@ms', flexGrow: 1 },
  card: {
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: radius.panel,
    padding: '14@ms',
    gap: '5@ms',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: '6@ms' },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: '8@ms',
    marginTop: '6@vs',
  },
});
