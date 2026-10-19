import React, {
  useCallback,
  useLayoutEffect,
  useMemo,
  useState,
  useEffect,
  useRef,
} from 'react';
import { useNavigation } from '@react-navigation/native';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Checkbox } from '../components/Checkbox';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { SearchBar } from '../components/FilterBar';
import { EmptyState, Panel } from '../components/Layout';
import { ListError, ListFooter, ListLoading } from '../components/ListFooter';
import { SelectField } from '../components/SelectField';
import { fonts, MIN_TOUCH, radius, typo, useTheme } from '../theme';
import {
  ScaledSheet,
  moderateScale,
  scale,
  verticalScale,
} from 'react-native-size-matters/extend';
import { useDispatch, useSelector } from 'react-redux';
import {
  errorMessage,
  useCreateUserMutation,
  useGetSettingsQuery,
  useListUsersInfiniteQuery,
  useModuleDefsQuery,
  useOrgUsersQuery,
  usePutSettingsMutation,
  useUpdateMeMutation,
  useUpdateUserMutation,
} from '../store/api';
import {
  ROLE_LABELS,
  selectHasModule,
  selectIsAdmin,
  selectIsGateUser,
  selectIsRecipient,
  selectUser,
} from '../store/authSlice';
import { useSettings, useToast } from '../store/hooks';
import { chooseSite, selectMultiGate, selectSite } from '../store/siteSlice';
import { signOut } from '../push/push';
import { PushHint } from '../push/PushHint';
import { DeleteAccount } from '../auth/DeleteAccount';
import { PendingRequests } from './account/PendingRequests';
import { useInfiniteList } from '../store/useInfiniteList';
import { fmtDate, initials } from '../utils/format';
import {
  chainText,
  defaultsFor,
  eligibleFor,
  moduleText,
} from '../utils/modules';
import { version as APP_VERSION } from '../../package.json';

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'security', label: 'Security' },
  { value: 'viewer', label: 'Viewer' },
  { value: 'host', label: 'Employee' },
];
const roleLabel = r => ROLE_LABELS[r] ?? r;
// Mutations invalidate the 'Users' tag, so lists refresh themselves.
const NOOP = () => undefined;

