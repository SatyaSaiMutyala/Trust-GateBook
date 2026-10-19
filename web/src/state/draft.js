import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/** Blank check-in form. */
export const EMPTY_DRAFT = Object.freeze({
  phone: '',
  name: '',
  company: '',
  persons: '1',
  purpose: '',
  /** Text in the "Whom to meet" box (the picked employee's name, or a typed name). */
  host: '',
  /** Employee picked from /api/hosts (asked to accept in the app), or null when the host was typed. */
  hostPick: null,
  /** The Expected entry this check-in comes from (pre-registered visitor), or null. */
  expected: null,
  dept: '',
  idType: 'Aadhaar',
  idLast4: '',
  vehicle: '',
  items: '',
  badge: '',
  notes: '',
  /** The visitor agreed to the terms (Settings → Terms; only asked when required). */
  terms: false,
  /** @type {{ blob: Blob, url: string } | null} */
  photo: null,
  /** @type {{ blob: Blob, url: string } | null} */
  idPhoto: null,
});

/** Blank "Log incoming post" form. */
export const EMPTY_MAIL_DRAFT = Object.freeze({
  kind: '',
  sender: '',
  refNo: '',
  carrier: '',
  broughtBy: '',
  broughtPhone: '',
  pieces: '1',
  /** Picked recipient from /api/hosts, or null when typed free text. */
  recipient: null,
  /** Text in the "For (receiver)" box. */
  recipientText: '',
  dept: '',
  notes: '',
  /** @type {{ blob: Blob, url: string } | null} */
  cover: null,
  /** Back of the cover. @type {{ blob: Blob, url: string } | null} */
  coverBack: null,
  /** @type {{ blob: Blob, url: string } | null} */
  person: null,
});

const isPreview = (v) => !!v && typeof v === 'object' && typeof v.url === 'string' && v.url.startsWith('blob:');
const revoke = (v) => {
  if (isPreview(v)) URL.revokeObjectURL(v.url);
};

/**
 * A form draft kept above the routes, so it survives live updates and navigation.
 * Replaced or cleared photo previews (`{ blob, url }`) have their object URLs released.
 * @template T
 * @param {T} empty
 */
export function useDraftStore(empty) {
  const [draft, setDraft] = useState(empty);
  const [issued, setIssued] = useState(null);
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  });

  const update = useCallback((patch) => {
    const cur = draftRef.current;
    for (const k of Object.keys(patch)) if (cur[k] !== patch[k]) revoke(cur[k]);
    draftRef.current = { ...cur, ...patch };
    setDraft((d) => ({ ...d, ...patch }));
  }, []);

  const reset = useCallback(() => {
    for (const v of Object.values(draftRef.current)) revoke(v);
    draftRef.current = empty;
    setDraft(empty);
  }, [empty]);

  return useMemo(() => ({ draft, update, reset, issued, setIssued }), [draft, update, reset, issued]);
}
