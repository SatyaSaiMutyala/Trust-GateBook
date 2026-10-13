import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { selectSheet, sheetClosed } from '../store/uiSlice';
import { ExitSheet } from './ExitSheet';
import { HandoverSheet, ResolveSheet } from './MailSheets';

/** Renders whichever bottom sheet `ui.sheet` names (exit / handover / resolve). */
export function SheetHost() {
  const dispatch = useDispatch();
  const sheet = useSelector(selectSheet);
  if (!sheet) return null;
  const close = () => dispatch(sheetClosed());
  if (sheet.kind === 'exit')
    return <ExitSheet key={sheet.key} visit={sheet.record} onClose={close} />;
  if (sheet.kind === 'handover')
    return (
      <HandoverSheet key={sheet.key} item={sheet.record} onClose={close} />
    );
  if (sheet.kind === 'resolve')
    return <ResolveSheet key={sheet.key} item={sheet.record} onClose={close} />;
  return null;
}
