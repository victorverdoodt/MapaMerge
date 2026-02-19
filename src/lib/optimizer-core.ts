// ============================================================
// Client-side optimization engine
// Pure functions — no Node.js, no Turf.js dependencies
// Haversine for distance, pre-computed data for area
// ============================================================
import type {
  OptimizationParams,
  MergeGroup,
  GlobalStats,
  StateStats,
  MergeResults,
  MunicipalityData,
} from './types';

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

export function getCoefFPM(pop: number): number {
  for (const b of FPM_BRACKETS) {
    if (pop <= b.maxPop) return b.coef;
  }
  return 4.0;
}

// ============================================================
// Default parameters & presets
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

// ============================================================
// UF Names
// ============================================================
const UF_NAMES: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas',
  BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo',
  GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul',
  MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná',
  PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte',
  RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina',
  SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
};

// ============================================================
// Haversine distance (km) — replaces turf.distance
// ============================================================
function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ============================================================
// Geo data type (from municipality-geo.json)
// ============================================================
export interface MunicipalityGeo {
  areaKm2: number;
  centroid: [number, number]; // [lng, lat]
}

// ============================================================
// Internal merge node type
// ============================================================
interface MergeNode {
  id: string;
  members: string[];
  memberFiscal: MunicipalityData[];
  nome: string;
  uf: string;
  populacao: number;
  receita: number;
  despesa: number;
  despesaPessoal: number;
  despesaAdmin: number;
  receitaPropria: number;
  receitaTransferencias: number;
  fpm: number;
  economia: number;         // gross savings
  perdaFPM: number;         // cumulative FPM loss (negative)
  custoTransicao: number;   // annualized transition cost
  economiaLiquida: number;  // net = economia + perdaFPM - custoTransicao
  areaKm2: number;
  centroid: [number, number];
  active: boolean;
}

interface SavingsEntry {
  nodeA: string;
  nodeB: string;
  savings: number;
}

// ============================================================
// FPM change estimation
// ============================================================
function estimateFPMChange(
  members: MunicipalityData[],
  combinedPop: number,
  params: OptimizationParams
): number {
  if (!params.modelFPM) return 0;

  const totalFPMBefore = members.reduce((s, m) => s + (m.fpm || 0), 0);
  if (totalFPMBefore === 0) return 0;

  const coefBefore = members.reduce((s, m) => s + getCoefFPM(m.populacao), 0);
  const coefAfter = getCoefFPM(combinedPop);
  if (coefBefore === 0) return 0;

  const fpmAfter = totalFPMBefore * (coefAfter / coefBefore);
  return fpmAfter - totalFPMBefore; // negative = loss
}

// ============================================================
// Net savings calculation for a potential merge
// ============================================================
function calculateNetSavings(
  a: MergeNode,
  b: MergeNode,
  geoData: Record<string, MunicipalityGeo>,
  params: OptimizationParams
): number {
  const combinedPop = a.populacao + b.populacao;
  const combinedMembers = a.members.length + b.members.length;

  // Hard constraints
  if (combinedPop > params.maxPopulation) return 0;
  if (combinedMembers > params.maxMembers) return 0;
  if (a.populacao >= params.minPopulationTrigger && b.populacao >= params.minPopulationTrigger) return 0;

  // Geographic constraints
  const combinedArea = a.areaKm2 + b.areaKm2;
  if (combinedArea > params.maxAreaKm2) return 0;

  const dist = haversineKm(a.centroid, b.centroid);
  if (dist > params.maxCentroidDistanceKm) return 0;

  // Determine smaller / larger
  const [smaller, _larger] = a.populacao <= b.populacao ? [a, b] : [b, a];

  // Admin savings
  let adminCosts: number;
  if (params.useRealAdminCosts && smaller.despesaAdmin > 0) {
    adminCosts = smaller.despesaAdmin;
  } else {
    adminCosts = smaller.despesa * params.adminCostEstimate;
  }
  const adminSavings = adminCosts * params.adminSavingsRate;

  // Personnel savings
  const personnelSavings = smaller.despesaPessoal * params.personnelSavingsRate;

  const grossSavings = personnelSavings + adminSavings;

  // FPM impact
  const allMembers = [...a.memberFiscal, ...b.memberFiscal];
  const fpmChange = estimateFPMChange(allMembers, combinedPop, params);

  // Transition cost (annualized)
  const transitionTotal = smaller.populacao * params.transitionCostPerCapita;
  const annualTransitionCost = transitionTotal / params.amortizationYears;

  // Net annual savings
  const netSavings = grossSavings + fpmChange - annualTransitionCost;

  if (netSavings < params.minSavingsThreshold) return 0;

  // Diminishing returns for larger merges
  const sizePenalty = Math.min(1, 500_000 / combinedPop);
  return netSavings * sizePenalty;
}

