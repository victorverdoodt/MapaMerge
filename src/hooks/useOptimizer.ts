'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Topology } from 'topojson-specification';
import type { OptimizationParams, MergeResults, GlobalStats, MunicipalityData } from '@/lib/types';
import { runOptimization, DEFAULT_PARAMS } from '@/lib/optimizer-core';
import type { MunicipalityGeo } from '@/lib/optimizer-core';
import { buildMergedGeoJSON } from '@/lib/buildMergedGeo';

// ============================================================
// Optimizer data bundle (fiscal + adjacency + geo)
// ============================================================
interface OptimizerBundle {
  fiscal: Record<string, MunicipalityData>;
  adjacency: Record<string, string[]>;
  geo: Record<string, MunicipalityGeo>;
}

// ============================================================
// Result from optimizer + geometry rebuild
// ============================================================
export interface OptimizerResult {
  mergeResults: MergeResults;
  stats: GlobalStats;
  mergedGeoJSON: GeoJSON.FeatureCollection;
}

// ============================================================
// Hook return type
// ============================================================
interface UseOptimizerReturn {
  /** Whether optimizer data is loaded and ready */
  ready: boolean;
  /** Whether optimization is currently running */
  computing: boolean;
  /** Last optimization result (null = use static data) */
  result: OptimizerResult | null;
  /** Run optimization with given params. Returns via result state. */
  optimize: (params: OptimizationParams) => void;
  /** Reset to static data */
  reset: () => void;
  /** Loading error message */
  error: string | null;
}

/**
 * Hook that manages client-side optimization.
 * 
 * 1. Loads optimizer bundle (fiscal + adjacency + geo) from /data/optimizer-bundle.json
 * 2. When optimize() is called, runs greedy optimizer on main thread
 * 3. Builds merged GeoJSON from results + original topology
 * 4. Returns results for display
 * 
 * Uses double-rAF pattern to ensure loading UI paints before computation starts.
 */
export function useOptimizer(originalTopojson: Topology | null): UseOptimizerReturn {
  const [bundle, setBundle] = useState<OptimizerBundle | null>(null);
  const [result, setResult] = useState<OptimizerResult | null>(null);
  const [computing, setComputing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rafRef = useRef<number>(0);

  // Load optimizer bundle on mount
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('/data/optimizer-bundle.json');
        if (!res.ok) {
          if (res.status === 404) {
            setError('Dados de otimização não disponíveis. Execute a pipeline primeiro.');
          } else {
            setError(`Erro ao carregar dados: HTTP ${res.status}`);
          }
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          setBundle(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(`Erro ao carregar dados de otimização: ${(err as Error).message}`);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  // Run optimization
  const optimize = useCallback((params: OptimizationParams) => {
    if (!bundle || !originalTopojson) return;

    setComputing(true);

    // Double-rAF: ensure the "computing" state renders before we block
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = requestAnimationFrame(() => {
        try {
          const t0 = performance.now();

          // Run optimization (greedy ~300-500ms for all of Brazil)
          const mergeResultsRaw = runOptimization(
            bundle.fiscal,
            bundle.adjacency,
            bundle.geo,
            { ...DEFAULT_PARAMS, ...params }
          );

          // Build merged GeoJSON from topology + results
          const mergedGeoJSON = buildMergedGeoJSON(
            originalTopojson,
            mergeResultsRaw.groups,
            mergeResultsRaw.ungrouped,
            bundle.fiscal,
          );

          const elapsed = performance.now() - t0;
          console.log(`[Optimizer] Completed in ${elapsed.toFixed(0)}ms — ${mergeResultsRaw.groups.length} groups, ${mergeResultsRaw.ungrouped.length} ungrouped`);

          setResult({
            mergeResults: mergeResultsRaw,
            stats: mergeResultsRaw.stats,
            mergedGeoJSON,
          });
        } catch (err) {
          console.error('[Optimizer] Error:', err);
          setError(`Erro na otimização: ${(err as Error).message}`);
        } finally {
          setComputing(false);
        }
      });
    });
  }, [bundle, originalTopojson]);

  // Reset to static data
  const reset = useCallback(() => {
    setResult(null);
  }, []);

  // Cleanup
  useEffect(() => {
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return {
    ready: bundle !== null && originalTopojson !== null,
    computing,
    result,
    optimize,
    reset,
    error,
  };
}
