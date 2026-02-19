'use client';

import { useState, useCallback } from 'react';
import type { OptimizationParams } from '@/lib/types';
import { DEFAULT_PARAMS, PRESETS } from '@/lib/optimizer-core';

// ============================================================
// Props
// ============================================================
interface ParameterPanelProps {
  onOptimize: (params: OptimizationParams) => void;
  computing: boolean;
  ready: boolean;
  error?: string | null;
  onReset?: () => void;
}

// ============================================================
// Component
// ============================================================
export default function ParameterPanel({
  onOptimize,
  computing,
  ready,
  error,
  onReset,
}: ParameterPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [params, setParams] = useState<OptimizationParams>({ ...DEFAULT_PARAMS });
  const [activePreset, setActivePreset] = useState<string>('moderado');
  const [hasRun, setHasRun] = useState(false);

  const updateParam = useCallback(<K extends keyof OptimizationParams>(
    key: K,
    value: OptimizationParams[K]
  ) => {
    setParams(prev => ({ ...prev, [key]: value }));
    setActivePreset(''); // clear preset when manually adjusted
  }, []);

  const applyPreset = useCallback((name: string) => {
    const preset = PRESETS[name];
    if (preset) {
      setParams(prev => ({ ...prev, ...preset }));
      setActivePreset(name);
    }
  }, []);

  const handleOptimize = useCallback(() => {
    onOptimize(params);
    setHasRun(true);
  }, [onOptimize, params]);

  const handleReset = useCallback(() => {
    setHasRun(false);
    onReset?.();
  }, [onReset]);

  if (!ready && !error) {
    return (
      <div className="p-3 border-b border-gray-800">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <div className="w-3 h-3 border border-gray-600 border-t-transparent rounded-full animate-spin" />
          Carregando dados de otimização...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-3 border-b border-gray-800">
        <div className="text-xs text-amber-500/80">
          ⚠ {error}
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-gray-800">
      {/* Toggle header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full p-3 flex items-center justify-between hover:bg-gray-800/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">⚙️</span>
          <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
            Parâmetros da Simulação
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Collapsible panel */}
      {expanded && (
        <div className="px-3 pb-3 space-y-3">
          {/* Presets */}
          <div>
            <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
              Cenário
            </label>
            <div className="flex gap-1.5 mt-1">
              {(['conservador', 'moderado', 'agressivo'] as const).map(preset => (
                <button
                  key={preset}
                  onClick={() => applyPreset(preset)}
                  className={`flex-1 text-[10px] py-1.5 px-2 rounded-md font-medium transition-colors
                    ${activePreset === preset
                      ? preset === 'conservador' ? 'bg-blue-900/40 text-blue-400 border border-blue-800/50'
                        : preset === 'moderado' ? 'bg-emerald-900/40 text-emerald-400 border border-emerald-800/50'
                        : 'bg-orange-900/40 text-orange-400 border border-orange-800/50'
                      : 'bg-gray-800/40 text-gray-400 border border-gray-700/50 hover:bg-gray-800/60'
                    }`}
                >
                  {preset.charAt(0).toUpperCase() + preset.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Savings rates */}
          <Section title="Taxas de Economia">
            <Slider
              label="Pessoal"
              value={params.personnelSavingsRate}
              min={0.05} max={0.60} step={0.05}
              format={v => `${(v * 100).toFixed(0)}%`}
              onChange={v => updateParam('personnelSavingsRate', v)}
            />
            <Slider
              label="Administrativa"
              value={params.adminSavingsRate}
              min={0.05} max={0.50} step={0.05}
              format={v => `${(v * 100).toFixed(0)}%`}
              onChange={v => updateParam('adminSavingsRate', v)}
            />
          </Section>

          {/* Transition costs */}
          <Section title="Custos de Transição">
            <Slider
              label="Custo/habitante"
              value={params.transitionCostPerCapita}
              min={0} max={500} step={25}
              format={v => `R$ ${v}`}
              onChange={v => updateParam('transitionCostPerCapita', v)}
            />
            <Slider
              label="Amortização"
              value={params.amortizationYears}
              min={3} max={15} step={1}
              format={v => `${v} anos`}
              onChange={v => updateParam('amortizationYears', v)}
            />
          </Section>

          {/* FPM */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="modelFPM"
              checked={params.modelFPM}
              onChange={e => updateParam('modelFPM', e.target.checked)}
              className="w-3.5 h-3.5 rounded border-gray-600 bg-gray-800 text-cyan-500 focus:ring-cyan-500/30"
            />
            <label htmlFor="modelFPM" className="text-[11px] text-gray-400 select-none">
              Modelar perda de FPM (coeficientes DL 1.881/81)
            </label>
          </div>

          {/* Constraints */}
          <Section title="Restrições de Fusão">
            <Slider
              label="Pop. máxima"
              value={params.maxPopulation}
              min={50000} max={500000} step={10000}
              format={v => `${(v / 1000).toFixed(0)}k`}
              onChange={v => updateParam('maxPopulation', v)}
            />
            <Slider
              label="Membros máx"
              value={params.maxMembers}
              min={2} max={10} step={1}
              format={v => `${v}`}
              onChange={v => updateParam('maxMembers', v)}
            />
            <Slider
              label="Área máxima"
              value={params.maxAreaKm2}
              min={5000} max={50000} step={1000}
              format={v => `${(v / 1000).toFixed(0)}k km²`}
              onChange={v => updateParam('maxAreaKm2', v)}
            />
            <Slider
              label="Distância máx centroides"
              value={params.maxCentroidDistanceKm}
              min={20} max={200} step={10}
              format={v => `${v} km`}
              onChange={v => updateParam('maxCentroidDistanceKm', v)}
            />
          </Section>

          {/* Action buttons */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleOptimize}
              disabled={computing}
              className={`flex-1 text-xs font-semibold py-2 px-3 rounded-md transition-colors
                ${computing
                  ? 'bg-gray-700 text-gray-400 cursor-wait'
                  : 'bg-cyan-700 hover:bg-cyan-600 text-white'
                }`}
            >
              {computing ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                  Recalculando...
                </span>
              ) : '🔄 Recalcular'}
            </button>
            {hasRun && (
              <button
                onClick={handleReset}
                disabled={computing}
                className="text-xs text-gray-400 hover:text-gray-300 px-2 transition-colors"
                title="Voltar aos resultados estáticos"
              >
                ↩
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Section wrapper
// ============================================================
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
        {title}
      </label>
      <div className="mt-1 space-y-2">
        {children}
      </div>
    </div>
  );
}

// ============================================================
// Slider component
// ============================================================
function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[11px] text-gray-400">{label}</span>
        <span className="text-[11px] font-mono text-cyan-400">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer
                   [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                   [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-500
                   [&::-webkit-slider-thumb]:hover:bg-cyan-400 [&::-webkit-slider-thumb]:transition-colors
                   [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:rounded-full
                   [&::-moz-range-thumb]:bg-cyan-500 [&::-moz-range-thumb]:border-0"
      />
    </div>
  );
}
