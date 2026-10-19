import { createSlice } from '@reduxjs/toolkit';

export const EMPTY_CHECK_IN = {
  form: {
    phone: '',
    name: '',
    company: '',
    persons: '1',
    purpose: '',
    host: '',
    dept: '',
    idType: 'Aadhaar',
    idLast4: '',
    vehicle: '',
    items: '',
    notes: '',
    badge: '',
    // The visitor agreed to the terms (asked only when Settings → Terms requires it).
    terms: false,
  },
  // Employee picked from /api/hosts { id, name, dept, location } — asked to accept in the app.
  // null when "Whom to meet" was typed (security confirms by phone).
  hostPick: null,
  // The pre-registration this check-in was filled from (sent as expectedId), or null.
  expected: null,
  photoUri: null,
  idPhotoUri: null,
};

export const EMPTY_LOG_MAIL = {
  form: {
    kind: '',
    sender: '',
    refNo: '',
    carrier: '',
    broughtBy: '',
    broughtPhone: '',
    pieces: '1',
    recipientText: '',
    dept: '',
    notes: '',
  },
  recipient: null, // picked Host { id, name, dept, location }
  coverUri: null, // cover — front (address label side)
  coverBackUri: null, // cover — back
  personUri: null,
};

/**
 * Half-filled forms (Check in, Log incoming post) live here so they survive navigation, gate changes and
 * live socket updates; only Clear or a successful submit resets them. Also the per-item dispute notes on My post.
 */
const draftsSlice = createSlice({
  name: 'drafts',
  initialState: {
    checkIn: EMPTY_CHECK_IN,
    logMail: EMPTY_LOG_MAIL,
    disputeNotes: {},
  },
  reducers: {
    checkInFieldSet(state, action) {
      state.checkIn.form[action.payload.key] = action.payload.value;
    },
    checkInPatched(state, action) {
      Object.assign(state.checkIn.form, action.payload.form ?? {});
      if ('photoUri' in action.payload)
        state.checkIn.photoUri = action.payload.photoUri;
      if ('idPhotoUri' in action.payload)
        state.checkIn.idPhotoUri = action.payload.idPhotoUri;
      if ('hostPick' in action.payload)
        state.checkIn.hostPick = action.payload.hostPick;
      if ('expected' in action.payload)
        state.checkIn.expected = action.payload.expected;
    },
    checkInCleared(state) {
      state.checkIn = EMPTY_CHECK_IN;
    },
    logMailFieldSet(state, action) {
      state.logMail.form[action.payload.key] = action.payload.value;
    },
    logMailPatched(state, action) {
      Object.assign(state.logMail.form, action.payload.form ?? {});
      ['recipient', 'coverUri', 'coverBackUri', 'personUri'].forEach(k => {
        if (k in action.payload) state.logMail[k] = action.payload[k];
      });
    },
    logMailCleared(state) {
      state.logMail = EMPTY_LOG_MAIL;
    },
    disputeNoteSet(state, action) {
      state.disputeNotes[action.payload.id] = action.payload.note;
    },
  },
});

export const {
  checkInFieldSet,
  checkInPatched,
  checkInCleared,
  logMailFieldSet,
  logMailPatched,
  logMailCleared,
  disputeNoteSet,
} = draftsSlice.actions;
export default draftsSlice.reducer;

export const selectCheckInDraft = s => s.drafts.checkIn;
export const selectLogMailDraft = s => s.drafts.logMail;
export const selectDisputeNote = id => s => s.drafts.disputeNotes[id] ?? '';
