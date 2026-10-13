import { useCallback, useState } from 'react';
import { useDispatch } from 'react-redux';
import {
  api,
  errorMessage,
  useConfirmMailMutation,
  useRemindMailMutation,
} from './api';
import { disputeNoteSet } from './draftsSlice';
import { toastShown } from './uiSlice';

/** "Remind" on a lodged item: `{ remind(item), remindingId }`. */
export function useRemind() {
  const dispatch = useDispatch();
  const [remindMail] = useRemindMailMutation();
  const [remindingId, setRemindingId] = useState(null);
  const remind = useCallback(
    async item => {
      setRemindingId(item.id);
      try {
        const res = await remindMail(item.id).unwrap();
        dispatch(toastShown(`Reminder sent to ${res.item.recipientName}`));
      } catch (e) {
        dispatch(toastShown(errorMessage(e), 'error'));
      } finally {
        setRemindingId(null);
      }
    },
    [dispatch, remindMail],
  );
  return { remind, remindingId };
}

/**
 * Receiver confirmation: `confirm(item, ok, note)`. On a conflict the server sends the current item in
 * `error.item`; it is written into the details cache.
 */
export function useConfirmMail() {
  const dispatch = useDispatch();
  const [confirmMail] = useConfirmMailMutation();
  const [busyId, setBusyId] = useState(null);
  const confirm = useCallback(
    async (item, ok, note) => {
      setBusyId(item.id);
      try {
        await confirmMail({
          id: item.id,
          ok,
          note: note?.trim() || undefined,
        }).unwrap();
        dispatch(disputeNoteSet({ id: item.id, note: '' }));
        dispatch(
          toastShown(
            ok
              ? 'Thank you. Collection confirmed.'
              : 'Security has been told and will contact you.',
          ),
        );
        return true;
      } catch (e) {
        if (e?.item)
          dispatch(api.util.updateQueryData('getMail', item.id, () => e.item));
        dispatch(toastShown(errorMessage(e), 'error'));
        return false;
      } finally {
        setBusyId(null);
      }
    },
    [dispatch, confirmMail],
  );
  return { confirm, busyId };
}
