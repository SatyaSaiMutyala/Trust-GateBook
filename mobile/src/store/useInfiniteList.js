import { useCallback, useMemo, useRef, useState } from 'react';
import { useDebounced } from '../state/useDebounced';
import { DEFAULT_PAGE_SIZE } from '../types';
import { errorMessage } from './api';

const EMPTY_PAGINATION = {
  page: 0,
  limit: DEFAULT_PAGE_SIZE,
  total: 0,
  totalPages: 0,
  hasNextPage: false,
  hasPrevPage: false,
};

/**
 * FlatList adapter over an RTK Query infinite-query hook.
 *
 * - `params.q` is debounced 300 ms; any param change restarts at page 1 (new cache entry).
 * - `loadMore` → fetchNextPage while hasNextPage (never twice at once); wire to onEndReached.
 * - `refresh` → refetch page 1 only (pull-to-refresh). Socket tag invalidation refetches every cached page, so
 *   pages the user scrolled to are kept.
 * - Items are flattened and de-duplicated by id; `total` / `extra` (summary, counts, open…) come from the last page.
 *
 * @param {Function} useInfiniteQueryHook e.g. useInsideInfiniteQuery
 * @param {object} params query params except `page`
 * @param {{ skip?: boolean, searchDebounceMs?: number }} [options]
 */
export function useInfiniteList(useInfiniteQueryHook, params, options = {}) {
  const { skip = false, searchDebounceMs = 300 } = options;
  const rawQ = params.q ?? '';
  const debouncedQ = useDebounced(rawQ, searchDebounceMs);
  const restKey = JSON.stringify({ ...params, q: undefined });
  const arg = useMemo(() => {
    const p = { ...JSON.parse(restKey) };
    const q = debouncedQ.trim();
    if (q) p.q = q;
    return p;
  }, [restKey, debouncedQ]);

  const result = useInfiniteQueryHook(arg, { skip });
  const {
    data,
    error,
    isLoading,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
    isError,
  } = result;
  const [refreshing, setRefreshing] = useState(false);
  const [moreError, setMoreError] = useState(null);
  const moreInFlight = useRef(false);

  const pages = useMemo(() => data?.pages ?? [], [data]);
  const items = useMemo(() => {
    const seen = new Set();
    const out = [];
    pages.forEach(pg =>
      (pg?.data ?? []).forEach(it => {
        if (!seen.has(it.id)) {
          seen.add(it.id);
          out.push(it);
        }
      }),
    );
    return out;
  }, [pages]);
  const last = pages.length ? pages[pages.length - 1] : null;
  const pagination = last?.pagination ?? EMPTY_PAGINATION;
  const extra = useMemo(() => {
    if (!last) return {};
    const { data: _d, pagination: _p, ...rest } = last;
    return rest;
  }, [last]);

  const loadMore = useCallback(async () => {
    if (skip || moreInFlight.current || !hasNextPage || isFetching) return;
    moreInFlight.current = true;
    setMoreError(null);
    try {
      const res = await fetchNextPage();
      if (res?.error) setMoreError(errorMessage(res.error));
    } finally {
      moreInFlight.current = false;
    }
  }, [skip, hasNextPage, isFetching, fetchNextPage]);

  const refresh = useCallback(async () => {
    if (skip) return;
    setRefreshing(true);
    try {
      await refetch({ refetchCachedPages: false });
    } finally {
      setRefreshing(false);
    }
  }, [skip, refetch]);

  const retry = useCallback(() => {
    if (moreError) loadMore();
    else refetch();
  }, [moreError, loadMore, refetch]);

  const firstPageError = isError && !items.length ? errorMessage(error) : null;

  return {
    items,
    pagination,
    total: pagination.total,
    extra,
    loading: !skip && isLoading,
    refreshing,
    loadingMore: isFetchingNextPage,
    error: firstPageError,
    moreError,
    loadMore,
    refresh,
    retry,
    searchPending: rawQ !== debouncedQ,
  };
}
