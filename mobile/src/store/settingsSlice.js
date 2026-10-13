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
