import { useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { selectSettings } from './settingsSlice';
import { sheetOpened, toastShown } from './uiSlice';

export const useAppDispatch = useDispatch;
export const useAppSelector = useSelector;

/** Current Settings (merged with defaults). */
export function useSettings() {
  return useSelector(selectSettings);
}

/** `toast.show(message, kind?)` dispatches to the ui slice. */
export function useToast() {
  const dispatch = useDispatch();
  return useMemo(
    () => ({ show: (message, kind) => dispatch(toastShown(message, kind)) }),
    [dispatch],
  );
}

/** Open the Exit / Handover / Resolve bottom sheets (rendered once by SheetHost). */
export function useSheets() {
  const dispatch = useDispatch();
  return useMemo(
    () => ({
      openExit: visit => dispatch(sheetOpened({ kind: 'exit', record: visit })),
      openHandover: item =>
        dispatch(sheetOpened({ kind: 'handover', record: item })),
      openResolve: item =>
        dispatch(sheetOpened({ kind: 'resolve', record: item })),
    }),
    [dispatch],
  );
}
