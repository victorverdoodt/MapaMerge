// ============================================================
// Script 07: Compute Global Stats + Bundle Optimizer Data
// Generates summary statistics for the sidebar
// Also bundles fiscal/adjacency/geo data for client-side optimizer
// ============================================================
import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, '..', 'public', 'data');
const MERGE_FILE = path.join(PUBLIC_DIR, 'merge-results.json');
const OUTPUT_FILE = path.join(PUBLIC_DIR, 'global-stats.json');
const BUNDLE_FILE = path.join(PUBLIC_DIR, 'optimizer-bundle.json');
const FISCAL_FILE = path.join(DATA_DIR, 'fiscal-raw.json');
const ADJACENCY_FILE = path.join(DATA_DIR, 'adjacency.json');
const GEO_FILE = path.join(DATA_DIR, 'municipality-geo.json');

async function main() {
  console.log('=== Script 07: Compute Global Stats ===\n');

  if (!fs.existsSync(MERGE_FILE)) {
    throw new Error(`Merge results not found: ${MERGE_FILE}\nRun script 05 first.`);
  }

  const mergeResults = JSON.parse(fs.readFileSync(MERGE_FILE, 'utf-8'));
  const stats = mergeResults.stats;

  const globalStats = {
    // Main headline numbers
    municipiosOriginal: stats.municipiosOriginal,
    municipiosResultante: stats.municipiosResultante,
    municipiosEliminados: stats.municipiosOriginal - stats.municipiosResultante,
    reducaoPercent: stats.reducaoPercent,

    // Financial — gross, net, and components
    economiaTotal: stats.economiaTotal,
    economiaLiquida: stats.economiaLiquida ?? stats.economiaTotal,
    perdaFPMTotal: stats.perdaFPMTotal ?? 0,
    custoTransicaoTotal: stats.custoTransicaoTotal ?? 0,
    economiaPorHabitante: stats.economiaPorHabitante,
    deficitTotalAntes: stats.deficitTotalAntes,
    deficitTotalDepois: stats.deficitTotalDepois,
    // Deficit values are negative; reduction = how much the absolute deficit shrank
    reducaoDeficit: stats.deficitTotalAntes !== 0
      ? ((Math.abs(stats.deficitTotalAntes) - Math.abs(stats.deficitTotalDepois)) / Math.abs(stats.deficitTotalAntes)) * 100
      : 0,

    // Fiscal autonomy (now changes post-merge when FPM is modeled)
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

    // Top 10 states by net economy  
    topEstados: (stats.byState || [])
      .sort((a: { economiaLiquida?: number; economiaTotal: number }, b: { economiaLiquida?: number; economiaTotal: number }) =>
        (b.economiaLiquida ?? b.economiaTotal) - (a.economiaLiquida ?? a.economiaTotal))
      .slice(0, 10)
      .map((s: {
        uf: string;
        nomeEstado: string;
        municipiosOriginal: number;
        municipiosResultante: number;
        reducaoPercent: number;
        economiaTotal: number;
        economiaLiquida?: number;
        perdaFPM?: number;
        custoTransicao?: number;
      }) => ({
        uf: s.uf,
        nomeEstado: s.nomeEstado,
        municipiosOriginal: s.municipiosOriginal,
        municipiosResultante: s.municipiosResultante,
        reducaoPercent: s.reducaoPercent,
        economiaTotal: s.economiaTotal,
        economiaLiquida: s.economiaLiquida ?? s.economiaTotal,
      })),

    // All state data
    byState: stats.byState || [],

    // Model parameters used
    params: stats.params || {},

    // Metadata
    dataSource: 'Tesouro Nacional (SICONFI/FINBRA) e IBGE',
    disclaimer: 'Simulação hipotética com caráter educacional e exploratório. Não representa proposta oficial.',
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(globalStats, null, 2), 'utf-8');

  // ============================================================
  // Bundle optimizer data for client-side re-optimization
  // ============================================================
  let bundleCreated = false;
  if (fs.existsSync(FISCAL_FILE) && fs.existsSync(ADJACENCY_FILE)) {
    console.log('\nBundling optimizer data for client-side use...');
    const bundle: Record<string, unknown> = {
      fiscal: JSON.parse(fs.readFileSync(FISCAL_FILE, 'utf-8')),
      adjacency: JSON.parse(fs.readFileSync(ADJACENCY_FILE, 'utf-8')),
      geo: fs.existsSync(GEO_FILE) ? JSON.parse(fs.readFileSync(GEO_FILE, 'utf-8')) : {},
    };
    fs.writeFileSync(BUNDLE_FILE, JSON.stringify(bundle), 'utf-8');
    const bundleSize = (fs.statSync(BUNDLE_FILE).size / 1024 / 1024).toFixed(2);
    console.log(`  ✓ Saved optimizer bundle to ${BUNDLE_FILE} (${bundleSize} MB)`);
    if (!fs.existsSync(GEO_FILE)) {
      console.warn('  ⚠ municipality-geo.json not found — geographic constraints disabled in client');
      console.warn('    Run script 04 to generate it.');
    }
    bundleCreated = true;
  } else {
    console.warn('\n⚠ Could not create optimizer bundle (missing fiscal or adjacency data)');
    console.warn('  Run scripts 02 and 04 first.');
  }

  const economiaLiquida = globalStats.economiaLiquida;
  console.log('✓ Global stats saved to', OUTPUT_FILE);
  console.log('\n--- Summary ---');
  console.log(`  Municípios: ${globalStats.municipiosOriginal} → ${globalStats.municipiosResultante} (-${globalStats.reducaoPercent.toFixed(1)}%)`);
  console.log(`  Economia bruta: R$ ${(globalStats.economiaTotal / 1e9).toFixed(2)} B`);
  console.log(`  Perda FPM: R$ ${(Math.abs(globalStats.perdaFPMTotal) / 1e9).toFixed(2)} B`);
  console.log(`  Custo transição: R$ ${(globalStats.custoTransicaoTotal / 1e9).toFixed(2)} B/ano`);
  console.log(`  Economia líquida: R$ ${(economiaLiquida / 1e9).toFixed(2)} B`);
  console.log(`  Economia per capita: R$ ${globalStats.economiaPorHabitante.toFixed(2)}`);
  console.log(`  EFA: ${(globalStats.efaAntes * 100).toFixed(1)}% → ${(globalStats.efaDepois * 100).toFixed(1)}%`);
  console.log(`  Déficit: R$ ${(globalStats.deficitTotalAntes / 1e9).toFixed(2)} B → R$ ${(globalStats.deficitTotalDepois / 1e9).toFixed(2)} B`);
  console.log(`  Desequilíbrio (σ): ${globalStats.desequilibrioAntes.toFixed(0)} → ${globalStats.desequilibrioDepois.toFixed(0)}`);
  console.log(`  Pop. média/ente: ${Math.round(globalStats.populacaoMediaPorEnte).toLocaleString()}`);
}

main().catch((err) => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
