// ============================================================
// Shared constants for optimizer (client & server)
// Single source of truth for FPM brackets, UF names, and defaults
// ============================================================
import type { OptimizationParams } from './types';

// ============================================================
// FPM Coefficient Table (DL 1.881/1981, LC 91/1997)
// Interior municipalities only
// ============================================================
export const FPM_BRACKETS: { maxPop: number; coef: number }[] = [
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

/**
 * Get the FPM coefficient for a given population.
 * Based on DL 1.881/1981 and LC 91/1997.
 */
export function getCoefFPM(pop: number): number {
  for (const b of FPM_BRACKETS) {
    if (pop <= b.maxPop) return b.coef;
  }
  return 4.0;
}

// ============================================================
// Brazilian state names
// ============================================================
export const UF_NAMES: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas',
  BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo',
  GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul',
  MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná',
  PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte',
  RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina',
  SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
};

// ============================================================
// Default parameters: "Moderate" scenario
// ============================================================
export const DEFAULT_PARAMS: OptimizationParams = {
  personnelSavingsRate: 0.20,
  adminSavingsRate: 0.30,
  adminCostEstimate: 0.15,
  useRealAdminCosts: true,
  transitionCostPerCapita: 200,
  amortizationYears: 7,
  modelFPM: true,
  maxPopulation: 150_000,
  maxMembers: 6,
  minSavingsThreshold: 200_000,
  minPopulationTrigger: 50_000,
  maxAreaKm2: 15_000,
  maxCentroidDistanceKm: 80,
  algorithm: 'greedy',
  saIterations: 0,
  saInitialTemp: 0,
  saCoolingRate: 0,
};

// ============================================================
// Preset parameter scenarios
// ============================================================
export const PRESETS: Record<string, Partial<OptimizationParams>> = {
  conservador: {
    personnelSavingsRate: 0.10,
    adminSavingsRate: 0.20,
    transitionCostPerCapita: 300,
    amortizationYears: 10,
    modelFPM: true,
    maxPopulation: 100_000,
    maxMembers: 4,
    maxAreaKm2: 10_000,
    maxCentroidDistanceKm: 60,
  },
  moderado: {
    personnelSavingsRate: 0.20,
    adminSavingsRate: 0.30,
    transitionCostPerCapita: 200,
    amortizationYears: 7,
    modelFPM: true,
    maxPopulation: 150_000,
    maxMembers: 6,
    maxAreaKm2: 15_000,
    maxCentroidDistanceKm: 80,
  },
  agressivo: {
    personnelSavingsRate: 0.35,
    adminSavingsRate: 0.45,
    transitionCostPerCapita: 100,
    amortizationYears: 5,
    modelFPM: false,
    maxPopulation: 250_000,
    maxMembers: 8,
    maxAreaKm2: 25_000,
    maxCentroidDistanceKm: 120,
  },
};
