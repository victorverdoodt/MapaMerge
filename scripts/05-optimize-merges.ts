// ============================================================
// Script 05: Optimize Merges (Greedy + Simulated Annealing)
// Realistic municipal merger simulation with:
// - Calibrated savings rates (literature-based)
// - FPM coefficient modeling (DL 1.881/1981)
// - Transition cost amortization
// - Geographic constraints (area, centroid distance)
// - Simulated annealing refinement
// ============================================================
import * as fs from 'fs';
import * as path from 'path';
import * as turf from '@turf/turf';
import { getCoefFPM, UF_NAMES } from '../src/lib/constants';
import type { OptimizationParams } from '../src/lib/types';

const DATA_DIR = path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, '..', 'public', 'data');
const FISCAL_FILE = path.join(DATA_DIR, 'fiscal-raw.json');
const ADJACENCY_FILE = path.join(DATA_DIR, 'adjacency.json');
const GEO_FILE = path.join(DATA_DIR, 'municipality-geo.json');
const OUTPUT_FILE = path.join(PUBLIC_DIR, 'merge-results.json');

// Script-specific override: SA defaults for offline pipeline
const SCRIPT_DEFAULT_PARAMS: OptimizationParams = {
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
  algorithm: 'annealing',
  saIterations: 50_000,
  saInitialTemp: 5_000_000,
  saCoolingRate: 0.9997,
};

/**
 * Estimate FPM change when merging municipalities.
 * Returns the ANNUAL net FPM variation (negative = loss).
 * Uses real FPM data when available; otherwise estimates from coefficients.
 */
function estimateFPMChange(
  members: FiscalEntry[],
  combinedPop: number,
  params: OptimizationParams
): number {
  if (!params.modelFPM) return 0;

  // Sum of real FPM received by individual municipalities
  const totalFPMBefore = members.reduce((s, m) => s + (m.fpm || 0), 0);

  // If no real FPM data available, estimate using coefficients
  if (totalFPMBefore === 0) {
    // Can't estimate without knowing state FPM pool — return 0
    return 0;
  }

  // Coefficient before: sum of individual coefficients
  const coefBefore = members.reduce((s, m) => s + getCoefFPM(m.populacao), 0);
  // Coefficient after: single merged entity
  const coefAfter = getCoefFPM(combinedPop);

  // FPM is proportional to coefficient:
  // FPM_after / FPM_before ≈ coef_after / coef_before
  if (coefBefore === 0) return 0;
  const fpmAfter = totalFPMBefore * (coefAfter / coefBefore);
  return fpmAfter - totalFPMBefore; // negative = loss
}

// ============================================================
// Data interfaces
// ============================================================
interface FiscalEntry {
  codIbge: string;
  nome: string;
  uf: string;
  populacao: number;
  receita: number;
  despesa: number;
  despesaPessoal: number;
  despesaAdmin?: number;       // Real admin cost from DCA function 04
  receitaPropria: number;
  receitaTransferencias?: number;
  fpm?: number;                // Real FPM received
  efa: number;
  saldo: number;
  dadosIndisponiveis: boolean;
}

interface MunicipalityGeo {
  areaKm2: number;
  centroid: [number, number];
}

interface MergeNode {
  id: string;
  members: string[];
  memberFiscal: FiscalEntry[];  // Track individual members for FPM calc
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
  economia: number;
  perdaFPM: number;            // Cumulative FPM loss (negative number)
  custoTransicao: number;      // Annualized transition cost
  economiaLiquida: number;     // net = economia - |perdaFPM| - custoTransicao
  areaKm2: number;
  centroid: [number, number];
  active: boolean;
}

interface SavingsEntry {
  nodeA: string;
  nodeB: string;
  savings: number;             // Net savings (after FPM loss and transition cost)
}