// ============================================================
// Greedy optimizer for a single state
// ============================================================
function optimizeStateGreedy(
  stateMunicipios: MunicipalityData[],
  adjacency: Record<string, string[]>,
  geoData: Record<string, MunicipalityGeo>,
  params: OptimizationParams
): {
  groups: MergeNode[];
  ungrouped: string[];
  economia: number;
  perdaFPMTotal: number;
  custoTransicaoTotal: number;
} {
  // Initialize nodes
  const nodes = new Map<string, MergeNode>();
  for (const m of stateMunicipios) {
    if (m.dadosIndisponiveis) continue;
    const geo = geoData[m.codIbge] || { areaKm2: 0, centroid: [0, 0] as [number, number] };
    nodes.set(m.codIbge, {
      id: m.codIbge,
      members: [m.codIbge],
      memberFiscal: [m],
      nome: m.nome,
      uf: m.uf,
      populacao: m.populacao,
      receita: m.receita,
      despesa: m.despesa,
      despesaPessoal: m.despesaPessoal,
      despesaAdmin: m.despesaAdmin || 0,
      receitaPropria: m.receitaPropria,
      receitaTransferencias: m.receitaTransferencias || 0,
      fpm: m.fpm || 0,
      economia: 0,
      perdaFPM: 0,
      custoTransicao: 0,
      economiaLiquida: 0,
      areaKm2: geo.areaKm2,
      centroid: geo.centroid,
      active: true,
    });
  }

  // Build adjacency for this state only
  const stateAdj = new Map<string, Set<string>>();
  for (const [cod, neighbors] of Object.entries(adjacency)) {
    if (!nodes.has(cod)) continue;
    stateAdj.set(cod, new Set(neighbors.filter(n => nodes.has(n))));
  }

  // Build initial savings queue
  const savingsQueue: SavingsEntry[] = [];
  const processed = new Set<string>();

  for (const [codA, neighbors] of Array.from(stateAdj.entries())) {
    for (const codB of Array.from(neighbors)) {
      const key = codA < codB ? `${codA}-${codB}` : `${codB}-${codA}`;
      if (processed.has(key)) continue;
      processed.add(key);

      const nodeA = nodes.get(codA)!;
      const nodeB = nodes.get(codB)!;
      const savings = calculateNetSavings(nodeA, nodeB, geoData, params);
      if (savings > 0) {
        savingsQueue.push({ nodeA: codA, nodeB: codB, savings });
      }
    }
  }

  savingsQueue.sort((a, b) => b.savings - a.savings);

  // Greedy merge loop
  let totalEconomia = 0;
  let totalPerdaFPM = 0;
  let totalCustoTransicao = 0;

  while (savingsQueue.length > 0) {
    const best = savingsQueue.shift()!;
    const nodeA = nodes.get(best.nodeA);
    const nodeB = nodes.get(best.nodeB);
    if (!nodeA?.active || !nodeB?.active) continue;

    const [larger, smaller] = nodeA.populacao >= nodeB.populacao ? [nodeA, nodeB] : [nodeB, nodeA];
    const netSavings = calculateNetSavings(larger, smaller, geoData, params);
    if (netSavings <= 0) continue;

    // Compute components
    const allMembers = [...larger.memberFiscal, ...smaller.memberFiscal];
    const combinedPop = larger.populacao + smaller.populacao;
    const fpmChange = estimateFPMChange(allMembers, combinedPop, params);
    const annualTransitionCost = (smaller.populacao * params.transitionCostPerCapita) / params.amortizationYears;

    // Gross savings
    let adminCosts: number;
    if (params.useRealAdminCosts && smaller.despesaAdmin > 0) {
      adminCosts = smaller.despesaAdmin;
    } else {
      adminCosts = smaller.despesa * params.adminCostEstimate;
    }
    const grossSavings = (smaller.despesaPessoal * params.personnelSavingsRate) + (adminCosts * params.adminSavingsRate);

    // Merge: larger absorbs smaller
    larger.members = [...larger.members, ...smaller.members];
    larger.memberFiscal = allMembers;
    larger.populacao = combinedPop;
    larger.receita += smaller.receita;
    larger.despesa += smaller.despesa;
    larger.despesaPessoal += smaller.despesaPessoal;
    larger.despesaAdmin += smaller.despesaAdmin;
    larger.receitaPropria += smaller.receitaPropria;
    larger.receitaTransferencias += smaller.receitaTransferencias;
    larger.fpm += smaller.fpm;
    larger.economia += grossSavings;
    larger.perdaFPM += fpmChange;
    larger.custoTransicao += annualTransitionCost;
    larger.economiaLiquida += grossSavings + fpmChange - annualTransitionCost;

    // Update centroid (area-weighted)
    const totalArea = larger.areaKm2 + smaller.areaKm2;
    if (totalArea > 0) {
      larger.centroid = [
        (larger.centroid[0] * larger.areaKm2 + smaller.centroid[0] * smaller.areaKm2) / totalArea,
        (larger.centroid[1] * larger.areaKm2 + smaller.centroid[1] * smaller.areaKm2) / totalArea,
      ];
    }
    larger.areaKm2 = totalArea;

    smaller.active = false;

    // Transfer adjacency
    const smallerNeighbors = stateAdj.get(smaller.id) || new Set<string>();
    const largerNeighbors = stateAdj.get(larger.id) || new Set<string>();

    for (const n of Array.from(smallerNeighbors)) {
      if (n === larger.id) continue;
      largerNeighbors.add(n);
      const nAdj = stateAdj.get(n);
      if (nAdj) {
        nAdj.delete(smaller.id);
        nAdj.add(larger.id);
      }
    }
    largerNeighbors.delete(smaller.id);
    stateAdj.set(larger.id, largerNeighbors);

    // Recompute savings for new edges
    for (const neighborId of Array.from(largerNeighbors)) {
      const neighbor = nodes.get(neighborId);
      if (!neighbor?.active) continue;
      const newSavings = calculateNetSavings(larger, neighbor, geoData, params);
      if (newSavings > 0) {
        savingsQueue.push({ nodeA: larger.id, nodeB: neighborId, savings: newSavings });
      }
    }
    savingsQueue.sort((a, b) => b.savings - a.savings);

    totalEconomia += grossSavings;
    totalPerdaFPM += fpmChange;
    totalCustoTransicao += annualTransitionCost;
  }

  // Collect results
  const groups: MergeNode[] = [];
  const ungrouped: string[] = [];

  for (const node of Array.from(nodes.values())) {
    if (!node.active) continue;
    if (node.members.length > 1) {
      groups.push(node);
    } else {
      ungrouped.push(node.id);
    }
  }

  return { groups, ungrouped, economia: totalEconomia, perdaFPMTotal: totalPerdaFPM, custoTransicaoTotal: totalCustoTransicao };
}

