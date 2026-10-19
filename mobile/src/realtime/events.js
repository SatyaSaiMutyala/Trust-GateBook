import { Vibration } from 'react-native';
import { api, applyNotificationRead, setUnreadCount } from '../store/api';
import { selectIsGateUser, userUpdated } from '../store/authSlice';
import { settingsReceived } from '../store/settingsSlice';
import { issuePulsed, toastShown } from '../store/uiSlice';
import { claimNotice, mailNoticeKey, routeNoticeKey } from '../push/dedupe';

/**
 * Socket.IO → store. Lists are refreshed by invalidating RTK Query tags (batched per 300 ms; infinite queries
 * refetch the pages already loaded, so nothing the user scrolled to is lost); detail caches are patched in place.
 * Form drafts live in their own slice, so live updates never touch a half-filled form.
 */
let pending = new Set();
let timer = null;

function invalidateSoon(dispatch, tags) {
  tags.forEach(t => pending.add(t));
  pending.add('Track');
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

/** visit:created / visit:updated — gate users get every visit, a host only their own visitors. */
export const visitEvent = visit => dispatch => {
  dispatch(api.util.updateQueryData('getVisit', visit.id, () => visit));
  dispatch(api.util.updateQueryData('getMyVisit', visit.id, () => visit));
  invalidateSoon(dispatch, ['Visit', 'Inside', 'Stats', 'MyVisitors']);
};

/** expected:changed — a pre-registration was added, edited, cancelled or arrived (gate + people concerned). */
export const expectedEvent = expected => dispatch => {
  if (!expected) return;
  dispatch(
    api.util.updateQueryData('getExpected', expected.code, () => expected),
  );
  invalidateSoon(dispatch, ['Expected', 'Stats']);
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

/** material:changed — a gate pass was made or moved on: patch it and refresh the lists. */
export const materialEvent = pass => dispatch => {
  if (!pass) return;
  dispatch(api.util.updateQueryData('getMaterial', pass.id, () => pass));
  invalidateSoon(dispatch, ['Material']);
};

/** keys:changed — a key was issued, returned or edited: refresh the board and the diary. */
export const keysEvent = () => dispatch => {
  invalidateSoon(dispatch, ['Keys', 'Stats']);
};

/** patrol:changed / gen:changed — refetch the patrol board / generator status. @param {'Patrol' | 'Gen'} tag */
export const opsEvent = tag => dispatch => {
  invalidateSoon(dispatch, [tag, 'Stats']);
};

/** incident:changed — patch the open incident and refresh the lists. */
export const incidentEvent = incident => dispatch => {
  if (!incident) return;
  dispatch(
    api.util.updateQueryData('getIncident', incident.id, () => incident),
  );
  invalidateSoon(dispatch, ['Incidents', 'Stats']);
};

/** me:updated — an admin changed my modules / profile: tabs and screens follow without signing in again. */
export const meUpdatedEvent = user => dispatch => {
  if (user) dispatch(userUpdated(user));
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
    'MyVisitors',
    'Expected',
    'Material',
    'Keys',
    'Incidents',
    'Patrol',
    'Gen',
    'Mail',
    'MailCounts',
    'Notifications',
    'UnreadCount',
    'Settings',
  ]);
};

/**
 * `notification:new` — a stored inbox notification for me: update the bell, refresh the list, and toast
 * unless the same post item was already announced (socket mail event or foreground push) in the last 5 s.
 */
export const notificationNewEvent =
  ({ notification, unreadCount }) =>
  dispatch => {
    if (typeof unreadCount === 'number') dispatch(setUnreadCount(unreadCount));
    else dispatch(api.util.invalidateTags(['UnreadCount']));
    invalidateSoon(dispatch, ['Notifications']);
    const data = notification?.data;
    const key = data?.id
      ? routeNoticeKey({ type: data.type, id: data.id })
      : `notification:${notification?.id}`;
    if (notification && claimNotice(key)) {
      const text = [notification.title, notification.body]
        .filter(Boolean)
        .join(' · ');
      if (text) dispatch(toastShown(text));
      // A visitor waiting at the gate for my answer, or an alarm escalation step: make it noticeable.
      if (notification.alarm) Vibration.vibrate([0, 500, 200, 500, 200, 500]);
      else if (
        notification.event === 'visit_arrived' ||
        notification.event === 'escalation'
      )
        Vibration.vibrate([0, 300, 150, 300]);
    }
  };

/** `notification:read` — read on another device/tab: mark them read here too and sync the badge. */
export const notificationReadEvent =
  ({ ids, unreadCount }) =>
  (dispatch, getState) => {
    if (ids === 'all' || (Array.isArray(ids) && ids.length))
      applyNotificationRead(dispatch, getState, ids);
    if (typeof unreadCount === 'number') dispatch(setUnreadCount(unreadCount));
  };
