import { createSlice } from '@reduxjs/toolkit';

export const DEFAULT_SETTINGS = {
  sites: ['Main Gate'],
  departments: [
    'Administration',
    'Accounts',
    'HR',
    'Laboratory',
    'Sales',
    'Marketing',
    'Procurement',
    'Logistics',
    'IT',
    'Other',
  ],
  purposes: [
    'Meeting',
    'Delivery',
    'Vendor / Service',
    'Interview',
    'Sample pickup',
    'Customer',
    'Government / Audit',
    'Other',
  ],
  mailKinds: [
    'Registered post',
    'Speed post',
    'Courier',
    'Letter',
    'Parcel',
    'Documents',
    'Cheque / DD',
    'Other',
  ],
  overstayHours: 4,
  hostReplyMinutes: 5,
  expectedPreapproved: true,
  designations: [
    'Security guard',
    'Security supervisor',
    'Security manager',
    'Facility manager',
    'Department head',
    'Manager',
    'Executive',
    'Director',
  ],
  visitorPhotoRequired: true,
  visitorPassRequired: true,
  mailCoverRequired: true,
  mailPersonPhotoRequired: true,
  company: { name: '', legalName: '', logoUrl: null },
  esc: { visitor: [], overstay: [], mail: [] },
  terms: { required: false, company: '', title: '', body: '', version: 1 },
  mpUnits: [
    'Nos',
    'Box',
    'Carton',
    'Set',
    'Kg',
    'Litre',
    'Metre',
    'Packet',
    'Roll',
    'Bag',
  ],
  mpPurposesIn: [],
  mpPurposesOut: [],
  mpChallanIn: [],
  mpChallanOut: [],
  mpAuthRequiredOut: true,
  mpApprovalInApp: true,
  mpChallanPhotoRequired: true,
  mpCarrierPhotoRequired: true,
  mpReturnDays: 7,
  keyReturnHours: 4,
  incidentTypes: [
    'Theft / missing item',
    'Trespass / unauthorised entry',
    'Suspicious person or object',
    'Fire / smoke',
    'Medical emergency',
    'Fight / misconduct',
    'Property damage',
    'Power failure',
    'Water leak',
    'Lift / equipment fault',
    'Vehicle / parking',
    'Other',
  ],
};

/** Latest Settings (from GET/PUT /api/settings and `settings:updated`), merged over the defaults. */
const settingsSlice = createSlice({
  name: 'settings',
  initialState: { value: DEFAULT_SETTINGS, loaded: false },
  reducers: {
    settingsReceived(state, action) {
      state.value = { ...DEFAULT_SETTINGS, ...action.payload };
      state.loaded = true;
    },
  },
});

export const { settingsReceived } = settingsSlice.actions;
export default settingsSlice.reducer;

export const selectSettings = s => s.settings.value;
export const selectSettingsLoaded = s => s.settings.loaded;
