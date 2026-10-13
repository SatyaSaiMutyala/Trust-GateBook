import { CheckInDraftContext, MailDraftContext } from './context';
import { EMPTY_DRAFT, EMPTY_MAIL_DRAFT, useDraftStore } from './draft';

/** Half-filled check-in form, kept above the routes. */
export function CheckInDraftProvider({ children }) {
  const value = useDraftStore(EMPTY_DRAFT);
  return <CheckInDraftContext.Provider value={value}>{children}</CheckInDraftContext.Provider>;
}

/** Half-filled "Log incoming post" form, kept above the routes. */
export function MailDraftProvider({ children }) {
  const value = useDraftStore(EMPTY_MAIL_DRAFT);
  return <MailDraftContext.Provider value={value}>{children}</MailDraftContext.Provider>;
}
