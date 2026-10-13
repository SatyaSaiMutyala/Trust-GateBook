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
  },
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
  coverUri: null,
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
    },
    checkInCleared(state) {
      state.checkIn = EMPTY_CHECK_IN;
    },
    logMailFieldSet(state, action) {
      state.logMail.form[action.payload.key] = action.payload.value;
    },
    logMailPatched(state, action) {
      Object.assign(state.logMail.form, action.payload.form ?? {});
      ['recipient', 'coverUri', 'personUri'].forEach(k => {
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
