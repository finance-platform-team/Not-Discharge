import { useCallback, useEffect, useRef } from 'react';
import { fetchChangeStamp } from './api';
import type { Region } from './types';

/**
 * Polls Dataverse for changes (every intervalMs while the tab is visible, and right away when it
 * becomes visible again) and calls onChange when the data moved since the last look.
 * sync() records the current state as seen, e.g. after a manual refresh.
 */
export function useChangeWatcher(region: Region, onChange: () => void, intervalMs = 60_000) {
  const seen = useRef<string | undefined>(undefined);
  const callback = useRef(onChange);
  useEffect(() => {
    callback.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let alive = true;
    seen.current = undefined; // a new region starts a new baseline
    const check = async () => {
      if (document.hidden) return;
      try {
        const stamp = await fetchChangeStamp(region);
        if (!alive) return;
        if (seen.current !== undefined && stamp !== seen.current) callback.current();
        seen.current = stamp;
      } catch (err) {
        console.warn('[refresh] change check failed', err); // try again next tick
      }
    };
    void check();
    const timer = window.setInterval(check, intervalMs);
    const onVisible = () => !document.hidden && void check();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [region, intervalMs]);

  const sync = useCallback(async () => {
    try {
      seen.current = await fetchChangeStamp(region);
    } catch {
      // the next poll sets it
    }
  }, [region]);

  return { sync };
}
