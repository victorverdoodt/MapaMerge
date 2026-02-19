'use client';

import dynamic from 'next/dynamic';
import Sidebar from '@/components/Sidebar';
import { useFiscalData } from '@/hooks/useFiscalData';

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
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Maps */}
        <DualMapView
          originalTopojson={originalTopojson}
          mergedTopojson={mergedTopojson}
          mergeResults={mergeResults}
          globalStats={globalStats}
        />

        {/* Sidebar */}
        <Sidebar stats={globalStats} loading={loading} />
      </div>
    </div>
  );
}
