import { Vibration } from 'react-native';
import { api } from '../store/api';
import { selectIsGateUser } from '../store/authSlice';
import { settingsReceived } from '../store/settingsSlice';
import { issuePulsed, toastShown } from '../store/uiSlice';
import { claimNotice, mailNoticeKey } from '../push/dedupe';

/**
 * Socket.IO → store. Lists are refreshed by invalidating RTK Query tags (batched per 300 ms; infinite queries
 * refetch the pages already loaded, so nothing the user scrolled to is lost); detail caches are patched in place.
 * Form drafts live in their own slice, so live updates never touch a half-filled form.
 */
let pending = new Set();
let timer = null;

function invalidateSoon(dispatch, tags) {
  tags.forEach(t => pending.add(t));
  if (timer) return;
  timer = setTimeout(() => {
    const list = [...pending];
    pending = new Set();
    timer = null;
    dispatch(api.util.invalidateTags(list));
  }, 300);
}

/** For tests. */
export function flushRealtimeBatch(dispatch) {
  if (timer) clearTimeout(timer);
  timer = null;
  const list = [...pending];
  pending = new Set();
  if (list.length) dispatch(api.util.invalidateTags(list));
}

export const visitEvent = visit => dispatch => {
  dispatch(api.util.updateQueryData('getVisit', visit.id, () => visit));
  invalidateSoon(dispatch, ['Visit', 'Inside', 'Stats']);
};

export const mailEvent = (type, item) => (dispatch, getState) => {
  dispatch(api.util.updateQueryData('getMail', item.id, () => item));
  invalidateSoon(dispatch, ['Mail', 'MailCounts']);
  const state = getState();
  const me = state.auth.user;
  if (
    type === 'created' &&
    item.recipient &&
    me &&
    item.recipient.id === me.id &&
    claimNotice(mailNoticeKey(item.id)) // FCM may announce the same item
  ) {
    dispatch(toastShown(`${item.kind} for you from ${item.sender}`));
    Vibration.vibrate(400);
  }
  if (
    type === 'updated' &&
    item.status === 'disputed' &&
    selectIsGateUser(state) &&
    claimNotice(mailNoticeKey(item.id))
  ) {
    dispatch(
      toastShown(
        `${
          item.recipientName
        } says they did not get the ${item.kind.toLowerCase()} from ${
          item.sender
        }`,
        'error',
      ),
    );
    dispatch(issuePulsed());
  }
};

export const mailReminderEvent = item => dispatch => {
  dispatch(api.util.updateQueryData('getMail', item.id, () => item));
  if (!claimNotice(mailNoticeKey(item.id))) return;
  dispatch(
    toastShown(
      `Reminder: ${item.kind} from ${item.sender} is waiting for you at the gate`,
    ),
  );
  Vibration.vibrate([0, 300, 150, 300]);
};

export const settingsEvent = settings => dispatch => {
  dispatch(settingsReceived(settings));
  invalidateSoon(dispatch, ['Settings']);
};

/** After a reconnect, anything may have been missed. */
export const reconnected = () => dispatch => {
  invalidateSoon(dispatch, [
    'Visit',
    'Inside',
    'Stats',
    'Mail',
    'MailCounts',
    'Settings',
  ]);
};
