import { createSlice } from '@reduxjs/toolkit';

/**
 * Transient UI: the current toast, the open bottom sheet (exit / handover / resolve) and the issue-alert pulse.
 * Sheets hold a plain copy of the record they act on.
 */
const uiSlice = createSlice({
  name: 'ui',
  initialState: { toast: null, sheet: null, issuePulse: 0, seq: 0 },
  reducers: {
    toastShown: {
      reducer(state, action) {
        state.seq += 1;
        state.toast = { ...action.payload, id: state.seq };
      },
      prepare(message, kind = 'info') {
        return { payload: { message, kind } };
      },
    },
    toastDismissed(state, action) {
      if (!action.payload || state.toast?.id === action.payload)
        state.toast = null;
    },
    sheetOpened(state, action) {
      state.seq += 1;
      state.sheet = { ...action.payload, key: state.seq }; // { kind: 'exit'|'handover'|'resolve', record }
    },
    sheetClosed(state) {
      state.sheet = null;
    },
    issuePulsed(state) {
      state.issuePulse += 1;
    },
  },
});

export const {
  toastShown,
  toastDismissed,
  sheetOpened,
  sheetClosed,
  issuePulsed,
} = uiSlice.actions;
export default uiSlice.reducer;

export const selectToast = s => s.ui.toast;
export const selectSheet = s => s.ui.sheet;
export const selectIssuePulse = s => s.ui.issuePulse;
