// ============================================================
// Script 02b: Augment fiscal-raw.json with estimated fields
// 
// Adds missing fields (fpm, despesaAdmin, receitaTransferencias)
// using estimation models when real data isn't available.
// 
// This is faster than re-fetching all 5,570 municipalities
// from SICONFI (~93 min). Run 02-fetch-fiscal.ts for real data.
// ============================================================
import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(__dirname, 'data');
const FISCAL_FILE = path.join(DATA_DIR, 'fiscal-raw.json');

// ============================================================
// FPM Coefficient Table (DL 1.881/1981, LC 91/1997)
// Interior municipalities only
// ============================================================
const FPM_BRACKETS: { maxPop: number; coef: number }[] = [
  { maxPop: 10188, coef: 0.6 },
  { maxPop: 13584, coef: 0.8 },
  { maxPop: 16980, coef: 1.0 },
  { maxPop: 23772, coef: 1.2 },
  { maxPop: 30564, coef: 1.4 },
  { maxPop: 37356, coef: 1.6 },
  { maxPop: 44148, coef: 1.8 },
  { maxPop: 50940, coef: 2.0 },
  { maxPop: 61128, coef: 2.2 },
  { maxPop: 71316, coef: 2.4 },
  { maxPop: 81504, coef: 2.6 },
  { maxPop: 91692, coef: 2.8 },
  { maxPop: 101880, coef: 3.0 },
  { maxPop: 115464, coef: 3.2 },
  { maxPop: 129048, coef: 3.4 },
  { maxPop: 142632, coef: 3.6 },
  { maxPop: 156216, coef: 3.8 },
  { maxPop: Infinity, coef: 4.0 },
];

function getCoefFPM(pop: number): number {
  for (const b of FPM_BRACKETS) {
    if (pop <= b.maxPop) return b.coef;
  }
  return 4.0;
}

// ============================================================
// State capitals (get FPM from a separate pool)
// ============================================================
const STATE_CAPITALS: Record<string, string> = {
  AC: '1200401', AL: '2704302', AP: '1600303', AM: '1302603',
  BA: '2927408', CE: '2304400', DF: '5300108', ES: '3205309',
  GO: '5208707', MA: '2111300', MT: '5103403', MS: '5002704',
  MG: '3106200', PA: '1501402', PB: '2507507', PR: '4106902',
  PE: '2611606', PI: '2211001', RJ: '3304557', RN: '2408102',
  RS: '4314902', RO: '1100205', RR: '1400100', SC: '4205407',
  SP: '3550308', SE: '2800308', TO: '1721000',
};

const capitalCodes = new Set(Object.values(STATE_CAPITALS));

// ============================================================
// FPM Interior State Participation Indices
// Source: DL 1.881/1981 Annex, with adjustments
// These represent each state's percentage of the FPM Interior pool
// ============================================================
const FPM_STATE_SHARES: Record<string, number> = {
  AC: 0.2630, AL: 2.0883, AP: 0.1392, AM: 1.2452,
  BA: 7.2857, CE: 4.5399, DF: 0.0000, ES: 1.7595,
  GO: 3.7318, MA: 3.9715, MT: 1.8949, MS: 1.5004,
  MG: 14.1846, PA: 3.2948, PB: 3.1942, PR: 7.2857,
  PE: 4.7952, PI: 2.4015, RJ: 2.7379, RN: 2.4324,
  RS: 7.3011, RO: 0.7464, RR: 0.0851, SC: 4.1997,
  SP: 14.2620, SE: 1.3342, TO: 1.2955,
  // Total: ~98.15% (some small rounding; remainder is reserve fund adjustments)
};

// ============================================================
// Total FPM amounts for 2024 (approximate, in R$)
// Source: STN / Tesouro Nacional
// ============================================================
const TOTAL_FPM_INTERIOR = 155_000_000_000; // ~R$155B for interior pool
const TOTAL_FPM_CAPITALS = 19_000_000_000;  // ~R$19B for capitals pool

interface FiscalEntry {
  codIbge: string;
  nome: string;
  uf: string;
  populacao: number;
  receita: number;
  despesa: number;
  despesaPessoal: number;
  receitaPropria: number;
  efa: number;
  saldo: number;
  ano: number;
  dadosIndisponiveis: boolean;
  // New fields to add:
  fpm?: number;
  despesaAdmin?: number;
  receitaTransferencias?: number;
}

