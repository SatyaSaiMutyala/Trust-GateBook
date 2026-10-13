import { makeStore } from '../src/store';
import {
  loggedIn,
  loggedOut,
  selectCanCheckIn,
  selectCanHandleMail,
  selectIsEmployee,
  selectIsGateUser,
  selectIsRecipient,
  userUpdated,
} from '../src/store/authSlice';
import {
  checkInCleared,
  checkInFieldSet,
  checkInPatched,
  disputeNoteSet,
  logMailPatched,
  selectCheckInDraft,
  selectDisputeNote,
  selectLogMailDraft,
} from '../src/store/draftsSlice';
import {
  DEFAULT_SETTINGS,
  selectSettings,
  settingsReceived,
} from '../src/store/settingsSlice';
import {
  issuePulsed,
  selectSheet,
  selectToast,
  sheetClosed,
  sheetOpened,
  toastShown,
} from '../src/store/uiSlice';

const user = (role, extra = {}) => ({
  id: 'u1',
  name: 'Ravi Kumar',
  email: 'r@x',
  role,
  active: true,
  ...extra,
});

describe('auth slice and role selectors', () => {
  test('security can check in and handle mail; is a gate user, not an employee', () => {
    const store = makeStore();
    store.dispatch(loggedIn({ token: 't', user: user('security') }));
    const s = store.getState();
    expect(selectCanCheckIn(s)).toBe(true);
    expect(selectCanHandleMail(s)).toBe(true);
    expect(selectIsGateUser(s)).toBe(true);
    expect(selectIsEmployee(s)).toBe(false);
    expect(selectIsRecipient(s)).toBe(false);
  });

  test('viewer is read-only; isHost makes any user a recipient', () => {
    const store = makeStore();
    store.dispatch(
      loggedIn({ token: 't', user: user('viewer', { isHost: true }) }),
    );
    expect(selectCanCheckIn(store.getState())).toBe(false);
    expect(selectIsGateUser(store.getState())).toBe(true);
    expect(selectIsRecipient(store.getState())).toBe(true);
  });

  test('employee (host) is a recipient without gate access', () => {
    const store = makeStore();
    store.dispatch(loggedIn({ token: 't', user: user('host') }));
    expect(selectIsEmployee(store.getState())).toBe(true);
    expect(selectIsGateUser(store.getState())).toBe(false);
    expect(selectIsRecipient(store.getState())).toBe(true);
  });

  test('userUpdated is ignored after logout', () => {
    const store = makeStore();
    store.dispatch(loggedIn({ token: 't', user: user('admin') }));
    store.dispatch(loggedOut());
    store.dispatch(userUpdated(user('admin')));
    expect(store.getState().auth.user).toBeNull();
  });
});

describe('settings', () => {
  test('settings merge over defaults (older backends without mailKinds)', () => {
    const store = makeStore();
    store.dispatch(
      settingsReceived({ sites: ['North', 'South'], overstayHours: 6 }),
    );
    const s = selectSettings(store.getState());
    expect(s.sites).toEqual(['North', 'South']);
    expect(s.mailKinds).toEqual(DEFAULT_SETTINGS.mailKinds);
    expect(s.overstayHours).toBe(6);
  });
});

describe('drafts survive unrelated updates', () => {
  test('check-in form keeps values across settings updates until cleared', () => {
    const store = makeStore();
    store.dispatch(checkInFieldSet({ key: 'name', value: 'Priya' }));
    store.dispatch(
      checkInPatched({ photoUri: 'file:///p.jpg', form: { badge: '12' } }),
    );
    store.dispatch(settingsReceived({ sites: ['North'] }));
    const d = selectCheckInDraft(store.getState());
    expect(d.form).toMatchObject({ name: 'Priya', badge: '12' });
    expect(d.photoUri).toBe('file:///p.jpg');
    store.dispatch(checkInCleared());
    expect(selectCheckInDraft(store.getState()).form.name).toBe('');
  });

  test('log-mail recipient and dispute notes are stored per draft', () => {
    const store = makeStore();
    store.dispatch(
      logMailPatched({
        recipient: { id: 'h1', name: 'Ravi' },
        form: { recipientText: 'Ravi' },
      }),
    );
    expect(selectLogMailDraft(store.getState()).recipient.id).toBe('h1');
    store.dispatch(disputeNoteSet({ id: 'ML-1', note: 'Not in office' }));
    expect(selectDisputeNote('ML-1')(store.getState())).toBe('Not in office');
  });
});

describe('ui slice', () => {
  test('toasts, sheets and issue pulses', () => {
    const store = makeStore();
    store.dispatch(toastShown('Checked in · GB-1'));
    expect(selectToast(store.getState())).toMatchObject({
      message: 'Checked in · GB-1',
      kind: 'info',
    });
    store.dispatch(sheetOpened({ kind: 'exit', record: { id: 'GB-1' } }));
    expect(selectSheet(store.getState())).toMatchObject({
      kind: 'exit',
      record: { id: 'GB-1' },
    });
    store.dispatch(sheetClosed());
    expect(selectSheet(store.getState())).toBeNull();
    store.dispatch(issuePulsed());
    expect(store.getState().ui.issuePulse).toBe(1);
  });
});
