import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchCaseHistory, fetchTrackingHistory, type HistoryRow } from './api';
import { errorMessage } from './format';
import type { TrackingRow } from './types';

type Entry = { rows?: HistoryRow[]; rowsError?: string; tracking?: TrackingRow[]; trackingError?: string };

/** An action taken in this session: shown at once, while (and even if not) it is saved. */
export interface LocalAction {
  id: string;
  caseId: string;
  action: string;
  details: string;
  by: string;
  createdOn: string;
  /** The case's business unit, for the role on a retry. */
  buId?: string;
  status: 'saving' | 'saved' | 'failed';
  error?: string;
}

/**
 * Action History of the case open in the drawer, from three sources:
 * - ND Case History rows (manual actions + rows written by the flows),
 * - SLA tracking rows (the automatic escalations, as the history showed them before),
 * - actions just taken in this session, shown immediately (removed once the server has them).
 * One read per case, cached; refresh(caseId) re-reads one case and keeps the old list meanwhile.
 */
export function useCaseHistory(caseId: string | undefined) {
  const [entries, setEntries] = useState<ReadonlyMap<string, Entry>>(() => new Map());
  const [local, setLocal] = useState<LocalAction[]>([]);
  const requested = useRef(new Set<string>());
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!caseId || requested.current.has(caseId)) return;
    requested.current.add(caseId);
    Promise.allSettled([fetchCaseHistory(caseId), fetchTrackingHistory(caseId)]).then(([h, t]) => {
      setEntries((prev) =>
        new Map(prev).set(caseId, {
          rows: h.status === 'fulfilled' ? h.value : prev.get(caseId)?.rows,
          rowsError: h.status === 'rejected' ? errorMessage(h.reason, 'Could not load ND Case History.') : undefined,
          tracking: t.status === 'fulfilled' ? t.value : prev.get(caseId)?.tracking,
          trackingError: t.status === 'rejected' ? errorMessage(t.reason, 'Could not load SLA tracking.') : undefined,
        }),
      );
      // Saved actions are now part of the server rows.
      if (h.status === 'fulfilled') setLocal((prev) => prev.filter((a) => !(a.caseId === caseId && a.status === 'saved')));
      if (h.status === 'rejected' || t.status === 'rejected') requested.current.delete(caseId);
    });
  }, [caseId, version]);

  const refresh = useCallback((id: string) => {
    requested.current.delete(id);
    setVersion((v) => v + 1);
  }, []);

  /** Shows an action right away; returns its id for settle(). */
  const addLocal = useCallback((a: Omit<LocalAction, 'id' | 'status' | 'createdOn'>) => {
    const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setLocal((prev) => [{ ...a, id, status: 'saving', createdOn: new Date().toISOString() }, ...prev]);
    return id;
  }, []);

  const settle = useCallback((id: string, ok: boolean, error?: string) => {
    setLocal((prev) => prev.map((a) => (a.id === id ? { ...a, status: ok ? 'saved' : 'failed', error } : a)));
  }, []);

  /** A failed action is being saved again. */
  const restart = useCallback((id: string) => {
    setLocal((prev) => prev.map((a) => (a.id === id ? { ...a, status: 'saving', error: undefined } : a)));
  }, []);

  /** Hide a failed action (it was never saved). */
  const dismiss = useCallback((id: string) => setLocal((prev) => prev.filter((a) => a.id !== id)), []);

  const entry = caseId ? entries.get(caseId) : undefined;
  const pending = useMemo(() => local.filter((a) => a.caseId === caseId), [local, caseId]);
  return {
    rows: entry?.rows,
    tracking: entry?.tracking,
    local: pending,
    rowsError: entry?.rowsError,
    trackingError: entry?.trackingError,
    isLoading: Boolean(caseId) && !entry,
    refresh,
    addLocal,
    settle,
    restart,
    dismiss,
  };
}