/** Removable tags plus an add field. Saves the whole Settings object on every change. */
function ListEditor({ title, subtitle, field, editable }) {
  const { c } = useTheme();
  const toast = useToast();
  const settings = useSettings();
  const [putSettings] = usePutSettingsMutation();
  const items = settings[field];
  const [draft, setDraft] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const commit = async next => {
    setBusy(true);
    setError(null);
    try {
      await putSettings({ ...settings, [field]: next }).unwrap();
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    const v = draft.trim().replace(/\s+/g, ' ');
    if (!v) return;
    if (items.some(x => x.toLowerCase() === v.toLowerCase())) {
      setError('Already in the list.');
      return;
    }
    if (await commit([...items, v])) {
      setDraft('');
      toast.show(`Added ${v}`);
    }
  };

  const remove = async v => {
    if (items.length <= 1) {
      setError('Keep at least one.');
      return;
    }
    if (await commit(items.filter(x => x !== v))) toast.show(`Removed ${v}`);
  };

  return (
    <Panel title={title} subtitle={subtitle}>
      <View style={styles.tags}>
        {items.map(v => (
          <View
            key={v}
            style={[
              styles.tag,
              { backgroundColor: c.sunk, borderColor: c.line },
            ]}
          >
            <Text style={[typo.bodyMedium, { color: c.ink }]}>{v}</Text>
            {editable ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${v}`}
                onPress={() => remove(v)}
                disabled={busy}
                hitSlop={10}
                style={styles.tagX}
              >
                <Text style={{ color: c.muted, fontSize: moderateScale(14) }}>
                  ✕
                </Text>
              </Pressable>
            ) : null}
          </View>
        ))}
      </View>
      {editable ? (
        <View style={styles.addRow}>
          <Field
            label={`Add to ${title.toLowerCase()}`}
            value={draft}
            onChangeText={t => {
              setDraft(t);
              setError(null);
            }}
            onSubmitEditing={add}
            returnKeyType="done"
            style={{ flex: 1 }}
            placeholder="New entry"
          />
          <Button
            title="Add"
            onPress={add}
            loading={busy}
            style={{ alignSelf: 'flex-end' }}
          />
        </View>
      ) : null}
      {error ? (
        <Text style={[typo.bodyMedium, { color: c.bad }]}>{error}</Text>
      ) : null}
    </Panel>
  );
}

/** One whole-number setting (overstay hours, host reply minutes) with its own Save. */
function NumberPanel({
  editable,
  settingKey,
  title,
  subtitle,
  label,
  unit,
  min,
  max,
  savedText,
}) {
  const { c } = useTheme();
  const toast = useToast();
  const settings = useSettings();
  const [putSettings] = usePutSettingsMutation();
  const [draft, setDraft] = useState(null); // null = untouched, show the saved value
  const value = draft ?? String(settings[settingKey]);
  const setValue = setDraft;
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const n = Number(value);
    if (!Number.isInteger(n) || n < min || n > max) {
      setError(`Enter whole ${unit} from ${min} to ${max}.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await putSettings({ ...settings, [settingKey]: n }).unwrap();
      setDraft(null);
      toast.show(savedText(n));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title={title} subtitle={subtitle}>
      <View style={styles.addRow}>
        <Field
          label={label}
          value={value}
          onChangeText={t => setValue(t.replace(/\D/g, '').slice(0, 3))}
          keyboardType="number-pad"
          mono
          editable={editable}
          error={!!error}
          style={{ flex: 1 }}
        />
        {editable ? (
          <Button
            title="Save"
            onPress={submit}
            loading={busy}
            style={{ alignSelf: 'flex-end' }}
          />
        ) : null}
      </View>
      {error ? (
        <Text style={[typo.bodyMedium, { color: c.bad }]}>{error}</Text>
      ) : null}
    </Panel>
  );
}

/** Admin: on/off rules (Settings → Visitors / Post room). rows: [settingKey, title, explanation]. */
function RulesPanel({ title, rows }) {
  const { c } = useTheme();
  const toast = useToast();
  const settings = useSettings();
  const [putSettings, { isLoading }] = usePutSettingsMutation();
  const flip = async (key, on) => {
    try {
      await putSettings({ ...settings, [key]: on }).unwrap();
      toast.show('Saved');
    } catch (e) {
      toast.show(errorMessage(e), 'error');
    }
  };
  return (
    <Panel title={title}>
      {rows.map(([key, label, help]) => (
        <View key={key} style={{ gap: 2 }}>
          <Checkbox
            checked={settings[key] !== false}
            disabled={isLoading}
            onChange={v => flip(key, v)}
            label={label}
          />
          <Text style={[typo.small, { color: c.muted }]}>{help}</Text>
        </View>
      ))}
    </Panel>
  );
}

const MATRIX_TITLES = {
  visitor: 'Host has not replied',
  overstay: 'Visitor overstaying',
  mail: 'Post not collected',
  mpreceipt: 'Material IN not accepted',
  mpapproval: 'Gate pass waiting for approval',
  material: 'Returnable material overdue',
};
const TARGETS = {
  guards: 'Guards on duty',
  person: 'The person concerned',
  l1: 'Level 1: their manager',
  l2: "Level 2: manager's manager",
  l3: 'Level 3',
  supervisors: 'Gate supervisors',
  admins: 'Admins',
};
/** "AT ONCE" / "+15 min" / "+4 h" / "+3 d". */
const fmtAfter = min =>
  !min
    ? 'AT ONCE'
    : min % 1440 === 0
    ? `+${min / 1440} d`
    : min % 60 === 0
    ? `+${min / 60} h`
    : `+${min} min`;

/** Admin: whether visitors must agree to the terms at check-in (the wording is edited on the web). */
function TermsRequiredPanel() {
  const { c } = useTheme();
  const toast = useToast();
  const settings = useSettings();
  const [putSettings, { isLoading }] = usePutSettingsMutation();
  const terms = settings.terms ?? { required: false, version: 1 };
  return (
    <Panel
      title="Terms & confidentiality agreement"
      subtitle={`Version ${terms.version}. Edit the wording in Settings on the web.`}
    >
      <Checkbox
        checked={!!terms.required}
        disabled={isLoading}
        label="Visitors must agree to the terms at check-in"
        onChange={async v => {
          try {
            await putSettings({
              ...settings,
              terms: { ...terms, required: v },
            }).unwrap();
            toast.show('Saved');
          } catch (e) {
            toast.show(errorMessage(e), 'error');
          }
        }}
      />
      <Text style={[typo.small, { color: c.muted }]}>
        Adds the agreement checkbox to the check-in form and creates the PDF for
        every visit.
      </Text>
    </Panel>
  );
}

/** Admin: the escalation matrices, read-only (edited in Settings on the web). */
function EscalationSummary() {
  const { c } = useTheme();
  const settings = useSettings();
  const esc = settings.esc ?? {};
  return (
    <Panel
      title="Escalation matrices"
      subtitle="Who is told, and when, while an item is still open. Edit them in Settings on the web."
    >
      {Object.entries(MATRIX_TITLES).map(([key, title]) => (
        <View key={key} style={{ gap: 4 }}>
          <Text style={[typo.bodySemi, { color: c.ink }]}>{title}</Text>
          {(esc[key] ?? []).length === 0 ? (
            <Text style={[typo.small, { color: c.muted }]}>
              No steps. Nobody is alerted.
            </Text>
          ) : (
            (esc[key] ?? []).map((s, i) => (
              <Text key={i} style={[typo.small, { color: c.ink }]}>
                <Text style={{ fontFamily: fonts.mono }}>
                  {fmtAfter(s.after)}
                </Text>
                {'  '}
                {TARGETS[s.to] ?? 'A named person'}
                {s.alarm ? ' · alarm' : ''}
                {s.repeat
                  ? ` · repeats every ${fmtAfter(s.repeat).slice(1)}`
                  : ''}
                {s.label ? ` · ${s.label}` : ''}
              </Text>
            ))
          )}
        </View>
      ))}
    </Panel>
  );
}

/** Admin: whether "Pre-approved" starts ticked when someone pre-registers a visitor. */
function PreapprovedPanel() {
  const { c } = useTheme();
  const toast = useToast();
  const settings = useSettings();
  const [putSettings, { isLoading }] = usePutSettingsMutation();
  const on = settings.expectedPreapproved !== false;
  const toggle = async v => {
    try {
      await putSettings({ ...settings, expectedPreapproved: v }).unwrap();
      toast.show(
        v
          ? 'New expected visitors start pre-approved'
          : 'New expected visitors start not pre-approved',
      );
    } catch (e) {
      toast.show(errorMessage(e), 'error');
    }
  };
  return (
    <Panel
      title="Pre-approved visitors"
      subtitle="A pre-approved expected visitor is accepted at check-in without asking the employee again. This sets whether “Pre-approved” starts ticked; they can still change it."
    >
      <Checkbox
        checked={on}
        disabled={isLoading}
        onChange={toggle}
        label="Ticked by default"
      />
      {!on ? (
        <Text style={[typo.small, { color: c.muted }]}>
          Unticked by default: the employee is asked when the visitor arrives.
        </Text>
      ) : null}
    </Panel>
  );
}

/**
 * Reports to (escalation level 1), designation, gate supervisor and the modules this person can use.
 * `modules` is the effective tick list (the role defaults until changed).
 */
function AccessFields({ form, set, modules, defs, org, selfId, designations }) {
  const { c } = useTheme();
  const managers = org
    .filter(u => u.active && u.id !== selfId)
    .sort((a, b) => a.name.localeCompare(b.name));
  const preview = chainText(
    selfId
      ? org.map(u =>
          u.id === selfId ? { ...u, reportsTo: form.reportsTo ?? null } : u,
        )
      : [
          ...org,
          {
            id: '__new',
            name: '',
            active: true,
            reportsTo: form.reportsTo ?? null,
          },
        ],
    selfId ?? '__new',
  );
  const rows = eligibleFor(defs, form.role);
  return (
    <>
      <SelectField
        label="Reports to (escalation level 1)"
        value={form.reportsTo ?? ''}
        options={[
          { value: '', label: 'Nobody (top of the chain)' },
          ...managers.map(m => ({
            value: m.id,
            label: `${m.name} · ${
              m.designation || ROLE_LABELS[m.role] || m.role
            }`,
          })),
        ]}
        onChange={v => set('reportsTo', v || null)}
      />
      <Text style={[typo.small, { color: c.muted, marginTop: -6 }]}>
        {form.reportsTo
          ? `Escalations go: ${preview}`
          : 'Escalations for this person go straight to admin.'}
      </Text>
      <Field
        label="Designation"
        value={form.designation ?? ''}
        onChangeText={t => set('designation', t)}
        placeholder={
          designations[0] ? `e.g. ${designations[0]}` : 'e.g. Security guard'
        }
      />
      {form.role !== 'host' ? (
        <Checkbox
          checked={!!form.isSupervisor}
          onChange={v => set('isSupervisor', v)}
          label="Gate supervisor (gets “Gate supervisors” escalation steps)"
        />
      ) : null}
      <Text style={[typo.h3, { color: c.ink }]}>
        Modules this person can use
      </Text>
      {form.role === 'admin' ? (
        <Text style={[typo.small, { color: c.muted }]}>
          Admins have every module and Settings.
        </Text>
      ) : (
        <>
          {form.role === 'host' ? (
            <Checkbox
              checked
              disabled
              label="My visitors — always on"
              onChange={() => {}}
            />
          ) : null}
          {rows.map(d => {
            const [name, what] = moduleText(d, form.role);
            const on = modules.includes(d.key);
            return (
              <Checkbox
                key={d.key}
                checked={on}
                label={`${name}: ${what}`}
                onChange={v =>
                  set(
                    'modules',
                    v
                      ? rows
                          .map(r => r.key)
                          .filter(k => k === d.key || modules.includes(k))
                      : modules.filter(k => k !== d.key),
                  )
                }
              />
            );
          })}
          <Text style={[typo.small, { color: c.muted }]}>
            {rows.filter(d => modules.includes(d.key)).length} of {rows.length}{' '}
            ticked. Unticked modules are hidden and refused by the server.
          </Text>
        </>
      )}
    </>
  );
}

const EMPTY_USER = {
  name: '',
  email: '',
  password: '',
  role: 'security',
  phone: '',
  dept: '',
  location: '',
  isHost: false,
  canPreRegister: true,
  reportsTo: null,
  designation: '',
  isSupervisor: false,
};

/** Everyone: own phone (and for recipients department + location), saved via PATCH /api/auth/me. */
/** Edit own phone (+ department / location for post recipients). `onDone` adds Cancel and is called after save or cancel. */
function MyDetailsPanel({ onDone }) {
  const { c } = useTheme();
  const toast = useToast();
  const user = useSelector(selectUser);
  const settings = useSettings();
  const recipient = useSelector(selectIsRecipient);
  const [updateMe] = useUpdateMeMutation();
  const [draft, setDraft] = useState(null); // null = untouched, show saved values
  const values = draft ?? {
    phone: user?.phone ?? '',
    dept: user?.dept ?? '',
    location: user?.location ?? '',
  };
  const [error, setError] = useState(null);
  const [field, setField] = useState(null);
  const [busy, setBusy] = useState(false);
  const setVal = (k, v) => setDraft({ ...values, [k]: v });

  const save = async () => {
    setBusy(true);
    setError(null);
    setField(null);
    try {
      const body = { phone: values.phone.trim() };
      if (recipient) {
        body.dept = values.dept;
        body.location = values.location.trim();
      }
      await updateMe(body).unwrap(); // the auth slice picks up the new user
      setDraft(null);
      toast.show('Your details are saved');
      onDone?.();
    } catch (e) {
      setError(errorMessage(e));
      setField(e && e.field ? e.field : null);
    } finally {
      setBusy(false);
    }
  };

  const deptOptions = [
    { value: '', label: 'Not set' },
    ...settings.departments.map(d => ({ value: d, label: d })),
  ];
  return (
    <Panel
      title="My details"
      subtitle="Security sees your phone number when they need to call you."
    >
      <Field
        label="Mobile number"
        value={values.phone}
        onChangeText={t =>
          setVal('phone', t.replace(/[^\d+]/g, '').slice(0, 14))
        }
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        mono
        error={field === 'phone'}
      />
      {recipient ? (
        <>
          <SelectField
            label="Department"
            value={values.dept}
            options={deptOptions}
            onChange={v => setVal('dept', v)}
          />
          <Field
            label="Where visitors should go"
            value={values.location}
            onChangeText={t => setVal('location', t)}
            placeholder="2nd floor, cabin 3"
            error={field === 'location'}
          />
        </>
      ) : null}
      {error ? (
        <Text style={[typo.bodyMedium, { color: c.bad }]}>{error}</Text>
      ) : null}
      <View style={styles.formActions}>
        {onDone ? (
          <Button
            title="Cancel"
            variant="ghost"
            onPress={() => {
              setDraft(null);
              onDone();
            }}
            disabled={busy}
            style={{ flex: 1 }}
          />
        ) : null}
        <Button
          title={onDone ? 'Save' : 'Save my details'}
          onPress={save}
          loading={busy}
          disabled={!draft}
          style={onDone ? { flex: 1 } : undefined}
        />
      </View>
    </Panel>
  );
}

/** Create or edit a user: name/email/password (create), role, phone, department, location, "Can also receive post". */
function UserForm({ initial, editing, onCancel, onSaved }) {
  const { c } = useTheme();
  const toast = useToast();
  const settings = useSettings();
  const [createUser] = useCreateUserMutation();
  const [updateUser] = useUpdateUserMutation();
  const [form, setForm] = useState(initial);
  const [error, setError] = useState(null);
  const [field, setField] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const { data: defs = [] } = useModuleDefsQuery();
  const { data: org = [] } = useOrgUsersQuery();
  // Ticks kept per role; untouched (undefined) = the role's defaults.
  const modules = Array.isArray(form.modules)
    ? form.modules
    : defaultsFor(defs, form.role);

  const submit = async () => {
    if (
      !editing &&
      (!form.name.trim() || !form.email.trim() || !form.password)
    ) {
      setError('Fill the highlighted fields.');
      setField(
        !form.name.trim() ? 'name' : !form.email.trim() ? 'email' : 'password',
      );
      return;
    }
    setBusy(true);
    setError(null);
    setField(null);
    try {
      const common = {
        role: form.role,
        phone: form.phone.trim(),
        dept: form.dept,
        location: form.location.trim(),
        isHost: form.role === 'host' ? true : !!form.isHost,
        canPreRegister: form.canPreRegister !== false,
        reportsTo: form.reportsTo ?? null,
        designation: (form.designation ?? '').trim(),
        isSupervisor: form.role !== 'host' && !!form.isSupervisor,
        ...(form.role !== 'admin' && defs.length ? { modules } : {}),
      };
      const res = editing
        ? await updateUser({
            id: initial.id,
            ...common,
            name: form.name.trim(),
          }).unwrap()
        : await createUser({
            ...common,
            name: form.name.trim(),
            email: form.email.trim(),
            password: form.password,
          }).unwrap();
      toast.show(editing ? `Saved ${res.user.name}` : `Added ${res.user.name}`);
      onSaved(res.user);
    } catch (e) {
      setError(errorMessage(e));
      setField(e && e.field ? e.field : null);
    } finally {
      setBusy(false);
    }
  };

  const deptOptions = [
    { value: '', label: 'Not set' },
    ...settings.departments.map(d => ({ value: d, label: d })),
  ];
  return (
    <View
      style={[styles.addUser, { borderColor: c.line, backgroundColor: c.sunk }]}
    >
      <Text style={[typo.h3, { color: c.ink }]}>
        {editing ? `Edit ${initial.name}` : 'New user'}
      </Text>
      <Field
        label="Name"
        value={form.name}
        onChangeText={t => set('name', t)}
        error={field === 'name'}
      />
      {!editing ? (
        <>
          <Field
            label="Email"
            value={form.email}
            onChangeText={t => set('email', t)}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
            error={field === 'email'}
          />
          <Field
            label="Password"
            value={form.password}
            onChangeText={t => set('password', t)}
            secureTextEntry
            error={field === 'password'}
          />
        </>
      ) : null}
      <SelectField
        label="Role"
        value={form.role}
        options={ROLE_OPTIONS}
        onChange={r => setForm(f => ({ ...f, role: r, modules: undefined }))}
      />
      <Field
        label="Mobile"
        value={form.phone}
        onChangeText={t => set('phone', t.replace(/[^\d+]/g, '').slice(0, 14))}
        keyboardType="phone-pad"
        mono
        error={field === 'phone'}
      />
      <SelectField
        label="Department"
        value={form.dept}
        options={deptOptions}
        onChange={v => set('dept', v)}
      />
      <Field
        label="Location"
        value={form.location}
        onChangeText={t => set('location', t)}
        placeholder="2nd floor, cabin 3"
        error={field === 'location'}
      />
      {form.role !== 'host' ? (
        <Checkbox
          checked={!!form.isHost}
          onChange={v => set('isHost', v)}
          label="Can also receive post"
        />
      ) : null}
      {form.role === 'host' || form.role === 'security' ? (
        <Checkbox
          checked={form.canPreRegister !== false}
          onChange={v => set('canPreRegister', v)}
          label="Can pre-register visitors"
        />
      ) : null}
      <AccessFields
        form={form}
        set={set}
        modules={modules}
        defs={defs}
        org={org}
        selfId={editing ? initial.id : null}
        designations={settings.designations ?? []}
      />
      {error ? (
        <Text style={[typo.bodyMedium, { color: c.bad }]}>{error}</Text>
      ) : null}
      <View style={styles.addRow}>
        <Button
          title="Cancel"
          variant="ghost"
          onPress={onCancel}
          style={{ flex: 1 }}
        />
        <Button
          title={editing ? 'Save user' : 'Create user'}
          onPress={submit}
          loading={busy}
          style={{ flex: 1.4 }}
        />
      </View>
    </View>
  );
}

function AddUserForm({ onCreated }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <Button title="Add user" variant="ghost" onPress={() => setOpen(true)} />
    );
  return (
    <UserForm
      initial={EMPTY_USER}
      onCancel={() => setOpen(false)}
      onSaved={() => {
        setOpen(false);
        onCreated();
      }}
    />
  );
}

function RoleChip({ role, isHost }) {
  const { c } = useTheme();
  return (
    <View
      style={{ flexDirection: 'row', gap: moderateScale(4), flexWrap: 'wrap' }}
    >
      <View
        style={[
          styles.roleChip,
          {
            backgroundColor: role === 'host' ? c.accentSoft : c.sunk,
            borderColor: c.line,
          },
        ]}
      >
        <Text style={[typo.tiny, { color: c.ink }]}>{roleLabel(role)}</Text>
      </View>
      {isHost && role !== 'host' ? (
        <View
          style={[
            styles.roleChip,
            { backgroundColor: c.sunk, borderColor: c.line },
          ]}
        >
          <Text style={[typo.tiny, { color: c.muted }]}>Receives post</Text>
        </View>
      ) : null}
    </View>
  );
}

function UserRow({ item, me, onChanged }) {
  const { c } = useTheme();
  const toast = useToast();
  const [updateUser] = useUpdateUserMutation();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const self = item.id === me.id;

  const toggleActive = async () => {
    setBusy(true);
    try {
      const res = await updateUser({
        id: item.id,
        active: !item.active,
      }).unwrap();
      onChanged(res.user);
      toast.show(
        `${res.user.name} ${res.user.active ? 'activated' : 'deactivated'}`,
      );
    } catch (e) {
      toast.show(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <UserForm
        editing
        initial={{
          ...EMPTY_USER,
          ...item,
          phone: item.phone ?? '',
          dept: item.dept ?? '',
          location: item.location ?? '',
        }}
        onCancel={() => setEditing(false)}
        onSaved={u => {
          onChanged(u);
          setEditing(false);
        }}
      />
    );
  }

  return (
    <View
      style={[
        styles.userRow,
        {
          backgroundColor: c.surface,
          borderColor: c.line,
          opacity: item.active ? 1 : 0.6,
        },
      ]}
    >
      <View style={{ flex: 1, gap: moderateScale(3) }}>
        <Text style={[typo.bodySemi, { color: c.ink }]} numberOfLines={1}>
          {item.name}
          {self ? (
            <Text style={{ color: c.muted, fontFamily: fonts.body }}>
              {' '}
              (you)
            </Text>
          ) : null}
        </Text>
        <Text style={[typo.small, { color: c.muted }]} numberOfLines={1}>
          {item.email}
          {item.active ? '' : ' · deactivated'}
        </Text>
        {item.phone || item.dept || item.location ? (
          <Text style={[typo.small, { color: c.muted }]} numberOfLines={1}>
            {[item.phone, item.dept, item.location].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
        <RoleChip role={item.role} isHost={item.isHost} />
      </View>
      <View style={{ gap: moderateScale(6), width: scale(112) }}>
        <Button
          title="Edit"
          variant="ghost"
          size="sm"
          onPress={() => setEditing(true)}
          accessibilityLabel={`Edit ${item.name}`}
        />
        {!self ? (
          <Button
            title={item.active ? 'Deactivate' : 'Activate'}
            variant={item.active ? 'danger' : 'ghost'}
            size="sm"
            loading={busy}
            onPress={toggleActive}
          />
        ) : null}
      </View>
    </View>
  );
}

/** One label / value line in the profile's details card. */
function InfoRow({ label, value, mono, first }) {
  const { c } = useTheme();
  return (
    <View
      style={[
        styles.infoRow,
        {
          borderTopColor: c.line,
          borderTopWidth: first ? 0 : StyleSheet.hairlineWidth,
        },
      ]}
    >
      <Text style={[typo.small, styles.infoLabel, { color: c.muted }]}>
        {label}
      </Text>
      <Text
        style={[
          mono ? typo.mono : typo.bodyMedium,
          styles.infoValue,
          { color: value ? c.ink : c.muted },
        ]}
      >
        {value || 'Not set'}
      </Text>
    </View>
  );
}

/**
 * Account screen for everyone except admins: a profile — who you are, your own details
 * (editable in place) and sign out. Admin-only lists and settings are not shown.
 */
function ProfileView() {
  const { c } = useTheme();
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const recipient = useSelector(selectIsRecipient);
  const gateUser = useSelector(selectIsGateUser);
  const [editing, setEditing] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  const rows = [
    { label: 'Mobile', value: user?.phone, mono: true },
    recipient ? { label: 'Department', value: user?.dept } : null,
    recipient ? { label: 'Where to find me', value: user?.location } : null,
    gateUser ? { label: 'Gate', value: 'Main entrance' } : null,
    {
      label: 'Member since',
      value: user?.createdAt ? fmtDate(user.createdAt) : '',
    },
  ].filter(Boolean);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.profile}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={[
            styles.hero,
            { backgroundColor: c.surface, borderColor: c.line },
          ]}
        >
          <View style={[styles.avatar, { backgroundColor: c.accent }]}>
            <Text style={[styles.avatarText, { color: c.accentInk }]}>
              {initials(user?.name)}
            </Text>
          </View>
          <Text
            accessibilityRole="header"
            numberOfLines={2}
            style={[styles.heroName, { color: c.ink }]}
          >
            {user?.name}
          </Text>
          <RoleChip role={user?.role} isHost={user?.isHost} />
          <Text style={[typo.small, { color: c.muted }]}>{user?.email}</Text>
        </View>

        {editing ? (
          <MyDetailsPanel onDone={() => setEditing(false)} />
        ) : (
          <Panel
            title="Details"
            right={
              <Button
                title="Edit"
                variant="ghost"
                size="sm"
                onPress={() => setEditing(true)}
                accessibilityLabel="Edit my details"
              />
            }
          >
            <View>
              {rows.map((r, i) => (
                <InfoRow key={r.label} {...r} first={i === 0} />
              ))}
            </View>
            {recipient ? (
              <Text style={[typo.small, { color: c.muted }]}>
                Security sees your mobile number and where to find you when post
                or a visitor arrives for you.
              </Text>
            ) : null}
          </Panel>
        )}

        <PushHint />
        <DeleteAccount />
        <Button
          title="Sign out"
          variant="danger"
          onPress={() => setConfirmSignOut(true)}
        />
        <Text style={[typo.tiny, styles.version, { color: c.muted }]}>
          Gatebook v{APP_VERSION}
        </Text>
      </ScrollView>
      <ConfirmDialog
        visible={confirmSignOut}
        tone="danger"
        title="Sign out?"
        message="You will need your email and password to sign in again."
        confirmLabel="Sign out"
        onCancel={() => setConfirmSignOut(false)}
        onConfirm={() => {
          setConfirmSignOut(false);
          dispatch(signOut());
        }}
      />
    </KeyboardAvoidingView>
  );
}

/** "This gate": the gate this phone works at (gate users, several gates). */
function GatePanel() {
  const dispatch = useDispatch();
  const toast = useToast();
  const multi = useSelector(selectMultiGate);
  const site = useSelector(selectSite);
  const settings = useSettings();
  if (!multi) return null;
  return (
    <Panel
      title="This gate"
      subtitle="Lists, TRACK and new entries on this phone are for this gate."
    >
      <SelectField
        label="Gate"
        value={site}
        options={(settings?.sites ?? []).map(s => ({ value: s, label: s }))}
        onChange={v => {
          dispatch(chooseSite(v));
          toast.show(`Working at ${v}`);
        }}
      />
    </Panel>
  );
}

/** Key register and Incidents, for whoever has the modules. */
function SiteSafetyLinks() {
  const navigation = useNavigation();
  const keys = useSelector(selectHasModule('keys'));
  const incidents = useSelector(selectHasModule('incidents'));
  const patrol = useSelector(selectHasModule('patrol'));
  const gen = useSelector(selectHasModule('gen'));
  const gate = useSelector(selectIsGateUser);
  if (!incidents && !(gate && (keys || patrol || gen))) return null;
  return (
    <Panel
      title="Site safety"
      subtitle="Report something unsafe, follow up incidents, keys at the gate."
    >
      {incidents ? (
        <Button
          title="Incidents"
          variant="ghost"
          onPress={() => navigation.navigate('Incidents')}
        />
      ) : null}
      {keys && gate ? (
        <Button
          title="Key register"
          variant="ghost"
          onPress={() => navigation.navigate('Keys')}
        />
      ) : null}
      {patrol && gate ? (
        <Button
          title="Patrols"
          variant="ghost"
          onPress={() => navigation.navigate('Patrol')}
        />
      ) : null}
      {gen && gate ? (
        <Button
          title="Generator & diesel"
          variant="ghost"
          onPress={() => navigation.navigate('Generator')}
        />
      ) : null}
    </Panel>
  );
}

export function AccountScreen({ route } = {}) {
  const { c } = useTheme();
  const navigation = useNavigation();
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const isAdmin = useSelector(selectIsAdmin);
  const listRef = useRef(null);
  const section = route?.params?.section;
  // Opened from a 🙋 sign-up notification: Pending requests sits at the top of the list.
  useEffect(() => {
    if (section !== 'pending' || !isAdmin) return;
    listRef.current?.scrollToOffset?.({ offset: 0, animated: true });
    navigation.setParams?.({ section: undefined });
  }, [section, isAdmin, navigation]);
  // Admins see their name under the title; the profile view shows it in the card instead.
  useLayoutEffect(() => {
    navigation.setOptions({ headerSubtitle: isAdmin ? user?.name : undefined });
  }, [navigation, user?.name, isAdmin]);
  const { refetch: reload } = useGetSettingsQuery();
  // Ask first (in the app's own dialog): signing out by accident on a gate phone means logging back in mid-shift.
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [q, setQ] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Pending sign-ups have their own section above; this list shows active users only.
  const params = useMemo(() => ({ q, sort: 'name', status: 'active' }), [q]);
  const users = useInfiniteList(useListUsersInfiniteQuery, params, {
    skip: !isAdmin,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      reload(),
      isAdmin ? users.refresh() : Promise.resolve(),
    ]);
    setRefreshing(false);
  }, [reload, isAdmin, users]);

  // Everyone except admins sees a personal profile instead of the settings screen.
  if (!isAdmin) return <ProfileView />;

  const header = (
    <View
      style={{
        gap: moderateScale(14),
        marginBottom: isAdmin ? verticalScale(10) : 0,
      }}
    >
      <PendingRequests />
      <MyDetailsPanel />
      <ListEditor title="Departments" field="departments" editable />
      <ListEditor title="Purposes" field="purposes" editable />
      <ListEditor
        title="Types of post"
        field="mailKinds"
        editable
        subtitle="The quick-pick buttons when security logs incoming post."
      />
      <NumberPanel
        editable
        settingKey="overstayHours"
        title="Overstay alert"
        subtitle="Visitors inside longer than this are flagged amber."
        label="Hours (1–24)"
        unit="hours"
        min={1}
        max={24}
        savedText={n => `Overstay alert set to ${n} h`}
      />
      <NumberPanel
        editable
        settingKey="hostReplyMinutes"
        title="Host reply time"
        subtitle="If the employee being visited hasn't accepted or declined in this time, security is alerted to call them."
        label="Minutes (1–60)"
        unit="minutes"
        min={1}
        max={60}
        savedText={n => `Host reply time set to ${n} min`}
      />
      <PreapprovedPanel />
      <RulesPanel
        title="Check-in rules"
        rows={[
          [
            'visitorPhotoRequired',
            'Visitor photo is required',
            'Security cannot check a visitor in without a photo.',
          ],
          [
            'visitorPassRequired',
            'Pass number is required',
            'Every visitor must be given a numbered pass card.',
          ],
        ]}
      />
      <RulesPanel
        title="Post logging rules"
        rows={[
          [
            'mailCoverRequired',
            'Cover photos are required',
            'Front and back of the cover.',
          ],
          [
            'mailPersonPhotoRequired',
            'Delivery person photo is required',
            'Whoever brought it.',
          ],
        ]}
      />
      <TermsRequiredPanel />
      <ListEditor title="Material IN purposes" field="mpPurposesIn" editable />
      <ListEditor
        title="Material OUT purposes"
        field="mpPurposesOut"
        editable
      />
      <ListEditor title="Challans: material IN" field="mpChallanIn" editable />
      <ListEditor
        title="Challans: material OUT"
        field="mpChallanOut"
        editable
      />
      <ListEditor
        title="Units"
        field="mpUnits"
        editable
        subtitle="Units offered for optional item details."
      />
      <RulesPanel
        title="Material gate pass rules"
        rows={[
          [
            'mpAuthRequiredOut',
            'Material going out needs an authorising employee',
            'Security must enter who approved the material leaving.',
          ],
          [
            'mpApprovalInApp',
            'Security-made OUT passes need the employee to approve',
            'The employee named on the pass gets Approve / Reject.',
          ],
          [
            'mpChallanPhotoRequired',
            'Photo of the challan is required',
            'Every pass needs a photo of the challan.',
          ],
          [
            'mpCarrierPhotoRequired',
            'Photo of a carrier who is not a visitor is required',
            'Visitors already have their check-in photo.',
          ],
        ]}
      />
      <NumberPanel
        editable
        settingKey="mpReturnDays"
        title="Default return period"
        subtitle="Pre-fills the expected return date for returnable material."
        label="Days (1–365)"
        unit="days"
        min={1}
        max={365}
        savedText={n => `Return period set to ${n} days`}
      />
      <EscalationSummary />
      {isAdmin ? (
        <View
          style={[
            styles.usersHead,
            { backgroundColor: c.surface, borderColor: c.line },
          ]}
        >
          <View style={styles.rowBetween}>
            <Text
              accessibilityRole="header"
              style={[typo.h3, { color: c.ink }]}
            >
              Users
            </Text>
            <Text style={[typo.monoSmall, { color: c.muted }]}>
              {users.loading ? '' : `${users.total} total`}
            </Text>
          </View>
          <AddUserForm onCreated={NOOP} />
          <SearchBar
            value={q}
            onChangeText={setQ}
            placeholder="Name, email, phone, dept…"
            label="Search users"
          />
          {users.error ? (
            <ListError message={users.error} onRetry={users.retry} />
          ) : null}
        </View>
      ) : null}
    </View>
  );

  const footer = (
    <View style={{ gap: moderateScale(14) }}>
      {isAdmin ? <ListFooter list={users} /> : null}
      <GatePanel />
      <SiteSafetyLinks />
      <Panel title="Signed in">
        <Text style={[typo.body, { color: c.ink }]}>
          {user?.name} ·{' '}
          <Text style={{ fontFamily: fonts.bodySemi }}>
            {roleLabel(user?.role)}
          </Text>
        </Text>
        <Text style={[typo.small, { color: c.muted }]}>{user?.email}</Text>
        <PushHint />
        <DeleteAccount />
        <Button
          title="Sign out"
          variant="danger"
          onPress={() => setConfirmSignOut(true)}
        />
      </Panel>
      <ConfirmDialog
        visible={confirmSignOut}
        tone="danger"
        title="Sign out?"
        message="You will need your email and password to sign in again."
        confirmLabel="Sign out"
        onCancel={() => setConfirmSignOut(false)}
        onConfirm={() => {
          setConfirmSignOut(false);
          dispatch(signOut());
        }}
      />
    </View>
  );

  let empty = null;
  if (isAdmin) {
    if (users.loading) empty = <ListLoading />;
    else if (!users.error)
      empty = (
        <EmptyState
          title="No users"
          body={q ? 'No user matches that search.' : 'Add the first user.'}
        />
      );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <FlatList
        ref={listRef}
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        data={isAdmin ? users.items : []}
        keyExtractor={u => u.id}
        renderItem={({ item }) => (
          <UserRow item={item} me={user} onChanged={NOOP} />
        )}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={footer}
        onEndReached={isAdmin ? users.loadMore : undefined}
        onEndReachedThreshold={0.4}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={c.muted}
            colors={[c.accent]}
          />
        }
      />
    </KeyboardAvoidingView>
  );
}

function Separator() {
  return <View style={{ height: verticalScale(8) }} />;
}

const styles = ScaledSheet.create({
  // Profile (non-admin account screen)
  profile: { padding: '16@ms', gap: '14@ms', paddingBottom: '32@vs' },
  hero: {
    borderWidth: 1,
    borderRadius: radius.panel,
    paddingVertical: '22@vs',
    paddingHorizontal: '16@s',
    alignItems: 'center',
    gap: '8@ms',
  },
  avatar: {
    width: '72@ms',
    height: '72@ms',
    borderRadius: '36@ms',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '4@ms',
  },
  avatarText: {
    fontFamily: fonts.display,
    fontSize: '28@ms',
    lineHeight: '32@ms',
  },
  heroName: {
    fontFamily: fonts.display,
    fontSize: '24@ms',
    lineHeight: '28@ms',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: '12@ms',
    paddingVertical: '11@vs',
  },
  infoLabel: { width: '120@s' },
  infoValue: { flex: 1, textAlign: 'right' },
  formActions: { flexDirection: 'row', gap: '10@ms' },
  version: { textAlign: 'center' },
  content: { padding: '16@ms', paddingBottom: '40@vs' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: '8@ms' },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: '4@ms',
    borderRadius: radius.chip,
    borderWidth: 1,
    paddingLeft: '12@s',
    paddingRight: '4@s',
    minHeight: '36@vs',
  },
  tagX: {
    width: '32@ms',
    height: '32@ms',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addRow: { flexDirection: 'row', gap: '10@ms', alignItems: 'flex-end' },
  usersHead: {
    borderWidth: 1,
    borderRadius: radius.panel,
    padding: '16@ms',
    gap: '12@ms',
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  addUser: {
    borderWidth: 1,
    borderRadius: radius.control,
    padding: '12@ms',
    gap: '12@ms',
  },
  roleChip: {
    borderWidth: 1,
    borderRadius: radius.chip,
    paddingHorizontal: '8@s',
    paddingVertical: '2@vs',
    alignSelf: 'flex-start',
  },
  userRow: {
    flexDirection: 'row',
    gap: '12@ms',
    padding: '12@ms',
    borderWidth: 1,
    borderRadius: radius.panel,
    alignItems: 'center',
    minHeight: MIN_TOUCH + verticalScale(20),
  },
});
