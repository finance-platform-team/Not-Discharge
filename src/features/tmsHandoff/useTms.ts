import { useCallback, useEffect, useState } from 'react';
import { fetchTmsCounts, fetchTmsPage, type CardKey, type TmsFilters, type TmsQuery, type TmsRow } from './api';
import { errorMessage } from '../notDischarged/format';

type PageResult = { key: string; rows?: TmsRow[]; total?: number; hasMore: boolean; error?: string };

/**
 * The page on screen. Results are tagged with the query they answer, so loading is simply
 * "the last result is for another query", and a response that arrives late is ignored.
 * The previous page stays on screen while the next one loads.
 */
export function useTmsPage(query: TmsQuery) {
  const [version, setVersion] = useState(0);
  const { search, startDate, dueDate, card, page, pageSize } = query;
  const key = JSON.stringify([search, startDate, dueDate, card, page, pageSize, version]);
  const [result, setResult] = useState<PageResult>({ key: '', hasMore: false });

  useEffect(() => {
    let live = true;
    const k = JSON.stringify([search, startDate, dueDate, card, page, pageSize, version]);
    fetchTmsPage({ search, startDate, dueDate, card, page, pageSize })
      .then((res) => live && setResult({ key: k, ...res }))
      .catch((err: unknown) => live && setResult((prev) => ({ ...prev, key: k, error: errorMessage(err, 'Could not load TMS tasks.') })));
    return () => {
      live = false;
    };
  }, [search, startDate, dueDate, card, page, pageSize, version]);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const current = result.key === key;
  return {
    rows: result.rows,
    total: current ? result.total : undefined,
    hasMore: result.hasMore,
    error: current ? result.error : undefined,
    isLoading: !current,
    refresh,
  };
}

type CountResult = { key: string; counts?: Record<CardKey, number>; error?: string };

/** Card counts for the current date range + search (one small request per card). */
export function useTmsCounts(filters: TmsFilters) {
  const [version, setVersion] = useState(0);
  const { search, startDate, dueDate } = filters;
  const key = JSON.stringify([search, startDate, dueDate, version]);
  const [result, setResult] = useState<CountResult>({ key: '' });

  useEffect(() => {
    let live = true;
    const k = JSON.stringify([search, startDate, dueDate, version]);
    fetchTmsCounts({ search, startDate, dueDate })
      .then((counts) => live && setResult({ key: k, counts }))
      .catch((err: unknown) => live && setResult((prev) => ({ ...prev, key: k, error: errorMessage(err, 'Could not load counts.') })));
    return () => {
      live = false;
    };
  }, [search, startDate, dueDate, version]);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const current = result.key === key;
  // Old counts stay visible until the new ones arrive.
  return { counts: result.counts, error: current ? result.error : undefined, refresh };
}