async function main() {
  console.log('=== Script 02b: Augment Fiscal Data ===\n');

  const fiscal: Record<string, FiscalEntry> = JSON.parse(
    fs.readFileSync(FISCAL_FILE, 'utf-8')
  );

  const entries = Object.values(fiscal).filter(m => !m.dadosIndisponiveis);
  console.log(`  Total entries: ${Object.keys(fiscal).length}`);
  console.log(`  Valid entries: ${entries.length}`);

  // --------------------------------------------------------
  // Step 1: Estimate receitaTransferencias
  // transfers = receita - receitaPropria (a solid approximation)
  // --------------------------------------------------------
  for (const m of entries) {
    m.receitaTransferencias = Math.max(0, m.receita - m.receitaPropria);
  }

  // --------------------------------------------------------
  // Step 2: Estimate FPM using the coefficient distribution model
  // --------------------------------------------------------

  // Compute coefficients for interior municipalities per state
  const stateInteriorCoefs = new Map<string, { cod: string; coef: number; pop: number }[]>();
  const capitalsList: FiscalEntry[] = [];

  for (const m of entries) {
    if (capitalCodes.has(m.codIbge)) {
      capitalsList.push(m);
    } else {
      const arr = stateInteriorCoefs.get(m.uf) || [];
      arr.push({ cod: m.codIbge, coef: getCoefFPM(m.populacao), pop: m.populacao });
      stateInteriorCoefs.set(m.uf, arr);
    }
  }

  // Distribute FPM Interior per state using state shares, then within state by coefficient
  let totalFPMDistributed = 0;
  for (const [uf, municipalities] of Array.from(stateInteriorCoefs.entries())) {
    const stateSharePct = FPM_STATE_SHARES[uf] || 0;
    if (stateSharePct === 0) continue;

    const stateFPMPool = TOTAL_FPM_INTERIOR * (stateSharePct / 100);
    const totalCoefInState = municipalities.reduce((s, m) => s + m.coef, 0);
    if (totalCoefInState === 0) continue;

    for (const mun of municipalities) {
      const share = mun.coef / totalCoefInState;
      const fpmEstimate = stateFPMPool * share;
      fiscal[mun.cod].fpm = Math.round(fpmEstimate);
      totalFPMDistributed += fpmEstimate;
    }
  }

  // Distribute FPM Capitals by population
  const totalCapitalPop = capitalsList.reduce((s, m) => s + m.populacao, 0);
  for (const m of capitalsList) {
    const share = m.populacao / totalCapitalPop;
    const fpmEstimate = TOTAL_FPM_CAPITALS * share;
    fiscal[m.codIbge].fpm = Math.round(fpmEstimate);
    totalFPMDistributed += fpmEstimate;
  }

  console.log(`  Total FPM distributed: R$ ${(totalFPMDistributed / 1e9).toFixed(1)}B`);

  // --------------------------------------------------------
  // Step 3: Estimate despesaAdmin
  // Administrative costs (legislativa + administrativa) ≈ 12-18% of total despesa
  // Use 15% as baseline, adjusted by municipality size
  // Smaller municipalities have proportionally higher admin overhead
  // --------------------------------------------------------
  for (const m of entries) {
    // Small municipalities: ~18% admin overhead
    // Medium: ~14%
    // Large: ~10%
    let adminRate: number;
    if (m.populacao < 10000) {
      adminRate = 0.18;
    } else if (m.populacao < 50000) {
      adminRate = 0.15;
    } else if (m.populacao < 200000) {
      adminRate = 0.12;
    } else {
      adminRate = 0.10;
    }
    fiscal[m.codIbge].despesaAdmin = Math.round(m.despesa * adminRate);
  }

  // --------------------------------------------------------
  // Step 4: Set defaults for unavailable municipalities
  // --------------------------------------------------------
  for (const m of Object.values(fiscal)) {
    if (m.dadosIndisponiveis) {
      m.fpm = 0;
      m.despesaAdmin = 0;
      m.receitaTransferencias = 0;
    }
    // Ensure all fields exist
    m.fpm = m.fpm || 0;
    m.despesaAdmin = m.despesaAdmin || 0;
    m.receitaTransferencias = m.receitaTransferencias || 0;
  }

  // --------------------------------------------------------
  // Summary statistics
  // --------------------------------------------------------
  const totalFPM = Object.values(fiscal).reduce((s, m) => s + (m.fpm || 0), 0);
  const avgFPMPercent = entries.filter(m => m.receita > 0)
    .map(m => ((m.fpm || 0) / m.receita) * 100);
  const meanFPM = avgFPMPercent.reduce((s, v) => s + v, 0) / avgFPMPercent.length;

  const totalAdmin = Object.values(fiscal).reduce((s, m) => s + (m.despesaAdmin || 0), 0);
  const totalTransf = Object.values(fiscal).reduce((s, m) => s + (m.receitaTransferencias || 0), 0);

  console.log(`\n  Summary:`);
  console.log(`    FPM total:              R$ ${(totalFPM / 1e9).toFixed(1)}B`);
  console.log(`    FPM avg % of receita:   ${meanFPM.toFixed(1)}%`);
  console.log(`    despesaAdmin total:      R$ ${(totalAdmin / 1e9).toFixed(1)}B`);
  console.log(`    receitaTransf total:     R$ ${(totalTransf / 1e9).toFixed(1)}B`);

  // Sample: show a few municipalities
  const samples = ['3550308', '2304400', '1100205', '5002704', entries.find(m => m.populacao < 5000)?.codIbge].filter(Boolean) as string[];
  console.log(`\n  Samples:`);
  for (const cod of samples) {
    const m = fiscal[cod];
    if (!m) continue;
    console.log(`    ${m.nome} (${m.uf}): pop=${m.populacao.toLocaleString()} fpm=R$${((m.fpm || 0) / 1e6).toFixed(1)}M (${(((m.fpm || 0) / m.receita) * 100).toFixed(1)}%) admin=R$${((m.despesaAdmin || 0) / 1e6).toFixed(1)}M transf=R$${((m.receitaTransferencias || 0) / 1e6).toFixed(1)}M`);
  }

  // --------------------------------------------------------
  // Write back
  // --------------------------------------------------------
  fs.writeFileSync(FISCAL_FILE, JSON.stringify(fiscal, null, 2), 'utf-8');
  console.log(`\n  ✓ Updated ${FISCAL_FILE}`);
  console.log('  Done!\n');
}

main().catch(console.error);
