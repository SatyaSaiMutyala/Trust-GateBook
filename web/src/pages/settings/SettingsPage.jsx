import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormHelperText from '@mui/material/FormHelperText';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { errorMessage } from '../../api/client';
import { usersApi } from '../../api/endpoints';
import { useAuth, useUser } from '../../auth/context';
import { isAdmin, isEmployee, ROLE_LABEL } from '../../auth/roles';
import { PageHeader, Panel } from '../../components/bits';
import { useSettings, useToast } from '../../state/context';
import { CompanyPanel } from './CompanyPanel';
import { EscalationLogPanel } from './EscalationLogPanel';
import { EscalationMatrix } from './EscalationMatrix';
import { HierarchyPanel } from './HierarchyPanel';
import { GenSetup } from './GenSetup';
import { AlertsPanel } from '../../components/PushAlerts';
import { KeysPanel } from './KeysPanel';
import { PatrolSetup } from './PatrolSetup';
import { ListPanel } from './ListPanel';
import { MyDetailsPanel } from './MyDetailsPanel';
import { TermsPanel } from './TermsPanel';
import { UsersPanel } from './UsersPanel';

/** One whole-number setting (overstay hours) with its own Save. */
function NumberPanel({ title, description, current, min, max, unit, label, editable, onSave }) {
  const [value, setValue] = useState(String(current));
  const [synced, setSynced] = useState(current);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  if (current !== synced) {
    setSynced(current);
    setValue(String(current));
  }
  const save = async (e) => {
    e.preventDefault();
    const n = Number(value);
    if (!Number.isInteger(n) || n < min || n > max) {
      setError(`Enter whole ${unit} from ${min} to ${max}.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(n);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel title={title}>
      <Typography variant="body2" sx={{ color: 'text.secondary', mt: -0.5, mb: 1.5 }}>
        {description}
      </Typography>
      <Stack component="form" onSubmit={save} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <TextField
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={!editable}
          error={!!error}
          sx={{ maxWidth: 120 }}
          slotProps={{ htmlInput: { min, max, 'aria-label': label } }}
        />
        <Typography sx={{ fontWeight: 600 }}>{unit}</Typography>
        {editable ? (
          <Button type="submit" variant="contained" color="primary" disabled={busy || value === String(current)}>
            Save
          </Button>
        ) : null}
      </Stack>
      {error ? <FormHelperText error>{error}</FormHelperText> : null}
    </Panel>
  );
}

/** On/off rules that save as soon as they are switched. rows: [settingKey, title, explanation]. */
function RulesPanel({ title, rows }) {
  const { settings, save } = useSettings();
  const toast = useToast();
  const [busy, setBusy] = useState(null);
  const flip = async (key, on) => {
    setBusy(key);
    try {
      await save({ ...settings, [key]: on });
      toast('Saved');
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Panel title={title}>
      <Stack spacing={1.25}>
        {rows.map(([key, label, help]) => (
          <Box key={key}>
            <FormControlLabel
              control={
                <Switch
                  checked={settings[key] !== false}
                  disabled={busy === key}
                  onChange={(e) => flip(key, e.target.checked)}
                />
              }
              label={<Typography sx={{ fontWeight: 600 }}>{label}</Typography>}
            />
            <Typography variant="body2" sx={{ color: 'text.secondary', ml: 6.5, mt: -0.5 }}>
              {help}
            </Typography>
          </Box>
        ))}
      </Stack>
    </Panel>
  );
}

const TABS = [
  ['general', 'General'],
  ['company', 'Company'],
  ['accounts', 'Accounts & hierarchy'],
  ['visitors', 'Visitors'],
  ['terms', 'Terms & confidentiality'],
  ['post', 'Post room'],
  ['material', 'Material passes'],
  ['keys', 'Keys'],
  ['incidents', 'Incidents'],
  ['patrol', 'Patrols'],
  ['gen', 'Generator'],
  ['esclog', 'Escalation log'],
  ['account', 'My account'],
];

/** Everyone, for the org chart, reports-to pickers and matrix previews (admins only). */
function useOrg(enabled) {
  const [org, setOrg] = useState([]);
  const [defs, setDefs] = useState([]);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!enabled) return undefined;
    const ctrl = new AbortController();
    usersApi
      .org(ctrl.signal)
      .then(setOrg)
      .catch(() => {});
    return () => ctrl.abort();
  }, [enabled, nonce]);
  useEffect(() => {
    if (!enabled) return undefined;
    const ctrl = new AbortController();
    usersApi
      .modules(ctrl.signal)
      .then(setDefs)
      .catch(() => {});
    return () => ctrl.abort();
  }, [enabled]);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  return { org, defs, refresh };
}

export function SettingsPage() {
  const user = useUser();
  const { logout } = useAuth();
  const { settings, error, reload, save } = useSettings();
  const toast = useToast();
  const admin = isAdmin(user);
  const [searchParams, setSearchParams] = useSearchParams();
  const { org, defs, refresh: refreshOrg } = useOrg(admin);

  const saveField = (key, label) => async (value) => {
    await save({ ...settings, [key]: value });
    toast(`${label} saved`);
  };

  const signedIn = (
    <Panel title="Signed in">
      <Typography sx={{ fontWeight: 600 }}>
        {user.name} · {ROLE_LABEL[user.role] ?? user.role}
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
        {user.email}
      </Typography>
      <Button variant="outlined" onClick={logout}>
        Sign out
      </Button>
    </Panel>
  );
  const account = (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, md: 7, xl: 5 }}>
        <MyDetailsPanel />
      </Grid>
      <Grid size={{ xs: 12, md: 5, xl: 4 }}>{signedIn}</Grid>
      <Grid size={{ xs: 12, md: 7, xl: 5 }}>
        <AlertsPanel />
      </Grid>
    </Grid>
  );

  // Employees: only their own details.
  if (isEmployee(user)) {
    return (
      <>
        <PageHeader eyebrow={user.name} title="My account" />
        {account}
      </>
    );
  }

  const loading =
    error && !settings ? (
      <Alert severity="error" sx={{ mb: 2 }} action={<Button onClick={reload}>Retry</Button>}>
        {error}
      </Alert>
    ) : !settings ? (
      <Box sx={{ py: 6, display: 'grid', placeItems: 'center' }}>
        <CircularProgress />
      </Box>
    ) : null;

  const lists = (
    <>
      <Grid size={{ xs: 12, md: 6, xl: 4 }}>
        <ListPanel
          title="Departments"
          items={settings?.departments ?? []}
          editable={admin}
          addLabel="Add a department"
          onSave={saveField('departments', 'Departments')}
        />
      </Grid>
      <Grid size={{ xs: 12, md: 6, xl: 4 }}>
        <ListPanel
          title="Purposes"
          items={settings?.purposes ?? []}
          editable={admin}
          addLabel="Add a purpose"
          onSave={saveField('purposes', 'Purposes')}
        />
      </Grid>
      <Grid size={{ xs: 12, md: 6, xl: 4 }}>
        <ListPanel
          title="Types of post"
          description="The quick-pick buttons when security logs incoming post."
          items={settings?.mailKinds ?? []}
          editable={admin}
          addLabel="Add a type"
          onSave={saveField('mailKinds', 'Types of post')}
        />
      </Grid>
    </>
  );

  // Security / viewers: their details and the lists, read-only.
  if (!admin) {
    return (
      <>
        <PageHeader eyebrow={user.name} title="Settings" />
        <Alert severity="warning" sx={{ mb: 2 }}>
          Only admins can change these lists. Security staff see them in the check-in form.
        </Alert>
        {loading ?? (
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6, xl: 4 }}>
              <MyDetailsPanel />
            </Grid>
            {lists}
            <Grid size={{ xs: 12, md: 6, xl: 4 }}>{signedIn}</Grid>
          </Grid>
        )}
      </>
    );
  }

  const tabParam = searchParams.get('tab');
  const tab = TABS.some(([k]) => k === tabParam) ? tabParam : 'general';
  const setTab = (t) =>
    setSearchParams((prev) => {
      const next = new URLSearchParams();
      if (t !== 'general') next.set('tab', t);
      // Keep the users list's own params on the accounts tab.
      if (t === 'accounts') for (const [k, v] of prev) if (k.startsWith('u.')) next.set(k, v);
      return next;
    });
  /** From the org chart: show that person in the users list. */
  const openPerson = (id) => {
    const p = org.find((u) => u.id === id);
    if (!p) return;
    setSearchParams({ tab: 'accounts', 'u.q': p.name });
    setTimeout(() => document.getElementById('users-panel')?.scrollIntoView({ behavior: 'smooth' }), 50);
  };

  let body = null;
  if (settings) {
    if (tab === 'general') {
      body = (
        <Grid container spacing={2}>
          {lists}
          <Grid size={{ xs: 12, md: 6, xl: 4 }}>
            <ListPanel
              title="Designations"
              description="Job-title suggestions when you add or edit a person."
              items={settings.designations ?? []}
              editable
              addLabel="Add a designation"
              onSave={saveField('designations', 'Designations')}
            />
          </Grid>
        </Grid>
      );
    } else if (tab === 'company') {
      body = <CompanyPanel />;
    } else if (tab === 'accounts') {
      body = (
        <Stack spacing={2}>
          <HierarchyPanel org={org} onOpen={openPerson} />
          <Box id="users-panel">
            <UsersPanel org={org} defs={defs} onChanged={refreshOrg} />
          </Box>
        </Stack>
      );
    } else if (tab === 'visitors') {
      body = (
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, lg: 6 }}>
            <RulesPanel
              title="Check-in rules"
              rows={[
                [
                  'visitorPhotoRequired',
                  'Visitor photo is required',
                  'Security cannot check a visitor in without a photo.',
                ],
                ['visitorPassRequired', 'Pass number is required', 'Every visitor must be given a numbered pass card.'],
              ]}
            />
          </Grid>
          <Grid size={{ xs: 12, lg: 6 }}>
            <NumberPanel
              title="Overstay limit"
              description="Visitors inside longer than this are flagged amber, and the overstay escalation below starts."
              current={settings.overstayHours}
              min={1}
              max={24}
              unit="hours"
              label="Overstay hours"
              editable
              onSave={saveField('overstayHours', 'Overstay limit')}
            />
          </Grid>
          <Grid size={{ xs: 12, lg: 6 }}>
            <RulesPanel
              title="Expected visitors"
              rows={[
                [
                  'expectedPreapproved',
                  'New expected visitors are pre-approved by default',
                  'On arrival security sends them in and the host is told, instead of being asked to accept. The person registering can change this for each visitor.',
                ],
              ]}
            />
          </Grid>
          <Grid size={12}>
            <Panel title="Terms & confidentiality agreement">
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1.5}
                sx={{ alignItems: { sm: 'center' }, mt: -0.5 }}
              >
                <Typography variant="body2" sx={{ color: 'text.secondary', flex: 1 }}>
                  Version {settings.terms?.version ?? 1} ·{' '}
                  {settings.terms?.required ? 'visitors must agree at check-in' : 'not required'}.
                </Typography>
                <Button size="small" variant="outlined" onClick={() => setTab('terms')}>
                  Edit terms
                </Button>
              </Stack>
            </Panel>
          </Grid>
          <Grid size={{ xs: 12, lg: 6 }}>
            <EscalationMatrix matrixKey="visitor" org={org} editable />
          </Grid>
          <Grid size={{ xs: 12, lg: 6 }}>
            <EscalationMatrix matrixKey="overstay" org={org} editable />
          </Grid>
        </Grid>
      );
    } else if (tab === 'material') {
      body = (
        <Grid container spacing={2}>
          {[
            ['mpPurposesIn', 'Purposes: material IN', 'Quick picks when material comes in.'],
            ['mpPurposesOut', 'Purposes: material OUT', 'Quick picks when material goes out.'],
            ['mpChallanIn', 'Challans: material IN', 'e.g. Delivery challan, Tax invoice.'],
            ['mpChallanOut', 'Challans: material OUT', 'e.g. Transfer challan, Goods return challan.'],
            ['mpUnits', 'Units', 'Units offered for optional item details.'],
          ].map(([key, title, description]) => (
            <Grid key={key} size={{ xs: 12, md: 6, xl: 4 }}>
              <ListPanel
                title={title}
                description={description}
                items={settings[key] ?? []}
                editable
                addLabel={`Add to ${title.toLowerCase()}`}
                onSave={saveField(key, title)}
              />
            </Grid>
          ))}
          <Grid size={{ xs: 12, lg: 6 }}>
            <RulesPanel
              title="Rules"
              rows={[
                [
                  'mpAuthRequiredOut',
                  'Material going out needs an authorising employee',
                  'Security must enter who approved the material leaving.',
                ],
                [
                  'mpApprovalInApp',
                  'Security-made OUT passes need the employee to approve in TruSentinel',
                  'When security makes an OUT pass naming an employee, the employee gets Approve / Reject. OUT passes employees make themselves are already authorised.',
                ],
                [
                  'mpChallanPhotoRequired',
                  'Photo of the challan is required',
                  'Every pass needs at least one photo of the challan.',
                ],
                [
                  'mpCarrierPhotoRequired',
                  'Photo of a carrier who is not a visitor is required',
                  'Visitors already have their check-in photo.',
                ],
              ]}
            />
          </Grid>
          <Grid size={{ xs: 12, lg: 6 }}>
            <NumberPanel
              title="Default return period"
              description="Pre-fills the expected return date when a pass is marked returnable."
              current={settings.mpReturnDays ?? 7}
              min={1}
              max={365}
              unit="days"
              label="Return days"
              editable
              onSave={saveField('mpReturnDays', 'Return period')}
            />
          </Grid>
          {['mpreceipt', 'mpapproval', 'material'].map((k) => (
            <Grid key={k} size={{ xs: 12, lg: 6 }}>
              <EscalationMatrix matrixKey={k} org={org} editable />
            </Grid>
          ))}
        </Grid>
      );
    } else if (tab === 'keys') {
      body = (
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, lg: 6 }}>
            <KeysPanel />
          </Grid>
          <Grid size={{ xs: 12, lg: 6 }}>
            <Stack spacing={2}>
              <NumberPanel
                title="Default return time"
                description="Pre-fills “Return by” when a key is issued. 0 = no return time (no reminders)."
                current={settings.keyReturnHours ?? 4}
                min={0}
                max={720}
                unit="hours"
                label="Return hours"
                editable
                onSave={saveField('keyReturnHours', 'Key return time')}
              />
              <EscalationMatrix matrixKey="keys" org={org} editable />
            </Stack>
          </Grid>
        </Grid>
      );
    } else if (tab === 'patrol') {
      body = <PatrolSetup org={org} />;
    } else if (tab === 'gen') {
      body = <GenSetup org={org} />;
    } else if (tab === 'incidents') {
      body = (
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 6, xl: 4 }}>
            <ListPanel
              title="Incident types"
              description="The choices when someone reports an incident."
              items={settings.incidentTypes ?? []}
              editable
              addLabel="Add an incident type"
              onSave={saveField('incidentTypes', 'Incident types')}
            />
          </Grid>
          {['incident_critical', 'incident_high', 'incident_medium', 'incident_low'].map((k) => (
            <Grid key={k} size={{ xs: 12, lg: 6 }}>
              <EscalationMatrix matrixKey={k} org={org} editable />
            </Grid>
          ))}
        </Grid>
      );
    } else if (tab === 'terms') {
      body = <TermsPanel />;
    } else if (tab === 'post') {
      body = (
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, lg: 6 }}>
            <RulesPanel
              title="Logging rules"
              rows={[
                [
                  'mailCoverRequired',
                  'Cover photos are required',
                  'Security must photograph the front and back of the cover.',
                ],
                [
                  'mailPersonPhotoRequired',
                  'Delivery person photo is required',
                  'Security must photograph whoever brought it.',
                ],
              ]}
            />
          </Grid>
          <Grid size={{ xs: 12, lg: 6 }}>
            <EscalationMatrix matrixKey="mail" org={org} editable />
          </Grid>
        </Grid>
      );
    } else if (tab === 'esclog') {
      body = <EscalationLogPanel />;
    } else {
      body = account;
    }
  }

  return (
    <>
      <PageHeader eyebrow="Settings" title={TABS.find(([k]) => k === tab)?.[1] ?? 'Settings'} />
      <Tabs
        value={tab}
        onChange={(_, t) => setTab(t)}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        {TABS.map(([k, label]) => (
          <Tab key={k} value={k} label={label} />
        ))}
      </Tabs>
      {tab === 'account' ? account : (loading ?? body)}
    </>
  );
}
