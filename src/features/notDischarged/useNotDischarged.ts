import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchCasePage, fetchLatestTracking } from './api';
import { errorMessage } from './format';
import type { CasePage, CaseQuery } from './types';

const pageKey = (queryKey: string, page: number) => `${queryKey}#${page}`;

/**
 * Server-side paged list of not-discharged cases.
 *
 * - Dataverse pages by skipToken, so page N is fetched with the token returned by page N-1.
 * - Every loaded page is cached per query, so going back is instant with no request.
 * - The next page is prefetched in the background once the current one is on screen.
 * - Results are stored under the query+page they were requested for, so a slow, outdated
 *   response can never replace what the user is looking at now.
 * - Changing search, region, risk, sort or page size produces a new query key, which starts at page 1.
 */
export function useNotDischarged(query: CaseQuery) {
  const risksKey = [...query.risks].sort().join(',');
  const stableQuery = useMemo<CaseQuery>(
    () => ({
      search: query.search.trim(),
      region: query.region,
      risks: risksKey ? (risksKey.split(',') as CaseQuery['risks']) : [],
      entity: query.entity,
      payer: query.payer,
      flag: query.flag,
      discharged: query.discharged,
      alert: query.alert,
      caseStatus: query.caseStatus,
      sort: query.sort,
      pageSize: query.pageSize,
    }),
    [query.search, query.region, risksKey, query.entity, query.payer, query.flag, query.discharged, query.alert, query.caseStatus, query.sort, query.pageSize],
  );
  const queryKey = useMemo(() => JSON.stringify(stableQuery), [stableQuery]);

  // Page is tied to the query key: a new key starts at page 0 without an extra render pass.
  const [pageState, setPageState] = useState({ queryKey, page: 0 });
  const page = pageState.queryKey === queryKey ? pageState.page : 0;

  const [cache, setCache] = useState<ReadonlyMap<string, CasePage>>(() => new Map());
  const [errors, setErrors] = useState<ReadonlyMap<string, string>>(() => new Map());
  const [shownKey, setShownKey] = useState<string>();
  /** Bumped by reload() so the page on screen is requested again. */
  const [version, setVersion] = useState(0);

  const loaded = useRef(new Map<string, CasePage>());
  const inflight = useRef(new Map<string, Promise<CasePage | undefined>>());
  const requestedKey = useRef<string>('');
  /** Pages whose SLA tracking was already requested. */
  const trackingRequested = useRef(new Set<string>());

  const store = useCallback((key: string, entry: CasePage) => {
    loaded.current.set(key, entry);
    setCache((prev) => new Map(prev).set(key, entry));
  }, []);

  const loadTracking = useCallback(
    (key: string, entry: CasePage) => {
      fetchLatestTracking(entry.rows.map((r) => r.id))
        .then((tracking) => store(key, { ...(loaded.current.get(key) ?? entry), tracking, trackingError: undefined }))
        .catch((err: unknown) =>
          store(key, {
            ...(loaded.current.get(key) ?? entry),
            tracking: {},
            trackingError: errorMessage(err, 'Could not load SLA tracking.'),
          }),
        );
    },
    [store],
  );

  const ensurePage = useCallback(
    (qKey: string, q: CaseQuery, p: number): Promise<CasePage | undefined> => {
      const key = pageKey(qKey, p);
      const done = loaded.current.get(key);
      if (done) return Promise.resolve(done);
      const running = inflight.current.get(key);
      if (running) return running;

      let token: string | undefined;
      if (p > 0) {
        token = loaded.current.get(pageKey(qKey, p - 1))?.nextToken;
        if (!token) return Promise.resolve(undefined); // previous page unknown or it was the last page
      }

      const request = fetchCasePage(q, token)
        .then((result) => {
          // Show the cases right away; tracking fills in when its own request returns.
          const entry: CasePage = { ...result, tracking: undefined };
          store(key, entry);
          return entry;
        })
        .catch((err: unknown) => {
          setErrors((prev) => new Map(prev).set(key, errorMessage(err, 'Something went wrong while loading cases.')));
          return undefined;
        })
        .finally(() => inflight.current.delete(key));
      inflight.current.set(key, request);
      return request;
    },
    [store],
  );

  const currentKey = pageKey(queryKey, page);
  const currentError = errors.get(currentKey);

  useEffect(() => {
    if (currentError) return;
    requestedKey.current = currentKey;
    ensurePage(queryKey, stableQuery, page).then((result) => {
      if (!result || requestedKey.current !== currentKey) return; // user has moved on
      setShownKey(currentKey);
      // SLA tracking is read only for the page actually shown, once.
      if (!result.tracking && !trackingRequested.current.has(currentKey)) {
        trackingRequested.current.add(currentKey);
        loadTracking(currentKey, result);
      }
      if (result.nextToken) void ensurePage(queryKey, stableQuery, page + 1); // background prefetch (cases only)
    });
  }, [currentKey, currentError, ensurePage, loadTracking, page, queryKey, stableQuery, version]);

  const current = cache.get(currentKey);
  // While the requested page loads, keep the last page on screen instead of flashing empty.
  const visible = current ?? (shownKey ? cache.get(shownKey) : undefined);

  // Token paging is sequential: every loaded page is reachable, plus the one right after the last.
  let lastLoaded = -1;
  while (cache.has(pageKey(queryKey, lastLoaded + 1))) lastLoaded++;
  const reachablePages =
    lastLoaded < 0 ? 1 : lastLoaded + 1 + (cache.get(pageKey(queryKey, lastLoaded))?.nextToken ? 1 : 0);

  const goToPage = useCallback((p: number) => setPageState({ queryKey, page: Math.max(0, p) }), [queryKey]);

  const retry = useCallback(() => {
    setErrors((prev) => {
      const next = new Map(prev);
      next.delete(currentKey);
      return next;
    });
  }, [currentKey]);

  /**
   * Forgets every loaded page and reads the list again from page 1, e.g. after a case's status
   * changed (it can move the case in or out of the current filter). The old page stays on screen
   * until the new one arrives.
   */
  const reload = useCallback(() => {
    loaded.current.clear();
    inflight.current.clear();
    trackingRequested.current.clear();
    setPageState({ queryKey, page: 0 });
    setVersion((v) => v + 1);
  }, [queryKey]);

  /** Re-reads SLA tracking for the page on screen (1 request), e.g. after a decision is saved. */
  const refreshTracking = useCallback(() => {
    const entry = loaded.current.get(currentKey);
    if (entry) loadTracking(currentKey, entry);
  }, [currentKey, loadTracking]);

  return {
    page,
    rows: visible?.rows,
    tracking: visible?.tracking,
    trackingPending: Boolean(visible) && !visible?.tracking,
    trackingError: visible?.trackingError,
    /** Server total when the query returns one (alert filter mode); otherwise undefined. */
    total: current?.total ?? cache.get(pageKey(queryKey, 0))?.total,
    reachablePages,
    hasPrevious: page > 0,
    hasNext: Boolean(current?.nextToken),
    /** True until the requested page is on screen (the previous one stays visible meanwhile). */
    isLoading: !current && !currentError,
    /** True only for the very first load of a query: nothing to show yet. */
    isInitialLoad: !visible && !currentError,
    error: currentError,
    goToPage,
    retry,
    reload,
    refreshTracking,
  };
}
