import { formatBRLAbbrev, formatNumber, formatPercent } from '@/lib/format';
import type { GlobalStats, OptimizationParams } from '@/lib/types';
import ParameterPanel from './ParameterPanel';

interface SidebarProps {
  stats: GlobalStats | null;
  loading?: boolean;
  onOptimize?: (params: OptimizationParams) => void;
  computing?: boolean;
  optimizerReady?: boolean;
  optimizerError?: string | null;
  onReset?: () => void;
}

export default function Sidebar({ stats, loading, onOptimize, computing, optimizerReady, optimizerError, onReset }: SidebarProps) {
  if (loading || !stats) {
    return (
      <aside className="w-80 flex-shrink-0 bg-gray-900/85 backdrop-blur-xl border-l border-gray-800 p-4 overflow-y-auto">
        <div className="space-y-4 animate-pulse">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-20 bg-gray-800/50 rounded-lg" />
          ))}
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-80 flex-shrink-0 bg-gray-900/85 backdrop-blur-xl border-l border-gray-800 overflow-y-auto custom-scrollbar">
      {/* Parameter Panel */}
      {onOptimize && (
        <ParameterPanel
          onOptimize={onOptimize}
          computing={computing ?? false}
          ready={optimizerReady ?? false}
          error={optimizerError}
          onReset={onReset}
        />
      )}

      {/* Header */}
      <div className="p-4 border-b border-gray-800">
        <h2 className="text-lg font-bold text-white">
          Benefícios da Otimização
        </h2>
        <p className="text-xs text-gray-500 mt-1">
          Simulação de fusões municipais em todo o Brasil
        </p>
      </div>

      <div className="p-4 space-y-3">
        {/* Net Economy — headline metric */}
        <StatCard
          icon="💰"
          label="Economia Líquida Anual"
          value={formatBRLAbbrev(stats.economiaLiquida ?? stats.economiaTotal)}
          accent="emerald"
          sublabel={`${formatBRLAbbrev(stats.economiaPorHabitante)}/habitante`}
        />

        {/* Economy breakdown (gross, FPM loss, transition cost) */}
        {((stats.perdaFPMTotal ?? 0) !== 0 || (stats.custoTransicaoTotal ?? 0) !== 0) && (
          <div className="bg-gray-800/30 rounded-lg p-2.5 border border-gray-700/30 space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-gray-500">Economia bruta</span>
              <span className="text-emerald-400/80">{formatBRLAbbrev(stats.economiaTotal)}</span>
            </div>
            {(stats.perdaFPMTotal ?? 0) !== 0 && (
              <div className="flex justify-between text-[11px]">
                <span className="text-gray-500">Perda FPM</span>
                <span className="text-red-400/80">−{formatBRLAbbrev(Math.abs(stats.perdaFPMTotal ?? 0))}</span>
              </div>
            )}
            {(stats.custoTransicaoTotal ?? 0) !== 0 && (
              <div className="flex justify-between text-[11px]">
                <span className="text-gray-500">Custo transição/ano</span>
                <span className="text-red-400/80">−{formatBRLAbbrev(stats.custoTransicaoTotal ?? 0)}</span>
              </div>
            )}
          </div>
        )}

        {/* Municipality reduction */}
        <StatCard
          icon="🏛️"
          label="Redução de Municípios"
          value={`${formatNumber(stats.municipiosOriginal)} → ${formatNumber(stats.municipiosResultante)}`}
          accent="cyan"
          sublabel={`-${stats.reducaoPercent.toFixed(1)}% (${formatNumber(stats.municipiosEliminados)} eliminados)`}
        />

        {/* Deficit reduction */}
        <StatCard
          icon="📉"
          label="Déficit Fiscal"
          value={`${formatBRLAbbrev(stats.deficitTotalAntes)} → ${formatBRLAbbrev(stats.deficitTotalDepois)}`}
          accent="red"
          sublabel={stats.reducaoDeficit !== 0 ? `Redução de ${Math.abs(stats.reducaoDeficit).toFixed(1)}%` : ''}
        />

        {/* Inequality */}
        <StatCard
          icon="⚖️"
          label="Desequilíbrio Fiscal"
          value={`σ ${stats.desequilibrioAntes.toFixed(0)} → ${stats.desequilibrioDepois.toFixed(0)}`}
          accent="amber"
          sublabel={stats.reducaoDesequilibrio > 0 ? `Redução de ${stats.reducaoDesequilibrio.toFixed(1)}%` : ''}
        />

        {/* Average population per entity */}
        <StatCard
          icon="👥"
          label="Pop. Média por Ente"
          value={formatNumber(Math.round(stats.populacaoMediaPorEnte))}
          accent="purple"
          sublabel={`${formatNumber(stats.totalGruposFusao)} grupos de fusão`}
        />

        {/* EFA */}
        <StatCard
          icon="🎯"
          label="Autossuficiência Fiscal (EFA)"
          value={`${formatPercent(stats.efaAntes)} → ${formatPercent(stats.efaDepois)}`}
          accent="blue"
          sublabel="Receitas próprias / Receita total"
        />

        {/* Top states */}
        {stats.topEstados && stats.topEstados.length > 0 && (
          <div className="bg-gray-800/40 rounded-lg p-3 border border-gray-700/50">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Top Estados por Economia
            </h3>
            <div className="space-y-1.5">
              {stats.topEstados.slice(0, 5).map((state: {
                uf: string;
                nomeEstado: string;
                economiaTotal: number;
                municipiosOriginal: number;
                municipiosResultante: number;
                reducaoPercent: number;
              }) => (
                <div key={state.uf} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 w-6">{state.uf}</span>
                    <span className="text-gray-300 truncate max-w-[100px]">{state.nomeEstado}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">
                      {state.municipiosOriginal}→{state.municipiosResultante}
                    </span>
                    <span className="text-emerald-400 font-medium min-w-[70px] text-right">
                      {formatBRLAbbrev(state.economiaTotal)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-800 mt-2">
        <p className="text-[10px] text-gray-600 leading-relaxed">
          <strong className="text-gray-500">Fonte:</strong> Tesouro Nacional (SICONFI/FINBRA) e IBGE — Malhas Territoriais
        </p>
        <p className="text-[10px] text-gray-600 mt-1.5 leading-relaxed">
          <strong className="text-gray-500">Aviso:</strong> Simulação hipotética com caráter educacional e exploratório. 
          Não representa proposta oficial nem cenário juridicamente viável sem plebiscito e legislação específica 
          (PEC 188/2019).
        </p>
      </div>
    </aside>
  );
}

// ============================================================
// StatCard component
// ============================================================
type AccentColor = 'emerald' | 'cyan' | 'red' | 'amber' | 'purple' | 'blue';

const accentColors: Record<AccentColor, { bg: string; text: string; border: string }> = {
  emerald: { bg: 'bg-emerald-900/20', text: 'text-emerald-400', border: 'border-emerald-800/30' },
  cyan: { bg: 'bg-cyan-900/20', text: 'text-cyan-400', border: 'border-cyan-800/30' },
  red: { bg: 'bg-red-900/20', text: 'text-red-400', border: 'border-red-800/30' },
  amber: { bg: 'bg-amber-900/20', text: 'text-amber-400', border: 'border-amber-800/30' },
  purple: { bg: 'bg-purple-900/20', text: 'text-purple-400', border: 'border-purple-800/30' },
  blue: { bg: 'bg-blue-900/20', text: 'text-blue-400', border: 'border-blue-800/30' },
};

function StatCard({
  icon,
  label,
  value,
  sublabel,
  accent,
}: {
  icon: string;
  label: string;
  value: string;
  sublabel?: string;
  accent: AccentColor;
}) {
  const colors = accentColors[accent];
  return (
    <div className={`${colors.bg} rounded-lg p-3 border ${colors.border}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm">{icon}</span>
        <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className={`text-lg font-bold ${colors.text}`}>{value}</div>
      {sublabel && (
        <div className="text-[11px] text-gray-500 mt-0.5">{sublabel}</div>
      )}
    </div>
  );
}
