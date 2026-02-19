import { formatBRLAbbrev, formatNumber } from '@/lib/format';
import type { TooltipInfo } from '@/lib/types';

interface TooltipProps {
  data: TooltipInfo;
}

export default function Tooltip({ data }: TooltipProps) {
  // Position tooltip near cursor, but keep it on screen
  const style: React.CSSProperties = {
    left: Math.min(data.x + 16, typeof window !== 'undefined' ? window.innerWidth - 320 : data.x),
    top: Math.max(data.y - 10, 10),
    maxWidth: 300,
  };

  const isDeficit = data.saldo < 0;
  const saldoColor = isDeficit ? 'text-red-400' : 'text-emerald-400';

  return (
    <div
      className="fixed z-50 pointer-events-none animate-fade-in"
      style={style}
    >
      <div className="bg-gray-900/95 backdrop-blur-md border border-gray-700 rounded-lg p-3 shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <div className={`w-2 h-2 rounded-full ${isDeficit ? 'bg-red-500' : 'bg-emerald-500'}`} />
          <h3 className="font-semibold text-white text-sm truncate">
            {data.nome}
          </h3>
          <span className="text-xs text-gray-400 ml-auto">{data.uf}</span>
        </div>

        {/* Basic info */}
        <div className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-400">População</span>
            <span className="text-gray-200">{formatNumber(data.populacao)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Receita</span>
            <span className="text-gray-200">{formatBRLAbbrev(data.receita)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Despesa</span>
            <span className="text-gray-200">{formatBRLAbbrev(data.despesa)}</span>
          </div>
          <div className="flex justify-between border-t border-gray-700 pt-1">
            <span className="text-gray-400">Saldo</span>
            <span className={`font-medium ${saldoColor}`}>
              {formatBRLAbbrev(data.saldo)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">EFA</span>
            <span className="text-gray-200">{data.efa}%</span>
          </div>
        </div>

        {/* Merge info (only on optimized map) */}
        {data.isMerged && (
          <div className="mt-2 pt-2 border-t border-cyan-900/50">
            <div className="flex items-center gap-1.5 mb-1">
              <svg className="w-3 h-3 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className="text-xs font-medium text-cyan-400">
                Fusão de {data.membersCount} municípios
              </span>
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-400">Economia</span>
                <span className="text-emerald-400 font-medium">
                  +{formatBRLAbbrev(data.economia || 0)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Saldo otimizado</span>
                <span className={`font-medium ${(data.saldoOtimizado || 0) < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {formatBRLAbbrev(data.saldoOtimizado || 0)}
                </span>
              </div>
            </div>

            {/* Member names */}
            {data.memberNames && data.memberNames.length > 1 && (
              <div className="mt-1.5 pt-1.5 border-t border-gray-800">
                <span className="text-[10px] text-gray-500 block mb-0.5">Municípios incluídos:</span>
                <div className="text-[10px] text-gray-400 leading-relaxed">
                  {data.memberNames.join(', ')}
                  {data.membersCount && data.membersCount > 10 && (
                    <span className="text-gray-500"> +{data.membersCount - 10} outros</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
