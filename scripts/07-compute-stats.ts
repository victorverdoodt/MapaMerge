// ============================================================
// Script 07: Compute Global Stats
// Generates summary statistics for the sidebar
// ============================================================
import * as fs from 'fs';
import * as path from 'path';

const PUBLIC_DIR = path.join(__dirname, '..', 'public', 'data');
const MERGE_FILE = path.join(PUBLIC_DIR, 'merge-results.json');
const OUTPUT_FILE = path.join(PUBLIC_DIR, 'global-stats.json');

async function main() {
  console.log('=== Script 07: Compute Global Stats ===\n');

  if (!fs.existsSync(MERGE_FILE)) {
    throw new Error(`Merge results not found: ${MERGE_FILE}\nRun script 05 first.`);
  }

  const mergeResults = JSON.parse(fs.readFileSync(MERGE_FILE, 'utf-8'));
  const stats = mergeResults.stats;

  // The stats are already computed in script 05, but we enhance them here
  // and create a clean output for the frontend

  const globalStats = {
    // Main headline numbers
    municipiosOriginal: stats.municipiosOriginal,
    municipiosResultante: stats.municipiosResultante,
    municipiosEliminados: stats.municipiosOriginal - stats.municipiosResultante,
    reducaoPercent: stats.reducaoPercent,

    // Financial
    economiaTotal: stats.economiaTotal,
    economiaPorHabitante: stats.economiaPorHabitante,
    deficitTotalAntes: stats.deficitTotalAntes,
    deficitTotalDepois: stats.deficitTotalDepois,
    reducaoDeficit: stats.deficitTotalAntes !== 0
      ? ((stats.deficitTotalAntes - stats.deficitTotalDepois) / Math.abs(stats.deficitTotalAntes)) * 100
      : 0,

    // Fiscal autonomy
    efaAntes: stats.efaAntes,
    efaDepois: stats.efaDepois,
    
    // Inequality
    desequilibrioAntes: stats.desequilibrioAntes,
    desequilibrioDepois: stats.desequilibrioDepois,
    reducaoDesequilibrio: stats.desequilibrioAntes > 0
      ? ((stats.desequilibrioAntes - stats.desequilibrioDepois) / stats.desequilibrioAntes) * 100
      : 0,

    // Scale
    populacaoMediaPorEnte: stats.populacaoMediaPorEnte,

    // Number of merge groups
    totalGruposFusao: mergeResults.groups.length,

    // Top 5 states by economy  
    topEstados: (stats.byState || [])
      .sort((a: { economiaTotal: number }, b: { economiaTotal: number }) => b.economiaTotal - a.economiaTotal)
      .slice(0, 10)
      .map((s: {
        uf: string;
        nomeEstado: string;
        municipiosOriginal: number;
        municipiosResultante: number;
        reducaoPercent: number;
        economiaTotal: number;
      }) => ({
        uf: s.uf,
        nomeEstado: s.nomeEstado,
        municipiosOriginal: s.municipiosOriginal,
        municipiosResultante: s.municipiosResultante,
        reducaoPercent: s.reducaoPercent,
        economiaTotal: s.economiaTotal,
      })),

    // All state data
    byState: stats.byState || [],

    // Metadata
    dataSource: 'Tesouro Nacional (SICONFI/FINBRA) e IBGE',
    disclaimer: 'Simulação hipotética com caráter educacional e exploratório. Não representa proposta oficial.',
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(globalStats, null, 2), 'utf-8');

  console.log('✓ Global stats saved to', OUTPUT_FILE);
  console.log('\n--- Summary ---');
  console.log(`  Municípios: ${globalStats.municipiosOriginal} → ${globalStats.municipiosResultante} (-${globalStats.reducaoPercent.toFixed(1)}%)`);
  console.log(`  Economia total: R$ ${(globalStats.economiaTotal / 1e9).toFixed(2)} B`);
  console.log(`  Economia per capita: R$ ${globalStats.economiaPorHabitante.toFixed(2)}`);
  console.log(`  Déficit total: R$ ${(globalStats.deficitTotalAntes / 1e9).toFixed(2)} B → R$ ${(globalStats.deficitTotalDepois / 1e9).toFixed(2)} B`);
  console.log(`  Desequilíbrio (σ): ${globalStats.desequilibrioAntes.toFixed(0)} → ${globalStats.desequilibrioDepois.toFixed(0)}`);
  console.log(`  Pop. média/ente: ${Math.round(globalStats.populacaoMediaPorEnte).toLocaleString()}`);
}

main().catch((err) => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
