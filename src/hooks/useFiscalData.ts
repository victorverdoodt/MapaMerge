'use client';

import { useState, useEffect } from 'react';
import type { Topology } from 'topojson-specification';
import type { MergeResults, GlobalStats } from '@/lib/types';

interface FiscalDataState {
  originalTopojson: Topology | null;
  mergedTopojson: Topology | null;
  mergeResults: MergeResults | null;
  globalStats: GlobalStats | null;
  loading: boolean;
  error: string | null;
}

/**
 * Hook that loads all pre-processed data from /data/ directory.
 * Fetches TopoJSON maps, merge results, and global stats in parallel.
 */
export function useFiscalData(): FiscalDataState {
  const [state, setState] = useState<FiscalDataState>({
    originalTopojson: null,
    mergedTopojson: null,
    mergeResults: null,
    globalStats: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        const basePath = process.env.NODE_ENV === 'production' ? '' : '';

        const [originalRes, mergedRes, mergeRes, statsRes] = await Promise.all([
          fetch(`${basePath}/data/br-original.topojson`),
          fetch(`${basePath}/data/br-merged.topojson`),
          fetch(`${basePath}/data/merge-results.json`),
          fetch(`${basePath}/data/global-stats.json`),
        ]);

        if (cancelled) return;

        // Check for errors but don't block on individual failures
        const errors: string[] = [];

        let originalTopojson: Topology | null = null;
        let mergedTopojson: Topology | null = null;
        let mergeResults: MergeResults | null = null;
        let globalStats: GlobalStats | null = null;

        if (originalRes.ok) {
          originalTopojson = await originalRes.json();
        } else {
          errors.push(`br-original.topojson: ${originalRes.status}`);
        }

        if (mergedRes.ok) {
          mergedTopojson = await mergedRes.json();
        } else {
          errors.push(`br-merged.topojson: ${mergedRes.status}`);
        }

        if (mergeRes.ok) {
          mergeResults = await mergeRes.json();
        } else {
          errors.push(`merge-results.json: ${mergeRes.status}`);
        }

        if (statsRes.ok) {
          globalStats = await statsRes.json();
        } else {
          errors.push(`global-stats.json: ${statsRes.status}`);
        }

        if (cancelled) return;

        setState({
          originalTopojson,
          mergedTopojson,
          mergeResults,
          globalStats,
          loading: false,
          error: errors.length > 0 ? `Failed to load: ${errors.join(', ')}` : null,
        });
      } catch (err) {
        if (cancelled) return;
        setState(prev => ({
          ...prev,
          loading: false,
          error: `Failed to load data: ${(err as Error).message}`,
        }));
      }
    }

    loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
