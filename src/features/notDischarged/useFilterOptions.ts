import { useEffect, useRef, useState } from 'react';
import { fetchFilterOptions } from './api';
import type { FilterOption, Region } from './types';

type Options = { entities: FilterOption[]; payers: FilterOption[] };

/** Entity and payer choices for the region (2 grouped requests, cached per region). */
export function useFilterOptions(region: Region) {
  const [byRegion, setByRegion] = useState<Partial<Record<Region, Options>>>({});
  const [errors, setErrors] = useState<Partial<Record<Region, string>>>({});
  const requested = useRef(new Set<Region>());

  useEffect(() => {
    if (requested.current.has(region)) return;
    requested.current.add(region);
    fetchFilterOptions(region)
      .then((o) => setByRegion((prev) => ({ ...prev, [region]: o })))
      .catch((err: unknown) => {
        requested.current.delete(region);
        setErrors((prev) => ({ ...prev, [region]: err instanceof Error ? err.message : 'Could not load filter options.' }));
      });
  }, [region]);

  return { options: byRegion[region], error: errors[region] };
}
