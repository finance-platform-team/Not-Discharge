import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchStats, type StatResult } from './api';
import type { Region, StatKey } from './types';

type Stats = Record<StatKey, StatResult>;

/** KPI + risk-chip counts for a region. 5 light count requests, cached per region. */
export function useCaseStats(region: Region) {
  const [byRegion, setByRegion] = useState<Partial<Record<Region, Stats>>>({});
  const requested = useRef(new Set<Region>());
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (requested.current.has(region)) return;
    requested.current.add(region);
    fetchStats(region).then((stats) => setByRegion((prev) => ({ ...prev, [region]: stats })));
  }, [region, version]);

  const refresh = useCallback(() => {
    requested.current.delete(region);
    setVersion((v) => v + 1);
  }, [region]);

  return { stats: byRegion[region], refresh };
}
