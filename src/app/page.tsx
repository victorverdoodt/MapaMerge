'use client';

import dynamic from 'next/dynamic';
import Sidebar from '@/components/Sidebar';
import { useFiscalData } from '@/hooks/useFiscalData';
import { useOptimizer } from '@/hooks/useOptimizer';

// Dynamic import to avoid SSR issues with MapLibre (uses window/document)
const DualMapView = dynamic(() => import('@/components/DualMapView'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center bg-gray-950">
      <div className="text-center">
        <div className="w-12 h-12 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin-slow mx-auto mb-4" />
        <p className="text-gray-400 text-sm">Carregando mapas...</p>
      </div>
    </div>
  ),
});

export default function Home() {
  const { originalTopojson, mergedTopojson, mergeResults, globalStats, loading, error } = useFiscalData();
  const optimizer = useOptimizer(originalTopojson);

  // Use dynamic results from optimizer if available, otherwise static data
  const effectiveStats = optimizer.result?.stats ?? globalStats;
  const effectiveMergeResults = optimizer.result?.mergeResults ?? mergeResults;
  const effectiveMergedGeo = optimizer.result?.mergedGeoJSON ?? null;

  return (
    <div className="h-screen flex flex-col font-[family-name:var(--font-geist-sans)]">
      {/* Top bar */}
      <header className="h-12 bg-gray-900/90 backdrop-blur border-b border-gray-800 flex items-center px-4 flex-shrink-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-gradient-to-br from-cyan-500 to-emerald-500 rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-bold text-white leading-none">
              Simulador de Fusões Municipais
            </h1>
            <p className="text-[10px] text-gray-500 leading-none mt-0.5">
              Brasil — Mapa Comparativo
            </p>
          </div>
        </div>

        {/* Status indicators */}
        <div className="ml-auto flex items-center gap-3">
          {loading && (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
              <span className="text-xs text-gray-400">Carregando dados...</span>
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-red-500 rounded-full" />
              <span className="text-xs text-red-400" title={error}>Erro nos dados</span>
            </div>
          )}
          {!loading && !error && (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-emerald-500 rounded-full" />
              <span className="text-xs text-gray-400">Dados carregados</span>
            </div>
          )}
          <a
            href="https://github.com/victorverdoodt/MapaMerge"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-2 text-gray-400 hover:text-white transition-colors"
            title="Ver no GitHub"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
          </a>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Maps */}
        <DualMapView
          originalTopojson={originalTopojson}
          mergedTopojson={mergedTopojson}
          mergedGeoJSON={effectiveMergedGeo}
          mergeResults={effectiveMergeResults}
          globalStats={effectiveStats}
        />

        {/* Sidebar */}
        <Sidebar
          stats={effectiveStats}
          loading={loading}
          onOptimize={optimizer.optimize}
          computing={optimizer.computing}
          optimizerReady={optimizer.ready}
          optimizerError={optimizer.error}
          onReset={optimizer.reset}
        />
      </div>
    </div>
  );
}
