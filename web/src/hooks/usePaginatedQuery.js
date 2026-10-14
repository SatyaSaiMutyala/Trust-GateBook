import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../api/client';
import { EMPTY_PAGINATION } from '../types';

/** @typedef {import('../types').Pagination} Pagination */

const byId = (items) => {
  const seen = new Set();
  return items.filter((x) => {
    if (seen.has(x.id)) return false;
    seen.add(x.id);
    return true;
  });
};

/**
 * Fetch one page of a paginated list endpoint (`{ data, pagination, ...extra }`).
 *
 * - `params` → request; changing them refetches and aborts the stale request.
 * - `append: true` (phone "Load more" lists): `params.page` is ignored, page 1 is loaded and
 *   `loadMore()` appends the next page. `refresh()` reloads page 1 without dropping pages the
 *   user already scrolled to.
 * - `patch(item, keep)` updates an already-loaded item in place (or removes it when `keep` is false).
 *
 * @template T
 * @param {(params: Record<string, any>, signal: AbortSignal) => Promise<{ data: T[], pagination: Pagination }>} fetcher
 * @param {Record<string, any>} params
 * @param {{ append?: boolean, enabled?: boolean }} [options]
 */
export function usePaginatedQuery(fetcher, params, { append = false, enabled = true } = {}) {
  const key = JSON.stringify(params);
  const fetcherRef = useRef(fetcher);
  const paramsRef = useRef(params);
  useEffect(() => {
    fetcherRef.current = fetcher;
    paramsRef.current = params;
  });

  const [state, setState] = useState({
    key: /** @type {string | null} */ (null),
    data: /** @type {T[]} */ ([]),
    pagination: /** @type {Pagination} */ (EMPTY_PAGINATION),
    extra: /** @type {Record<string, any>} */ ({}),
    error: /** @type {string | null} */ (null),
    loadingMore: false,
    refreshing: false,
  });
  const ctrlRef = useRef(/** @type {AbortController | null} */ (null));
  const seqRef = useRef(0);

  /** @param {'replace' | 'append' | 'refresh'} mode */
  const run = useCallback(
    (mode, page) => {
      ctrlRef.current?.abort();
      const ctrl = new AbortController();
      ctrlRef.current = ctrl;
      const seq = ++seqRef.current;
      const p = { ...paramsRef.current, page };
      const runKey = JSON.stringify(paramsRef.current);
      fetcherRef
        .current(p, ctrl.signal)
        .then((res) => {
          if (seq !== seqRef.current) return;
          const { data, pagination, ...extra } = res;
          setState((s) => {
            let next = data;
            let pg = pagination;
            if (mode === 'append') {
              next = byId([...s.data, ...data]);
            } else if (mode === 'refresh' && append && s.key === runKey && s.pagination.page > 1) {
              // Fresh first page + the later pages already on screen (minus anything now on page 1).
              const ids = new Set(data.map((x) => x.id));
              const later = s.data.slice(pagination.limit).filter((x) => !ids.has(x.id));
              next = byId([...data, ...later]);
              pg = { ...pagination, page: s.pagination.page, hasNextPage: next.length < pagination.total };
            }
            return {
              key: runKey,
              data: next,
              pagination: pg,
              extra,
              error: null,
              loadingMore: false,
              refreshing: false,
            };
          });
        })
        .catch((err) => {
          if (ctrl.signal.aborted || seq !== seqRef.current) return;
          setState((s) => ({ ...s, key: runKey, error: errorMessage(err), loadingMore: false, refreshing: false }));
        });
    },
    [append],
  );

  useEffect(() => {
    if (!enabled) return;
    run('replace', append ? 1 : (paramsRef.current.page ?? 1));
    return () => ctrlRef.current?.abort();
  }, [key, enabled, append, run]);

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  const loadMore = useCallback(() => {
    const s = stateRef.current;
    if (!s.pagination.hasNextPage || s.loadingMore) return;
    stateRef.current = { ...s, loadingMore: true };
    setState((prev) => ({ ...prev, loadingMore: true }));
    run('append', s.pagination.page + 1);
  }, [run]);

  const refresh = useCallback(() => {
    setState((s) => ({ ...s, refreshing: true }));
    run('refresh', append ? 1 : (paramsRef.current.page ?? 1));
  }, [run, append]);

  /** Replace an already-loaded item in place, or drop it when `keep` is false. */
  const patch = useCallback((item, keep = true) => {
    setState((s) => {
      const idx = s.data.findIndex((x) => x.id === item.id);
      if (idx === -1) return s;
      const data = keep ? s.data.map((x) => (x.id === item.id ? item : x)) : s.data.filter((x) => x.id !== item.id);
      const pagination = keep ? s.pagination : { ...s.pagination, total: Math.max(0, s.pagination.total - 1) };
      return { ...s, data, pagination };
    });
  }, []);

  /** Put a new item at the top (realtime "new" events); ignored if already loaded. */
  const prepend = useCallback((item) => {
    setState((s) => {
      if (s.data.some((x) => x.id === item.id)) return s;
      return { ...s, data: [item, ...s.data], pagination: { ...s.pagination, total: s.pagination.total + 1 } };
    });
  }, []);

  /** Transform every loaded item (e.g. mark several read). */
  const mapData = useCallback((fn) => {
    setState((s) => ({ ...s, data: s.data.map(fn) }));
  }, []);

  const loading = enabled && state.key !== key;
  return {
    data: loading && state.key === null ? [] : state.data,
    pagination: state.pagination,
    extra: state.extra,
    error: state.error,
    /** First load, or params changed and the new page has not arrived yet. */
    loading,
    loadingMore: state.loadingMore,
    refreshing: state.refreshing,
    loadMore,
    refresh,
    patch,
    prepend,
    mapData,
  };
}
