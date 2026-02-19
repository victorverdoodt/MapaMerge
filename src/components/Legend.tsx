import { LEGEND_STOPS } from '@/lib/colors';

export default function Legend() {
  return (
    <div className="absolute bottom-4 left-4 z-10">
      <div className="bg-gray-900/90 backdrop-blur-md border border-gray-700 rounded-lg p-3 shadow-lg">
        <h4 className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-2">
          Saldo Fiscal Per Capita (R$)
        </h4>
        <div className="flex items-center gap-0.5">
          {LEGEND_STOPS.map((stop, i) => (
            <div key={i} className="flex flex-col items-center">
              <div
                className="w-6 h-3 rounded-sm"
                style={{ backgroundColor: stop.color }}
              />
              <span className="text-[8px] text-gray-500 mt-0.5 whitespace-nowrap">
                {stop.label}
              </span>
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[9px] text-red-400">← Déficit</span>
          <span className="text-[9px] text-emerald-400">Superávit →</span>
        </div>
      </div>
    </div>
  );
}
