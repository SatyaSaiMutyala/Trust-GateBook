import React, { useLayoutEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useSelector } from 'react-redux';
import { ScaledSheet, moderateScale } from 'react-native-size-matters/extend';
import { Banner } from '../components/Layout';
import { Button } from '../components/Button';
import { Checkbox } from '../components/Checkbox';
import { ChipSelect } from '../components/ChipSelect';
import { DateTimeField } from '../components/DateTimeField';
import { Field, FieldShell } from '../components/Field';
import { FilterTabs } from '../components/FilterBar';
import { PhotoTile } from '../components/PhotoTile';
import { RecipientPicker } from '../components/RecipientPicker';
import { SelectField } from '../components/SelectField';
import { PhotoStrip } from '../components/material/PhotoStrip';
import { KeyboardAwareScrollView } from '../components/KeyboardAwareScrollView';
import {
  errorMessage,
  useCreateMaterialMutation,
  useMaterialVisitorsQuery,
} from '../store/api';
import { selectCanCheckIn, selectUser } from '../store/authSlice';
import { useSettings, useToast } from '../store/hooks';
import { typo, useTheme } from '../theme';
import { captureImage } from '../utils/camera';
import { boxesText } from '../utils/material';

const EMPLOYEE_WORDING = {
  picked: 'Gets a notification in TruSentinel',
  typed: 'Pick someone from the list.',
  idle: 'Pick the employee from the list.',
  noMatch: name => `No employee named “${name}” is on TruSentinel.`,
  none: 'No employees are on TruSentinel yet. An admin can add them in Users.',
  useTyped: null,
  changeLabel: name => `Change employee, currently ${name}`,
};

/** Status toast after saving (same words as the web). */
export function savedToast(pass, gate) {
  const name = pass.authorisedBy?.name ?? 'the employee';
  return (
    {
      awaiting_receipt: `Saved. ${name} has been asked to accept ${boxesText(
        pass.boxes,
      )}.`,
      awaiting_approval: `Sent to ${name} for approval`,
      ready: gate
        ? 'Saved. Count the boxes when the visitor leaves.'
        : 'Saved. Security will count the boxes when the visitor leaves.',
      awaiting_drop: 'Saved. Hand the boxes to security.',
    }[pass.status] ?? `Gate pass ${pass.id} saved`
  );
}

/**
 * New material gate pass. Params: `direction` ('in' | 'out'), `visitId` (the visitor carrying them), `expected`
 * (a pre-registered delivery / visitor with boxes).
 */
