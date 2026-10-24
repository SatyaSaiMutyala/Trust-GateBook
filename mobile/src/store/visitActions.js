import { useCallback, useState } from 'react';
import { useDispatch } from 'react-redux';
import {
  api,
  errorMessage,
  useAllowVisitMutation,
  useRespondVisitMutation,
} from './api';
import { toastShown } from './uiSlice';

/** On a conflict the server sends the current visit in `error.visit`: show it instead of the stale one. */
function patchVisitCaches(dispatch, visit) {
  dispatch(api.util.updateQueryData('getVisit', visit.id, () => visit));
  dispatch(api.util.updateQueryData('getMyVisit', visit.id, () => visit));
}

/**
 * Security lets a visitor in: `allow(visit, viaPhone)` → the updated visit, or null on failure (toast says why).
 * `viaPhone` = confirmed with the host by phone (host not on TruSentinel, or no reply in the app).
 */
export function useAllowVisit() {
  const dispatch = useDispatch();
  const [allowVisit] = useAllowVisitMutation();
  const [busyId, setBusyId] = useState(null);
  const allow = useCallback(
    async (visit, viaPhone = false) => {
      setBusyId(visit.id);
      try {
        const res = await allowVisit({ id: visit.id, viaPhone }).unwrap();
        patchVisitCaches(dispatch, res.visit);
        dispatch(toastShown(`${res.visit.name} allowed in`));
        return res.visit;
      } catch (e) {
        if (e?.visit) patchVisitCaches(dispatch, e.visit);
        dispatch(toastShown(errorMessage(e), 'error'));
        return null;
      } finally {
        setBusyId(null);
      }
    },
    [allowVisit, dispatch],
  );
  return { allow, busyId };
}

/** The visited host answers: `respond(visit, 'accepted' | 'declined', note)` → updated visit or null. */
export function useRespondVisit() {
  const dispatch = useDispatch();
  const [respondVisit] = useRespondVisitMutation();
  const [busyId, setBusyId] = useState(null);
  const respond = useCallback(
    async (visit, status, note) => {
      setBusyId(visit.id);
      try {
        const res = await respondVisit({
          id: visit.id,
          status,
          note: note?.trim() || undefined,
        }).unwrap();
        patchVisitCaches(dispatch, res.visit);
        dispatch(
          toastShown(
            status === 'accepted'
              ? `Accepted. Security will send ${res.visit.name} in.`
              : 'Declined. Security has been told.',
          ),
        );
        return res.visit;
      } catch (e) {
        if (e?.visit) patchVisitCaches(dispatch, e.visit);
        dispatch(toastShown(errorMessage(e), 'error'));
        return null;
      } finally {
        setBusyId(null);
      }
    },
    [dispatch, respondVisit],
  );
  return { respond, busyId };
}
