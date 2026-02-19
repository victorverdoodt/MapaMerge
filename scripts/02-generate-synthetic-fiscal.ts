// ============================================================
// Script 02-synth: Generate Synthetic Fiscal Data
// Creates realistic fiscal data for all municipalities
// to test the pipeline without waiting for SICONFI (~93 min).
// Replace with real data by running 02-fetch-fiscal.ts later.
// ============================================================
import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(__dirname, 'data');
const NAMES_FILE = path.join(DATA_DIR, 'municipios-nomes.json');
const OUTPUT_FILE = path.join(DATA_DIR, 'fiscal-raw.json');

// Seeded pseudo-random number generator (mulberry32)
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main() {
  console.log('=== Script 02-synth: Generate Synthetic Fiscal Data ===\n');

  if (!fs.existsSync(NAMES_FILE)) {
    throw new Error(`Names file not found: ${NAMES_FILE}\nRun script 01 first.`);
  }

  const names: Record<string, { nome: string; uf: string; ufNome: string }> =
    JSON.parse(fs.readFileSync(NAMES_FILE, 'utf-8'));

  const entries = Object.entries(names);
  console.log(`  Generating fiscal data for ${entries.length} municipalities...`);

  const rand = mulberry32(42);
  const result: Record<string, unknown> = {};

  // Realistic Brazilian municipality fiscal parameters (2023 values)
  // Most municipalities are small: ~70% have < 20,000 inhabitants
  for (const [codIbge, info] of entries) {
    // Generate realistic population with right distribution
    // Use lognormal-like: exp(Normal(9.2, 1.5))
    const u1 = rand();
    const u2 = rand();
    const normalRandom = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const logPop = 9.2 + 1.5 * normalRandom;
    const populacao = Math.max(800, Math.round(Math.exp(logPop)));

    // Revenue per capita ranges from ~R$2,000 (small) to ~R$8,000 (larger cities)
    const receitaPerCapita = 2000 + 4000 * (1 - Math.exp(-populacao / 100000)) + rand() * 1500;
    const receita = Math.round(populacao * receitaPerCapita);

    // Own revenue (receita própria) — increases with city size
    // Small municipalities: 5-15% of total revenue from own sources
    // Large municipalities: 30-50%
    const efaBase = 0.05 + 0.40 * (1 - Math.exp(-populacao / 200000));
    const efa = efaBase + (rand() - 0.5) * 0.1;
    const receitaPropria = Math.round(receita * Math.max(0.03, Math.min(0.60, efa)));

    // Expenses: most municipalities spend near or above their revenue
    // ~60% of municipalities have deficit in real data
    const despesaRatio = 0.85 + rand() * 0.30; // 0.85 to 1.15 of revenue
    const despesa = Math.round(receita * despesaRatio);

    // Personnel costs: typically 45-65% of total expenses
    const pessoalRatio = 0.45 + rand() * 0.20;
    const despesaPessoal = Math.round(despesa * pessoalRatio);

    const saldo = receita - despesa;

    result[codIbge] = {
      codIbge,
      nome: info.nome,
      uf: info.uf,
      populacao,
      receita,
      despesa,
      despesaPessoal,
      receitaPropria,
      efa: receita > 0 ? receitaPropria / receita : 0,
      saldo,
      dadosIndisponiveis: false,
    };
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2), 'utf-8');
  const sizeMB = (fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(1);

  // Quick stats
  const allEntries = Object.values(result) as Array<{ saldo: number; populacao: number }>;
  const deficitCount = allEntries.filter((e) => e.saldo < 0).length;
  const totalPop = allEntries.reduce((s, e) => s + e.populacao, 0);

  console.log(`\n✓ Saved synthetic fiscal data to ${OUTPUT_FILE} (${sizeMB} MB)`);
  console.log(`  Municipalities: ${allEntries.length}`);
  console.log(`  Total population: ${(totalPop / 1e6).toFixed(1)}M`);
  console.log(`  In deficit: ${deficitCount} (${((deficitCount / allEntries.length) * 100).toFixed(0)}%)`);
  console.log(`\n  ⚠ This is SYNTHETIC data for testing. Run 02-fetch-fiscal.ts for real SICONFI data.`);
}

main().catch((err) => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