export function MaterialFormScreen({ navigation, route }) {
  const { c } = useTheme();
  const toast = useToast();
  const settings = useSettings();
  const user = useSelector(selectUser);
  const gate = useSelector(selectCanCheckIn);
  const params = route?.params ?? {};
  const e = params.expected ?? null;
  const meet = e ? e.contact ?? e.host : null;
  const [direction, setDirection] = useState(
    params.direction ?? (gate ? (e ? 'in' : '') : 'out'),
  );
  const [who, setWho] = useState(e?.kind === 'delivery' ? 'gate' : 'visitor');
  const { data: visitors = [] } = useMaterialVisitorsQuery();
  const [visitId, setVisitId] = useState(params.visitId ?? '');
  const [carrier, setCarrier] = useState({
    name: '',
    company: e?.kind === 'delivery' ? e.company : '',
    phone: '',
    vehicle: '',
  });
  const [carrierPhoto, setCarrierPhoto] = useState(null);
  const [picker, setPicker] = useState({ name: '', company: '', phone: '' });
  const [employee, setEmployee] = useState(
    meet ? { id: meet.id, name: meet.name, dept: '', location: '' } : null,
  );
  const [employeeText, setEmployeeText] = useState(meet?.name ?? '');
  const [boxes, setBoxes] = useState('');
  const [challanType, setChallanType] = useState(e?.challanType ?? '');
  const [refNo, setRefNo] = useState(e?.challanNo ?? '');
  const [ewaybill, setEwaybill] = useState('');
  const [challan, setChallan] = useState([]);
  const [returnable, setReturnable] = useState(false);
  const [returnDue, setReturnDue] = useState(null);
  const [purpose, setPurpose] = useState('');
  const [boxPhotos, setBoxPhotos] = useState([]);
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState(null);
  const [field, setField] = useState(null);
  const [create, { isLoading }] = useCreateMaterialMutation();

  const isIn = direction === 'in';
  const pickup = who === 'pickup';
  const n = parseInt(boxes, 10) || 0;
  useLayoutEffect(() => {
    navigation.setOptions({
      title: gate
        ? `Material ${direction ? (isIn ? 'IN' : 'OUT') : 'pass'}`
        : 'Send material out',
    });
  }, [navigation, gate, direction, isIn]);

  const challans = isIn
    ? settings.mpChallanIn ?? []
    : settings.mpChallanOut ?? [];
  const purposes = isIn
    ? settings.mpPurposesIn ?? []
    : settings.mpPurposesOut ?? [];
  const challanRequired = settings.mpChallanPhotoRequired !== false;
  const carrierPhotoRequired = settings.mpCarrierPhotoRequired !== false;
  const needsApproval =
    gate &&
    !isIn &&
    !!employee &&
    employee.id !== user?.id &&
    settings.mpApprovalInApp !== false;
  const chosen = visitors.find(v => v.id === visitId) ?? null;

  const pickVisitor = id => {
    setVisitId(id);
    const v = visitors.find(x => x.id === id);
    if (v?.hostId && gate && !employee) {
      setEmployee({ id: v.hostId, name: v.host, dept: '', location: '' });
      setEmployeeText(v.host);
    }
  };
  const toggleReturnable = on => {
    setReturnable(on);
    if (on && !returnDue) {
      const d = new Date(Date.now() + (settings.mpReturnDays ?? 7) * 86400000);
      d.setHours(18, 0, 0, 0);
      setReturnDue(d);
    }
  };

  const submit = async () => {
    setError(null);
    setField(null);
    const fail = (msg, f) => {
      setError(msg);
      setField(f);
    };
    if (!direction) return fail('Choose material IN or OUT.', 'direction');
    if (n < 1) return fail('Enter the number of boxes', 'boxes');
    if (challanRequired && !challan.length)
      return fail('Take a photo of the challan', 'challan');
    if (returnable && !returnDue)
      return fail('Pick the date the boxes should be back', 'returnDue');
    if (gate && !isIn && settings.mpAuthRequiredOut !== false && !employee)
      return fail('Pick the employee sending the boxes', 'employee');
    if (who === 'visitor' && !visitId)
      return fail('Pick the visitor', 'visitId');
    if (who === 'gate' && !carrier.name.trim())
      return fail(
        'Enter the name of the person carrying the boxes',
        'carrierName',
      );
    if (who === 'gate' && carrierPhotoRequired && !carrierPhoto)
      return fail('Take a photo of the person carrying the boxes', 'carrier');
    if (pickup && !picker.name.trim())
      return fail('Enter who will collect the boxes', 'pickerName');
    try {
      const pass = await create({
        fields: {
          direction,
          mode: pickup ? 'pickup' : undefined,
          boxes: n,
          visitId: who === 'visitor' ? visitId : undefined,
          authorisedBy: gate ? employee?.id : undefined,
          challanType: challanType || undefined,
          refNo: refNo.trim() || undefined,
          ewaybill: ewaybill.trim() || undefined,
          purpose: purpose || undefined,
          remarks: remarks.trim() || undefined,
          returnable: returnable ? 'true' : undefined,
          returnDue:
            returnable && returnDue ? returnDue.toISOString() : undefined,
          ...(who === 'gate'
            ? {
                carrierName: carrier.name.trim(),
                carrierCompany: carrier.company.trim(),
                carrierPhone: carrier.phone.trim(),
              }
            : {}),
          vehicle: carrier.vehicle.trim() || undefined,
          ...(pickup
            ? {
                pickerName: picker.name.trim(),
                pickerCompany: picker.company.trim(),
                pickerPhone: picker.phone.trim(),
              }
            : {}),
          expectedId: e?.code,
        },
        challan,
        boxPhotos,
        carrier: who === 'gate' ? carrierPhoto : null,
      }).unwrap();
      toast.show(savedToast(pass, gate));
      navigation.replace('MaterialDetails', { id: pass.id });
    } catch (err) {
      setError(errorMessage(err));
      setField(err?.field ?? null);
    }
    return undefined;
  };

  const whoOptions = [
    { value: 'visitor', label: 'A visitor inside now' },
    ...(gate ? [{ value: 'gate', label: 'Not a visitor' }] : []),
    ...(!isIn ? [{ value: 'pickup', label: 'Leave for pickup' }] : []),
  ];
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAwareScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        {e ? (
          <Banner tone="accent">
            <Text style={[typo.body, { color: c.ink }]}>
              <Text style={{ fontWeight: '700' }}>
                {e.kind === 'delivery'
                  ? 'Expected delivery. '
                  : 'Expected boxes. '}
              </Text>
              {e.kind === 'delivery'
                ? `Registered by ${e.createdBy?.name} for ${meet?.name}: ${
                    e.boxes ? boxesText(e.boxes) : 'boxes'
                  }. Count the boxes, photograph the person and the challan.`
                : `${e.name} is bringing ${
                    e.boxes ? boxesText(e.boxes) : 'boxes'
                  } for ${meet?.name}. Count them and photograph the challan.`}
            </Text>
          </Banner>
        ) : null}

        {gate && !params.direction && !e ? (
          <FieldShell label="In or out" required error={field === 'direction'}>
            <FilterTabs
              accessibilityLabel="Material in or out"
              options={[
                { value: 'in', label: 'Material IN' },
                { value: 'out', label: 'Material OUT' },
              ]}
              value={direction}
              onChange={setDirection}
            />
          </FieldShell>
        ) : null}

        {direction ? (
          <>
            <Text style={[typo.h3, { color: c.ink }]}>
              {isIn ? 'Who brought them' : 'Who takes the boxes'}
            </Text>
            {!params.visitId ? (
              <FilterTabs
                accessibilityLabel="Who carries the boxes"
                options={whoOptions}
                value={who}
                onChange={setWho}
              />
            ) : null}
            {who === 'visitor' ? (
              visitors.length === 0 ? (
                <Banner tone="warn">
                  <Text style={[typo.body, { color: c.ink }]}>
                    No visitors are inside right now.{' '}
                    {gate ? 'Use “Not a visitor”.' : 'Use “Leave for pickup”.'}
                  </Text>
                </Banner>
              ) : (
                <>
                  <SelectField
                    label="Visitor"
                    value={visitId}
                    error={field === 'visitId'}
                    options={[
                      { value: '', label: 'Pick a visitor who is inside now' },
                      ...visitors.map(v => ({
                        value: v.id,
                        label: `${v.name}${v.company ? ` · ${v.company}` : ''}${
                          v.badge ? ` · pass ${v.badge}` : ''
                        }${!gate && v.mine ? ' (your visitor)' : ''}`,
                      })),
                    ]}
                    onChange={pickVisitor}
                  />
                  {chosen ? (
                    <Text style={[typo.small, { color: c.muted }]}>
                      Visiting {chosen.host}. Their check-in photo goes on the
                      gate pass.
                    </Text>
                  ) : null}
                </>
              )
            ) : null}
            {who === 'gate' ? (
              <>
                <Field
                  label="Name"
                  required
                  value={carrier.name}
                  onChangeText={t => setCarrier(x => ({ ...x, name: t }))}
                  error={field === 'carrierName'}
                  placeholder="Person carrying the boxes"
                />
                <Field
                  label="Company"
                  value={carrier.company}
                  onChangeText={t => setCarrier(x => ({ ...x, company: t }))}
                  placeholder="e.g. Blue Dart, DTDC"
                />
                <Field
                  label="Mobile"
                  value={carrier.phone}
                  keyboardType="phone-pad"
                  mono
                  onChangeText={t =>
                    setCarrier(x => ({
                      ...x,
                      phone: t.replace(/[^\d+\s]/g, '').slice(0, 14),
                    }))
                  }
                />
                <View style={{ width: moderateScale(150) }}>
                  <PhotoTile
                    label="Photo of the person"
                    sub="Face, shoulders up"
                    uri={carrierPhoto}
                    aspect={3 / 4}
                    required={carrierPhotoRequired}
                    error={field === 'carrier'}
                    onPress={async () => {
                      try {
                        const uri = await captureImage('person');
                        if (uri) setCarrierPhoto(uri);
                      } catch (err) {
                        toast.show(errorMessage(err), 'error');
                      }
                    }}
                  />
                </View>
              </>
            ) : null}
            {pickup ? (
              <>
                <Field
                  label="Who will collect"
                  required
                  value={picker.name}
                  onChangeText={t => setPicker(x => ({ ...x, name: t }))}
                  error={field === 'pickerName'}
                  placeholder="Name of the person collecting"
                />
                <Field
                  label="Company"
                  value={picker.company}
                  onChangeText={t => setPicker(x => ({ ...x, company: t }))}
                />
                <Field
                  label="Their mobile"
                  value={picker.phone}
                  keyboardType="phone-pad"
                  mono
                  onChangeText={t =>
                    setPicker(x => ({
                      ...x,
                      phone: t.replace(/[^\d+\s]/g, '').slice(0, 14),
                    }))
                  }
                />
                <Text style={[typo.small, { color: c.muted }]}>
                  Hand the boxes to security. Security counts them and keeps
                  them at the gate, then photographs the person who collects
                  them and counts again before handing over.
                </Text>
              </>
            ) : null}
            {who !== 'pickup' ? (
              <Field
                label="Vehicle number"
                value={carrier.vehicle}
                autoCapitalize="characters"
                mono
                onChangeText={t =>
                  setCarrier(x => ({ ...x, vehicle: t.toUpperCase() }))
                }
              />
            ) : null}

            {gate ? (
              <>
                <RecipientPicker
                  wording={{
                    ...EMPLOYEE_WORDING,
                    label: isIn
                      ? 'For (employee receiving them)'
                      : 'Sent by (employee)',
                  }}
                  text={employeeText}
                  recipient={employee}
                  error={field === 'employee' || field === 'authorisedBy'}
                  onText={setEmployeeText}
                  onPick={h => {
                    setEmployee(h);
                    setEmployeeText(h.name);
                  }}
                  onClear={() => {
                    setEmployee(null);
                    setEmployeeText('');
                  }}
                />
                <Text style={[typo.small, { color: c.muted }]}>
                  {isIn
                    ? employee
                      ? `${employee.name} will be asked to accept ${
                          n ? boxesText(n) : 'the boxes'
                        }. The pass closes when they do.`
                      : 'Without an employee, security receives the boxes.'
                    : needsApproval
                    ? `${employee.name} gets an Approve / Reject request. Release only after approval.`
                    : employee
                    ? `${employee.name} sends these boxes.`
                    : 'Pick the employee sending the boxes.'}
                </Text>
              </>
            ) : null}

            <Text style={[typo.h3, { color: c.ink }]}>Boxes and challan</Text>
            <Field
              label="Number of boxes"
              required
              value={boxes}
              keyboardType="number-pad"
              mono
              large
              error={field === 'boxes'}
              onChangeText={t => setBoxes(t.replace(/\D/g, '').slice(0, 4))}
            />
            {challans.length ? (
              <FieldShell label="Challan">
                <ChipSelect
                  accessibilityLabel="Challan"
                  options={challans}
                  value={challanType}
                  onChange={v => setChallanType(v === challanType ? '' : v)}
                />
              </FieldShell>
            ) : null}
            <Field
              label="Challan number"
              value={refNo}
              autoCapitalize="characters"
              mono
              onChangeText={t => setRefNo(t.toUpperCase())}
              placeholder="e.g. TC-2210"
            />
            <Field
              label="E-way bill number"
              value={ewaybill}
              mono
              onChangeText={t => setEwaybill(t.slice(0, 14))}
              placeholder="If there is one"
            />
            <PhotoStrip
              title="Photo of the challan"
              label="Photo of challan"
              value={challan}
              onChange={setChallan}
              max={4}
              kind="challan"
              required={challanRequired}
              error={field === 'challan'}
              hint="Make sure the details are readable."
            />

            <Checkbox
              checked={returnable}
              onChange={toggleReturnable}
              label="Returnable"
            >
              <Text style={[typo.bodySemi, { color: c.ink }]}>Returnable</Text>
              {'\n'}
              <Text style={[typo.small, { color: c.muted }]}>
                {isIn
                  ? 'The boxes will be taken back out (vendor tools, demo kit)'
                  : 'The boxes will come back (repair, demo, branch loan)'}
              </Text>
            </Checkbox>
            {returnable && returnDue ? (
              <DateTimeField
                label={isIn ? 'To go back out by' : 'Expected back by'}
                mode="date"
                value={returnDue}
                minimumDate={new Date()}
                onChange={d => {
                  const x = new Date(d);
                  x.setHours(18, 0, 0, 0);
                  setReturnDue(x);
                }}
                error={field === 'returnDue'}
              />
            ) : null}
            {purposes.length ? (
              <FieldShell label="Purpose">
                <ChipSelect
                  accessibilityLabel="Purpose"
                  options={purposes}
                  value={purpose}
                  onChange={v => setPurpose(v === purpose ? '' : v)}
                />
              </FieldShell>
            ) : null}
            <PhotoStrip
              title="Photos of the boxes"
              label="Photo of boxes"
              value={boxPhotos}
              onChange={setBoxPhotos}
              max={6}
              kind="boxes"
            />
            <Field
              label="Remarks"
              value={remarks}
              onChangeText={setRemarks}
              multiline
              maxLength={500}
              placeholder="e.g. Sealed, 2 boxes damaged"
            />
          </>
        ) : null}

        {error ? (
          <Banner tone="bad">
            <Text
              accessibilityLiveRegion="polite"
              style={[typo.bodyMedium, { color: c.bad }]}
            >
              {error}
            </Text>
          </Banner>
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
            title={
              !gate
                ? pickup
                  ? 'Save · hand to security'
                  : 'Save · tell security'
                : needsApproval
                ? 'Save & ask for approval'
                : isIn
                ? employee
                  ? 'Save & ask to accept'
                  : 'Save · received'
                : who === 'visitor'
                ? 'Save · count at exit'
                : 'Save · release now'
            }
            size="lg"
            style={{ flex: 2 }}
            loading={isLoading}
            disabled={!direction}
            onPress={submit}
          />
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = ScaledSheet.create({
  content: { padding: '16@ms', gap: '14@ms', paddingBottom: '48@vs' },
  actions: { flexDirection: 'row', gap: '12@ms', marginTop: '6@vs' },
});