// ============================================================
// Standard deviation helper
// ============================================================
function stddev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
}

// ============================================================
// Main orchestrator — runs greedy optimizer for all states
// Returns MergeResults ready for display
// ============================================================
export function runOptimization(
  fiscal: Record<string, MunicipalityData>,
  adjacency: Record<string, string[]>,
  geoData: Record<string, MunicipalityGeo>,
  params: OptimizationParams
): MergeResults {
  const allMunicipios = Object.values(fiscal);

  // Group by state
  const byState = new Map<string, MunicipalityData[]>();
  for (const m of allMunicipios) {
    const arr = byState.get(m.uf) || [];
    arr.push(m);
    byState.set(m.uf, arr);
  }

  // Run per-state optimization
  const allGroups: MergeNode[] = [];
  const allUngrouped: string[] = [];
  let totalEconomia = 0;
  let totalPerdaFPM = 0;
  let totalCustoTransicao = 0;

  const stateResults: StateStats[] = [];

  for (const [uf, municipios] of Array.from(byState.entries())) {
    const result = optimizeStateGreedy(municipios, adjacency, geoData, params);

    allGroups.push(...result.groups);
    allUngrouped.push(...result.ungrouped);
    totalEconomia += result.economia;
    totalPerdaFPM += result.perdaFPMTotal;
    totalCustoTransicao += result.custoTransicaoTotal;

    const validMunicipios: MunicipalityData[] = municipios.filter((m: MunicipalityData) => !m.dadosIndisponiveis);
    const municipiosOriginal = validMunicipios.length;
    const municipiosResultante = result.groups.length + result.ungrouped.length;

    // EFA before
    const totalReceitaAntes = validMunicipios.reduce((s: number, m: MunicipalityData) => s + m.receita, 0);
    const totalReceitaPropriaAntes = validMunicipios.reduce((s: number, m: MunicipalityData) => s + m.receitaPropria, 0);
    const deficitAntes = validMunicipios.filter((m: MunicipalityData) => m.saldo < 0).reduce((s: number, m: MunicipalityData) => s + m.saldo, 0);

    // EFA after — revenue adjusted for FPM loss
    const groupReceita = result.groups.reduce((s, g) => s + g.receita + g.perdaFPM, 0);
    const groupReceitaPropria = result.groups.reduce((s, g) => s + g.receitaPropria, 0);
    const ungroupedNodes = result.ungrouped.map(id => fiscal[id]).filter(Boolean);
    const ungroupedReceita = ungroupedNodes.reduce((s, m) => s + m.receita, 0);
    const ungroupedReceitaPropria = ungroupedNodes.reduce((s, m) => s + m.receitaPropria, 0);
    const totalReceitaDepois = groupReceita + ungroupedReceita;
    const totalReceitaPropriaDepois = groupReceitaPropria + ungroupedReceitaPropria;

    // Deficit after: saldoOtimizado = saldo + economiaLiquida (correct formula)
    const deficitDepois = [
      ...result.groups.map(g => (g.receita - g.despesa) + g.economiaLiquida),
      ...ungroupedNodes.map(m => m.saldo),
    ].filter(s => s < 0).reduce((sum, s) => sum + s, 0);

    const economiaLiquida = result.economia + result.perdaFPMTotal - result.custoTransicaoTotal;

    stateResults.push({
      uf,
      nomeEstado: UF_NAMES[uf] || uf,
      municipiosOriginal,
      municipiosResultante,
      reducaoPercent: municipiosOriginal > 0 ? ((municipiosOriginal - municipiosResultante) / municipiosOriginal) * 100 : 0,
      economiaTotal: result.economia,
      economiaLiquida,
      perdaFPM: result.perdaFPMTotal,
      custoTransicao: result.custoTransicaoTotal,
      efaAntes: totalReceitaAntes > 0 ? totalReceitaPropriaAntes / totalReceitaAntes : 0,
      efaDepois: totalReceitaDepois > 0 ? totalReceitaPropriaDepois / totalReceitaDepois : 0,
      deficitAntes,
      deficitDepois,
    });
  }

  // Sort states by net economy
  stateResults.sort((a, b) => b.economiaLiquida - a.economiaLiquida);

  // National aggregates
  const totalOriginal = allMunicipios.filter(m => !m.dadosIndisponiveis).length;
  const totalResultante = allGroups.length + allUngrouped.length;
  const totalPopulacao = allMunicipios.reduce((s, m) => s + m.populacao, 0);
  const totalReceita = allMunicipios.reduce((s, m) => s + m.receita, 0);
  const totalReceitaPropria = allMunicipios.reduce((s, m) => s + m.receitaPropria, 0);
  const totalEconomiaLiquida = totalEconomia + totalPerdaFPM - totalCustoTransicao;

  // National EFA after
  const totalReceitaDepoisNac = allGroups.reduce((s, g) => s + g.receita + g.perdaFPM, 0)
    + allUngrouped.reduce((s, id) => s + (fiscal[id]?.receita || 0), 0);
  const totalReceitaPropriaNac = allGroups.reduce((s, g) => s + g.receitaPropria, 0)
    + allUngrouped.reduce((s, id) => s + (fiscal[id]?.receitaPropria || 0), 0);

  // Deficit before/after
  const deficitTotalAntes = allMunicipios
    .filter(m => !m.dadosIndisponiveis && m.saldo < 0)
    .reduce((s, m) => s + m.saldo, 0);
  const deficitTotalDepois = stateResults.reduce((s, st) => s + st.deficitDepois, 0);

  // Desequilíbrio (σ of saldo per capita)
  const saldosAntes = allMunicipios
    .filter(m => !m.dadosIndisponiveis && m.populacao > 0)
    .map(m => m.saldo / m.populacao);
  const desequilibrioAntes = stddev(saldosAntes);

  const saldosDepois: number[] = [];
  for (const g of allGroups) {
    const saldoOtimizado = (g.receita - g.despesa) + g.economiaLiquida;
    if (g.populacao > 0) saldosDepois.push(saldoOtimizado / g.populacao);
  }
  for (const id of allUngrouped) {
    const m = fiscal[id];
    if (m && m.populacao > 0) saldosDepois.push(m.saldo / m.populacao);
  }
  const desequilibrioDepois = stddev(saldosDepois);

  // Build output groups in MergeGroup format
  const groups: MergeGroup[] = allGroups.map(g => ({
    id: g.id,
    members: g.members,
    nome: g.nome,
    uf: g.uf,
    populacao: g.populacao,
    receita: g.receita,
    despesa: g.despesa,
    despesaPessoal: g.despesaPessoal,
    receitaPropria: g.receitaPropria,
    efa: g.receita > 0 ? g.receitaPropria / g.receita : 0,
    saldo: g.receita - g.despesa,
    economia: g.economia,
    economiaLiquida: g.economiaLiquida,
    perdaFPM: g.perdaFPM,
    custoTransicao: g.custoTransicao,
    saldoOtimizado: (g.receita - g.despesa) + g.economiaLiquida,
    areaKm2: Math.round(g.areaKm2),
  }));

  const reducaoPercent = totalOriginal > 0 ? ((totalOriginal - totalResultante) / totalOriginal) * 100 : 0;
  const reducaoDeficit = deficitTotalAntes !== 0
    ? ((Math.abs(deficitTotalAntes) - Math.abs(deficitTotalDepois)) / Math.abs(deficitTotalAntes)) * 100
    : 0;
  const reducaoDesequilibrio = desequilibrioAntes > 0
    ? ((desequilibrioAntes - desequilibrioDepois) / desequilibrioAntes) * 100
    : 0;

  const stats: GlobalStats = {
    municipiosOriginal: totalOriginal,
    municipiosResultante: totalResultante,
    municipiosEliminados: totalOriginal - totalResultante,
    reducaoPercent,
    economiaTotal: totalEconomia,
    economiaLiquida: totalEconomiaLiquida,
    perdaFPMTotal: totalPerdaFPM,
    custoTransicaoTotal: totalCustoTransicao,
    economiaPorHabitante: totalPopulacao > 0 ? totalEconomiaLiquida / totalPopulacao : 0,
    efaAntes: totalReceita > 0 ? totalReceitaPropria / totalReceita : 0,
    efaDepois: totalReceitaDepoisNac > 0 ? totalReceitaPropriaNac / totalReceitaDepoisNac : 0,
    desequilibrioAntes,
    desequilibrioDepois,
    reducaoDesequilibrio,
    reducaoDeficit,
    populacaoMediaPorEnte: totalResultante > 0 ? totalPopulacao / totalResultante : 0,
    totalGruposFusao: allGroups.length,
    deficitTotalAntes,
    deficitTotalDepois,
    topEstados: stateResults.slice(0, 10).map(s => ({
      uf: s.uf,
      nomeEstado: s.nomeEstado,
      municipiosOriginal: s.municipiosOriginal,
      municipiosResultante: s.municipiosResultante,
      reducaoPercent: s.reducaoPercent,
      economiaTotal: s.economiaTotal,
      economiaLiquida: s.economiaLiquida,
    })),
    byState: stateResults,
    params: {
      personnelSavingsRate: params.personnelSavingsRate,
      adminSavingsRate: params.adminSavingsRate,
      transitionCostPerCapita: params.transitionCostPerCapita,
      amortizationYears: params.amortizationYears,
      modelFPM: params.modelFPM,
      maxPopulation: params.maxPopulation,
      maxMembers: params.maxMembers,
      maxAreaKm2: params.maxAreaKm2,
      maxCentroidDistanceKm: params.maxCentroidDistanceKm,
      algorithm: params.algorithm,
    },
  };

  return { groups, ungrouped: allUngrouped, stats };
}