// ============================================================
// Savings calculation
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

  // At least one node must be small
  if (a.populacao >= params.minPopulationTrigger && b.populacao >= params.minPopulationTrigger) return 0;

  // Geographic constraints
  const combinedArea = a.areaKm2 + b.areaKm2;
  if (combinedArea > params.maxAreaKm2) return 0;

  // Centroid distance
  const dist = turf.distance(
    turf.point(a.centroid),
    turf.point(b.centroid),
    { units: 'kilometers' }
  );
  if (dist > params.maxCentroidDistanceKm) return 0;

  // Determine smaller and larger
  const [smaller, larger] = a.populacao <= b.populacao ? [a, b] : [b, a];

  // --- Administrative savings ---
  let adminCosts: number;
  if (params.useRealAdminCosts && smaller.despesaAdmin > 0) {
    adminCosts = smaller.despesaAdmin;
  } else {
    adminCosts = smaller.despesa * params.adminCostEstimate;
  }
  const adminSavings = adminCosts * params.adminSavingsRate;

  // --- Personnel savings (only on admin-related personnel, not total) ---
  // More realistic: apply rate to smaller's personnel costs
  const personnelSavings = smaller.despesaPessoal * params.personnelSavingsRate;

  const grossSavings = personnelSavings + adminSavings;

  // --- FPM impact ---
  const allMembers = [...a.memberFiscal, ...b.memberFiscal];
  const fpmChange = estimateFPMChange(allMembers, combinedPop, params);

  // --- Transition cost (annualized) ---
  const smallerPop = smaller.populacao;
  const transitionTotal = smallerPop * params.transitionCostPerCapita;
  const annualTransitionCost = transitionTotal / params.amortizationYears;

  // --- Net annual savings ---
  const netSavings = grossSavings + fpmChange - annualTransitionCost;
  // (fpmChange is negative when there's a loss, so this subtracts it)

  if (netSavings < params.minSavingsThreshold) return 0;

  // Diminishing returns penalty for larger merges
  const sizePenalty = Math.min(1, 500_000 / combinedPop);

  return netSavings * sizePenalty;
}

