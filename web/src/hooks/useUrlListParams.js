import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';

export const PAGE_SIZES = [10, 20, 50, 100];

/**
 * Keep a list's page / limit / q / sort / filters in the browser URL, so reload, back and shared
 * links restore the same view.
 *
 * - `defaults` lists every param the list uses (`page`, `limit`, `q`, `sort`, filters). Values equal
 *   to their default are left out of the URL. Numbers in `defaults` are parsed back as numbers.
 * - Any change other than `page` resets `page` to 1.
 * - `search` / `setSearch` drive a search box: typing is local and committed to `q` after 300 ms.
 * - `prefix` namespaces the keys when a page hosts several lists (e.g. `u.` for users).
 *
 * @template {Record<string, string | number>} D
 * @param {D} defaults
 * @param {{ prefix?: string, debounceMs?: number }} [options]
 */
export function useUrlListParams(defaults, { prefix = '', debounceMs = 300 } = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const defaultsKey = JSON.stringify(defaults);

  /** @type {D} */
  const params = useMemo(() => {
    const d = JSON.parse(defaultsKey);
    const out = { ...d };
    for (const k of Object.keys(d)) {
      const raw = searchParams.get(prefix + k);
      if (raw === null) continue;
      if (typeof d[k] === 'number') {
        const n = Number(raw);
        if (Number.isFinite(n) && n >= 1) out[k] = Math.floor(n);
      } else out[k] = raw;
    }
    if (out.limit !== undefined && !PAGE_SIZES.includes(out.limit)) out.limit = d.limit;
    return out;
  }, [searchParams, defaultsKey, prefix]);

  /** @param {Partial<D>} patch */
  const setParams = useCallback(
    (patch, { replace = false } = {}) => {
      const d = JSON.parse(defaultsKey);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          const resetPage = Object.keys(patch).some((k) => k !== 'page') && !('page' in patch);
          const all = resetPage ? { ...patch, page: 1 } : patch;
          for (const [k, v] of Object.entries(all)) {
            if (!(k in d)) continue;
            if (v === undefined || v === null || v === '' || String(v) === String(d[k])) next.delete(prefix + k);
            else next.set(prefix + k, String(v));
          }
          return next;
        },
        { replace },
      );
    },
    [setSearchParams, defaultsKey, prefix],
  );

  // Debounced search box bound to `q`.
  const urlQ = 'q' in params ? String(params.q ?? '') : '';
  const [search, setSearchState] = useState(urlQ);
  const [syncedQ, setSyncedQ] = useState(urlQ);
  if (urlQ !== syncedQ) {
    // The URL changed underneath us (back/forward, link): show it in the box.
    setSyncedQ(urlQ);
    setSearchState(urlQ);
  }
  const timer = useRef(/** @type {ReturnType<typeof setTimeout> | null} */ (null));
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const setSearch = useCallback(
    (value) => {
      setSearchState(value);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const q = value.trim();
        setSyncedQ(q);
        setParams({ q }, { replace: true });
      }, debounceMs);
    },
    [setParams, debounceMs],
  );

  const setPage = useCallback((page) => setParams({ page }), [setParams]);
  const setLimit = useCallback((limit) => setParams({ limit }), [setParams]);
  const setSort = useCallback((sort) => setParams({ sort }), [setParams]);

  return { params, setParams, search, setSearch, setPage, setLimit, setSort };
}

/**
 * Toggle a sort field the way table headers do: field asc → field desc → field asc.
 * @param {string} current e.g. "-inAt"
 * @param {string} field e.g. "inAt"
 * @param {'asc' | 'desc'} [firstDir]
 */
export function nextSort(current, field, firstDir = 'asc') {
  const active = current.replace(/^-/, '') === field;
  if (!active) return firstDir === 'desc' ? `-${field}` : field;
  return current.startsWith('-') ? field : `-${field}`;
}