// ============================================================
// Greedy merge optimization for a single state
// ============================================================
function optimizeStateGreedy(
  stateMunicipios: FiscalEntry[],
  adjacency: Record<string, string[]>,
  geoData: Record<string, MunicipalityGeo>,
  params: OptimizationParams
): { groups: MergeNode[]; ungrouped: string[]; economia: number; perdaFPMTotal: number; custoTransicaoTotal: number } {
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
    const stateNeighbors = new Set(neighbors.filter(n => nodes.has(n)));
    stateAdj.set(cod, stateNeighbors);
  }

  // Build initial savings priority queue
  let savingsQueue: SavingsEntry[] = [];
  const processed = new Set<string>();

  for (const [codA, neighbors] of stateAdj.entries()) {
    for (const codB of neighbors) {
      const key = [codA, codB].sort().join('-');
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

    // Compute components for tracking
    const allMembers = [...larger.memberFiscal, ...smaller.memberFiscal];
    const combinedPop = larger.populacao + smaller.populacao;
    const fpmChange = estimateFPMChange(allMembers, combinedPop, params);
    const transitionTotal = smaller.populacao * params.transitionCostPerCapita;
    const annualTransitionCost = transitionTotal / params.amortizationYears;

    // Compute gross savings (without FPM/transition)
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
    larger.economiaLiquida += netSavings;

    // Update geographic data: weighted centroid
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
    const smallerNeighbors = stateAdj.get(smaller.id) || new Set();
    const largerNeighbors = stateAdj.get(larger.id) || new Set();

    for (const n of smallerNeighbors) {
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
    for (const neighborId of largerNeighbors) {
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

  for (const node of nodes.values()) {
    if (!node.active) continue;
    if (node.members.length > 1) {
      groups.push(node);
    } else {
      ungrouped.push(node.id);
    }
  }

  return {
    groups,
    ungrouped,
    economia: totalEconomia,
    perdaFPMTotal: totalPerdaFPM,
    custoTransicaoTotal: totalCustoTransicao,
  };
}

// ============================================================
// Simulated Annealing refinement
// Starts from the greedy solution and tries swap/undo moves
// ============================================================
function optimizeStateSA(
  stateMunicipios: FiscalEntry[],
  adjacency: Record<string, string[]>,
  geoData: Record<string, MunicipalityGeo>,
  params: OptimizationParams
): { groups: MergeNode[]; ungrouped: string[]; economia: number; perdaFPMTotal: number; custoTransicaoTotal: number } {
  // Start with greedy solution
  const greedy = optimizeStateGreedy(stateMunicipios, adjacency, geoData, params);

  // For small states, greedy is likely optimal
  if (stateMunicipios.length < 20) return greedy;

  // Build a mutable assignment: codIbge → groupId (or self if ungrouped)
  const assignment = new Map<string, string>();
  const groupData = new Map<string, Set<string>>();

  for (const g of greedy.groups) {
    const gid = g.id;
    groupData.set(gid, new Set(g.members));
    for (const m of g.members) {
      assignment.set(m, gid);
    }
  }
  for (const u of greedy.ungrouped) {
    assignment.set(u, u);
    groupData.set(u, new Set([u]));
  }

  // Fiscal lookup
  const fiscalMap = new Map<string, FiscalEntry>();
  for (const m of stateMunicipios) {
    if (!m.dadosIndisponiveis) fiscalMap.set(m.codIbge, m);
  }

  // State adjacency
  const stateAdj = new Map<string, Set<string>>();
  for (const [cod, neighbors] of Object.entries(adjacency)) {
    if (!fiscalMap.has(cod)) continue;
    stateAdj.set(cod, new Set(neighbors.filter(n => fiscalMap.has(n))));
  }

  // Helper: compute total net savings for a group
  function computeGroupSavings(memberCodes: Set<string>): number {
    if (memberCodes.size <= 1) return 0;
    const members = Array.from(memberCodes).map(c => fiscalMap.get(c)!).filter(Boolean);
    if (members.length <= 1) return 0;

    const combinedPop = members.reduce((s, m) => s + m.populacao, 0);
    if (combinedPop > params.maxPopulation) return -Infinity;
    if (members.length > params.maxMembers) return -Infinity;

    // Check area
    const combinedArea = members.reduce((s, m) => s + (geoData[m.codIbge]?.areaKm2 || 0), 0);
    if (combinedArea > params.maxAreaKm2) return -Infinity;

    // Check max centroid distance (all pairs)
    const centroids = members.map(m => geoData[m.codIbge]?.centroid || [0, 0]);
    for (let i = 0; i < centroids.length; i++) {
      for (let j = i + 1; j < centroids.length; j++) {
        const d = turf.distance(turf.point(centroids[i]), turf.point(centroids[j]), { units: 'kilometers' });
        if (d > params.maxCentroidDistanceKm * 1.5) return -Infinity; // allow slight relaxation within group
      }
    }

    // Sort by population ascending to iteratively compute savings
    members.sort((a, b) => a.populacao - b.populacao);
    let totalSavings = 0;
    let accPop = members[members.length - 1].populacao;

    for (let i = 0; i < members.length - 1; i++) {
      const smaller = members[i];
      let adminCosts: number;
      if (params.useRealAdminCosts && (smaller.despesaAdmin || 0) > 0) {
        adminCosts = smaller.despesaAdmin!;
      } else {
        adminCosts = smaller.despesa * params.adminCostEstimate;
      }
      totalSavings += (smaller.despesaPessoal * params.personnelSavingsRate) + (adminCosts * params.adminSavingsRate);
      accPop += smaller.populacao;
    }

    // FPM impact
    const fpmChange = estimateFPMChange(members, combinedPop, params);

    // Transition cost (all smaller members)
    const transitionPop = members.slice(0, -1).reduce((s, m) => s + m.populacao, 0);
    const annualTransition = (transitionPop * params.transitionCostPerCapita) / params.amortizationYears;

    const netSavings = totalSavings + fpmChange - annualTransition;
    const sizePenalty = Math.min(1, 500_000 / combinedPop);
    return netSavings * sizePenalty;
  }

  // Current total objective
  let currentObj = 0;
  for (const [, members] of groupData) {
    currentObj += computeGroupSavings(members);
  }

  let bestObj = currentObj;
  let bestAssignment = new Map(assignment);
  let bestGroups = new Map<string, Set<string>>();
  for (const [k, v] of groupData) {
    bestGroups.set(k, new Set(v));
  }

  // SA loop
  let temp = params.saInitialTemp;
  const maxIter = Math.min(params.saIterations, stateMunicipios.length * 100);
  const allCodes = Array.from(fiscalMap.keys());
  let accepted = 0;
  let improved = 0;

  for (let iter = 0; iter < maxIter; iter++) {
    temp *= params.saCoolingRate;

    // Random move: pick a random municipality and try to move it to an adjacent group (or make it standalone)
    const randomCode = allCodes[Math.floor(Math.random() * allCodes.length)];
    const currentGroup = assignment.get(randomCode)!;
    const currentMembers = groupData.get(currentGroup)!;

    // Find adjacent group options
    const neighbors = stateAdj.get(randomCode) || new Set<string>();
    const neighborGroups = new Set<string>();
    for (const n of neighbors) {
      const ng = assignment.get(n)!;
      if (ng !== currentGroup) neighborGroups.add(ng);
    }
    // Also allow becoming standalone
    neighborGroups.add(randomCode);

    if (neighborGroups.size === 0) continue;

    // Pick random target group
    const targetOptions = Array.from(neighborGroups);
    const targetGroup = targetOptions[Math.floor(Math.random() * targetOptions.length)];

    if (targetGroup === currentGroup) continue;

    // Check if removing from current group would disconnect it
    // (simplified: just allow removing from groups of size > 1, or if it's the only member)
    if (currentMembers.size === 1 && targetGroup === randomCode) continue; // already standalone

    // Compute old savings for affected groups
    const oldSavingsCurrent = computeGroupSavings(currentMembers);
    const targetMembers = groupData.get(targetGroup);
    if (!targetMembers) continue; // target group no longer exists
    const oldSavingsTarget = computeGroupSavings(targetMembers);

    // Simulate move
    const newCurrentMembers = new Set(currentMembers);
    newCurrentMembers.delete(randomCode);

    const newTargetMembers = new Set(targetMembers);
    newTargetMembers.add(randomCode);

    // Check constraints
    const newSavingsTarget = computeGroupSavings(newTargetMembers);
    if (newSavingsTarget === -Infinity) continue;

    let newSavingsCurrent = 0;
    if (newCurrentMembers.size > 0) {
      newSavingsCurrent = computeGroupSavings(newCurrentMembers);
      if (newSavingsCurrent === -Infinity) continue;
    }

    const delta = (newSavingsTarget + newSavingsCurrent) - (oldSavingsTarget + oldSavingsCurrent);

    // Accept or reject
    if (delta > 0 || Math.random() < Math.exp(delta / temp)) {
      // Apply move
      currentMembers.delete(randomCode);
      if (currentMembers.size === 0) {
        groupData.delete(currentGroup);
      }
      targetMembers.add(randomCode);
      assignment.set(randomCode, targetGroup);

      currentObj += delta;
      accepted++;

      if (currentObj > bestObj) {
        bestObj = currentObj;
        bestAssignment = new Map(assignment);
        bestGroups = new Map<string, Set<string>>();
        for (const [k, v] of groupData) {
          bestGroups.set(k, new Set(v));
        }
        improved++;
      }
    }
  }

  // Rebuild groups from best assignment
  const finalGroups: MergeNode[] = [];
  const finalUngrouped: string[] = [];
  let finalEconomia = 0;
  let finalPerdaFPM = 0;
  let finalCustoTransicao = 0;

  for (const [gid, members] of bestGroups) {
    if (members.size <= 1) {
      finalUngrouped.push(Array.from(members)[0]);
      continue;
    }

    const memberFiscal = Array.from(members).map(c => fiscalMap.get(c)!).filter(Boolean);
    if (memberFiscal.length <= 1) {
      finalUngrouped.push(Array.from(members)[0]);
      continue;
    }

    // Sort by population descending — largest is the anchor
    memberFiscal.sort((a, b) => b.populacao - a.populacao);
    const anchor = memberFiscal[0];
    const combinedPop = memberFiscal.reduce((s, m) => s + m.populacao, 0);

    // Compute savings components
    let grossSavings = 0;
    for (let i = 1; i < memberFiscal.length; i++) {
      const smaller = memberFiscal[i];
      let adminCosts: number;
      if (params.useRealAdminCosts && (smaller.despesaAdmin || 0) > 0) {
        adminCosts = smaller.despesaAdmin!;
      } else {
        adminCosts = smaller.despesa * params.adminCostEstimate;
      }
      grossSavings += (smaller.despesaPessoal * params.personnelSavingsRate) + (adminCosts * params.adminSavingsRate);
    }

    const fpmChange = estimateFPMChange(memberFiscal, combinedPop, params);
    const transitionPop = memberFiscal.slice(1).reduce((s, m) => s + m.populacao, 0);
    const annualTransition = (transitionPop * params.transitionCostPerCapita) / params.amortizationYears;

    const totalArea = memberFiscal.reduce((s, m) => s + (geoData[m.codIbge]?.areaKm2 || 0), 0);
    const weightedCentroid: [number, number] = [0, 0];
    let totalWeight = 0;
    for (const m of memberFiscal) {
      const geo = geoData[m.codIbge];
      if (geo && geo.areaKm2 > 0) {
        weightedCentroid[0] += geo.centroid[0] * geo.areaKm2;
        weightedCentroid[1] += geo.centroid[1] * geo.areaKm2;
        totalWeight += geo.areaKm2;
      }
    }
    if (totalWeight > 0) {
      weightedCentroid[0] /= totalWeight;
      weightedCentroid[1] /= totalWeight;
    }

    finalGroups.push({
      id: anchor.codIbge,
      members: memberFiscal.map(m => m.codIbge),
      memberFiscal,
      nome: anchor.nome,
      uf: anchor.uf,
      populacao: combinedPop,
      receita: memberFiscal.reduce((s, m) => s + m.receita, 0),
      despesa: memberFiscal.reduce((s, m) => s + m.despesa, 0),
      despesaPessoal: memberFiscal.reduce((s, m) => s + m.despesaPessoal, 0),
      despesaAdmin: memberFiscal.reduce((s, m) => s + (m.despesaAdmin || 0), 0),
      receitaPropria: memberFiscal.reduce((s, m) => s + m.receitaPropria, 0),
      receitaTransferencias: memberFiscal.reduce((s, m) => s + (m.receitaTransferencias || 0), 0),
      fpm: memberFiscal.reduce((s, m) => s + (m.fpm || 0), 0),
      economia: grossSavings,
      perdaFPM: fpmChange,
      custoTransicao: annualTransition,
      economiaLiquida: grossSavings + fpmChange - annualTransition,
      areaKm2: totalArea,
      centroid: weightedCentroid,
      active: true,
    });

    finalEconomia += grossSavings;
    finalPerdaFPM += fpmChange;
    finalCustoTransicao += annualTransition;
  }

  console.log(`    SA: accepted=${accepted}, improved=${improved}, best obj=${(bestObj / 1e6).toFixed(1)}M`);

  return {
    groups: finalGroups,
    ungrouped: finalUngrouped,
    economia: finalEconomia,
    perdaFPMTotal: finalPerdaFPM,
    custoTransicaoTotal: finalCustoTransicao,
  };
}

// ============================================================
// Main entry point
// ============================================================
async function main() {
  console.log('=== Script 05: Optimize Merges (Realistic Model) ===\n');

  // Ensure output directory
  if (!fs.existsSync(PUBLIC_DIR)) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  }

  // Load data
  if (!fs.existsSync(FISCAL_FILE)) {
    throw new Error(`Fiscal data not found: ${FISCAL_FILE}\nRun script 02 first.`);
  }
  if (!fs.existsSync(ADJACENCY_FILE)) {
    throw new Error(`Adjacency data not found: ${ADJACENCY_FILE}\nRun script 04 first.`);
  }

  // Load params from env or use defaults
  const params: OptimizationParams = { ...SCRIPT_DEFAULT_PARAMS };
  console.log('Parameters:');
  console.log(`  Personnel savings rate: ${(params.personnelSavingsRate * 100).toFixed(0)}%`);
  console.log(`  Admin savings rate: ${(params.adminSavingsRate * 100).toFixed(0)}%`);
  console.log(`  Transition cost: R$${params.transitionCostPerCapita}/hab over ${params.amortizationYears} years`);
  console.log(`  FPM modeling: ${params.modelFPM ? 'ON' : 'OFF'}`);
  console.log(`  Max population: ${params.maxPopulation.toLocaleString()}`);
  console.log(`  Max area: ${params.maxAreaKm2.toLocaleString()} km²`);
  console.log(`  Max centroid distance: ${params.maxCentroidDistanceKm} km`);
  console.log(`  Algorithm: ${params.algorithm}`);
  console.log();

  console.log('Loading data...');
  const fiscalData: Record<string, FiscalEntry> = JSON.parse(fs.readFileSync(FISCAL_FILE, 'utf-8'));
  const adjacency: Record<string, string[]> = JSON.parse(fs.readFileSync(ADJACENCY_FILE, 'utf-8'));

  let geoData: Record<string, MunicipalityGeo> = {};
  if (fs.existsSync(GEO_FILE)) {
    geoData = JSON.parse(fs.readFileSync(GEO_FILE, 'utf-8'));
    console.log(`  Loaded geographic data for ${Object.keys(geoData).length} municipalities`);
  } else {
    console.warn('  ⚠ No geographic metadata — area/distance constraints disabled');
    params.maxAreaKm2 = Infinity;
    params.maxCentroidDistanceKm = Infinity;
  }

  const allMunicipios = Object.values(fiscalData);
  console.log(`  Total municipalities: ${allMunicipios.length}`);
  console.log(`  With fiscal data: ${allMunicipios.filter(m => !m.dadosIndisponiveis).length}\n`);

  // Group by state
  const byState = new Map<string, FiscalEntry[]>();
  for (const m of allMunicipios) {
    const arr = byState.get(m.uf) || [];
    arr.push(m);
    byState.set(m.uf, arr);
  }

  console.log(`Processing ${byState.size} states...\n`);

  // Run optimization per state
  const allGroups: MergeNode[] = [];
  const allUngrouped: string[] = [];
  let totalEconomia = 0;
  let totalPerdaFPM = 0;
  let totalCustoTransicao = 0;

  interface StateResult {
    uf: string;
    nomeEstado: string;
    municipiosOriginal: number;
    municipiosResultante: number;
    reducaoPercent: number;
    economiaTotal: number;
    economiaLiquida: number;
    perdaFPM: number;
    custoTransicao: number;
    efaAntes: number;
    efaDepois: number;
    deficitAntes: number;
    deficitDepois: number;
  }
  const stateResults: StateResult[] = [];

  const optimizeFn = params.algorithm === 'annealing' ? optimizeStateSA : optimizeStateGreedy;

  for (const [uf, municipios] of byState.entries()) {
    console.log(`  Processing ${uf} (${municipios.length} municipalities)...`);
    const result = optimizeFn(municipios, adjacency, geoData, params);

    allGroups.push(...result.groups);
    allUngrouped.push(...result.ungrouped);
    totalEconomia += result.economia;
    totalPerdaFPM += result.perdaFPMTotal;
    totalCustoTransicao += result.custoTransicaoTotal;

    const municipiosResultante = result.groups.length + result.ungrouped.length;
    const municipiosOriginal = municipios.filter(m => !m.dadosIndisponiveis).length;

    // Calculate EFA and deficit before/after
    const validMunicipios = municipios.filter(m => !m.dadosIndisponiveis);
    const totalReceitaAntes = validMunicipios.reduce((s, m) => s + m.receita, 0);
    const totalReceitaPropriaAntes = validMunicipios.reduce((s, m) => s + m.receitaPropria, 0);
    const deficitAntes = validMunicipios.filter(m => m.saldo < 0).reduce((s, m) => s + m.saldo, 0);

    // After merge — EFA changes because revenue changes with FPM
    const groupReceitaPropria = result.groups.reduce((s, g) => s + g.receitaPropria, 0);
    const groupReceita = result.groups.reduce((s, g) => s + g.receita + g.perdaFPM, 0); // FPM loss reduces revenue
    const ungroupedNodes = result.ungrouped.map(id => fiscalData[id]).filter(Boolean);
    const ungroupedReceitaPropria = ungroupedNodes.reduce((s, m) => s + m.receitaPropria, 0);
    const ungroupedReceita = ungroupedNodes.reduce((s, m) => s + m.receita, 0);
    const totalReceitaDepois = groupReceita + ungroupedReceita;
    const totalReceitaPropriaDepois = groupReceitaPropria + ungroupedReceitaPropria;

    const deficitDepois = [
      ...result.groups.map(g => {
        // saldoOtimizado = saldo + economiaLiquida (correct: no double-count of FPM)
        return (g.receita - g.despesa) + g.economiaLiquida;
      }),
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

    const reducao = municipiosOriginal - municipiosResultante;
    console.log(
      `    ${uf}: ${municipiosOriginal} → ${municipiosResultante} municípios ` +
      `(-${reducao}, economia líquida R$ ${(economiaLiquida / 1e6).toFixed(1)}M)`
    );
  }

  // Sort state results by economia descending
  stateResults.sort((a, b) => b.economiaLiquida - a.economiaLiquida);

  // Compute national stats
  const totalOriginal = allMunicipios.filter(m => !m.dadosIndisponiveis).length;
  const totalResultante = allGroups.length + allUngrouped.length;
  const totalPopulacao = allMunicipios.reduce((s, m) => s + m.populacao, 0);
  const totalReceitaPropria = allMunicipios.reduce((s, m) => s + m.receitaPropria, 0);
  const totalReceita = allMunicipios.reduce((s, m) => s + m.receita, 0);
  const totalEconomiaLiquida = totalEconomia + totalPerdaFPM - totalCustoTransicao;

  // EFA after: revenue changes due to FPM loss for merged entities
  const totalReceitaDepoisNacional = allGroups.reduce((s, g) => s + g.receita + g.perdaFPM, 0)
    + allUngrouped.reduce((s, id) => s + (fiscalData[id]?.receita || 0), 0);
  const totalReceitaPropriaDepoisNacional = allGroups.reduce((s, g) => s + g.receitaPropria, 0)
    + allUngrouped.reduce((s, id) => s + (fiscalData[id]?.receitaPropria || 0), 0);

  // Deficit before
  const deficitTotalAntes = allMunicipios
    .filter(m => !m.dadosIndisponiveis && m.saldo < 0)
    .reduce((s, m) => s + m.saldo, 0);

  // Deficit after
  const deficitTotalDepois = stateResults.reduce((s, st) => s + st.deficitDepois, 0);

  const globalStats = {
    municipiosOriginal: totalOriginal,
    municipiosResultante: totalResultante,
    reducaoPercent: ((totalOriginal - totalResultante) / totalOriginal) * 100,
    economiaTotal: totalEconomia,
    economiaLiquida: totalEconomiaLiquida,
    perdaFPMTotal: totalPerdaFPM,
    custoTransicaoTotal: totalCustoTransicao,
    economiaPorHabitante: totalPopulacao > 0 ? totalEconomiaLiquida / totalPopulacao : 0,
    efaAntes: totalReceita > 0 ? totalReceitaPropria / totalReceita : 0,
    efaDepois: totalReceitaDepoisNacional > 0 ? totalReceitaPropriaDepoisNacional / totalReceitaDepoisNacional : 0,
    desequilibrioAntes: 0,
    desequilibrioDepois: 0,
    populacaoMediaPorEnte: totalResultante > 0 ? totalPopulacao / totalResultante : 0,
    deficitTotalAntes,
    deficitTotalDepois,
    byState: stateResults,
    // Model parameters used (for UI display)
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

  // Compute desequilibrio (standard deviation of saldo per capita)
  const saldosPerCapitaAntes = allMunicipios
    .filter(m => !m.dadosIndisponiveis && m.populacao > 0)
    .map(m => m.saldo / m.populacao);
  const meanAntes = saldosPerCapitaAntes.reduce((a, b) => a + b, 0) / saldosPerCapitaAntes.length;
  globalStats.desequilibrioAntes = Math.sqrt(
    saldosPerCapitaAntes.reduce((s, v) => s + (v - meanAntes) ** 2, 0) / saldosPerCapitaAntes.length
  );

  // After merges
  const saldosPerCapitaDepois: number[] = [];
  for (const g of allGroups) {
    // saldoOtimizado = saldo + economiaLiquida (correct: no double-count of FPM)
    const saldoOtimizado = (g.receita - g.despesa) + g.economiaLiquida;
    if (g.populacao > 0) saldosPerCapitaDepois.push(saldoOtimizado / g.populacao);
  }
  for (const id of allUngrouped) {
    const m = fiscalData[id];
    if (m && m.populacao > 0) saldosPerCapitaDepois.push(m.saldo / m.populacao);
  }
  const meanDepois = saldosPerCapitaDepois.reduce((a, b) => a + b, 0) / saldosPerCapitaDepois.length;
  globalStats.desequilibrioDepois = Math.sqrt(
    saldosPerCapitaDepois.reduce((s, v) => s + (v - meanDepois) ** 2, 0) / saldosPerCapitaDepois.length
  );

  // Build output
  const mergeResults = {
    groups: allGroups.map(g => ({
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
    })),
    ungrouped: allUngrouped,
    stats: globalStats,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(mergeResults, null, 2), 'utf-8');

  console.log(`\n${'='.repeat(60)}`);
  console.log(`✓ Saved merge results to ${OUTPUT_FILE}`);
  console.log(`  Municipalities: ${totalOriginal} → ${totalResultante} (-${(globalStats.reducaoPercent).toFixed(1)}%)`);
  console.log(`  Merge groups: ${allGroups.length}`);
  console.log(`  Ungrouped: ${allUngrouped.length}`);
  console.log(`  Gross economia: R$ ${(totalEconomia / 1e9).toFixed(2)} B`);
  console.log(`  FPM loss: R$ ${(Math.abs(totalPerdaFPM) / 1e9).toFixed(2)} B`);
  console.log(`  Transition cost: R$ ${(totalCustoTransicao / 1e9).toFixed(2)} B/year`);
  console.log(`  Net economia: R$ ${(totalEconomiaLiquida / 1e9).toFixed(2)} B`);
  console.log(`  Economia per capita: R$ ${globalStats.economiaPorHabitante.toFixed(2)}`);
  console.log(`  EFA: ${(globalStats.efaAntes * 100).toFixed(1)}% → ${(globalStats.efaDepois * 100).toFixed(1)}%`);
  console.log(`  Desequilíbrio fiscal: ${globalStats.desequilibrioAntes.toFixed(0)} → ${globalStats.desequilibrioDepois.toFixed(0)} (σ saldo/capita)`);
}

main().catch((err) => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
