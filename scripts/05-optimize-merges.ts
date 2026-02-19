// ============================================================
// Script 05: Optimize Merges (Greedy Algorithm per State)
// Finds the best municipality fusions to minimize deficit
// ============================================================
import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, '..', 'public', 'data');
const FISCAL_FILE = path.join(DATA_DIR, 'fiscal-raw.json');
const ADJACENCY_FILE = path.join(DATA_DIR, 'adjacency.json');
const OUTPUT_FILE = path.join(PUBLIC_DIR, 'merge-results.json');

// Economy parameters
const PERSONNEL_SAVINGS_RATE = 0.60; // 60% of personnel costs of smaller municipality
const ADMIN_SAVINGS_RATE = 0.50;     // 50% of admin overhead
const ADMIN_COST_ESTIMATE = 0.15;    // Estimate admin costs as 15% of despesa if not available separately

// Merge constraints
const MAX_POPULATION = 150_000;      // Don't create merged entities above 150k
const MAX_MEMBERS = 6;               // Max municipalities per merged group
const MIN_SAVINGS_THRESHOLD = 500_000; // Minimum R$500k savings to justify a merge
const MIN_POPULATION_TRIGGER = 50_000; // Only merge municipalities with pop < 50k

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
  dadosIndisponiveis: boolean;
}

interface MergeNode {
  id: string;
  members: string[];
  nome: string;
  uf: string;
  populacao: number;
  receita: number;
  despesa: number;
  despesaPessoal: number;
  receitaPropria: number;
  economia: number;
  active: boolean;
}

interface SavingsEntry {
  nodeA: string;
  nodeB: string;
  savings: number;
}

/**
 * Calculate savings from merging two nodes.
 * The smaller municipality's administrative overhead is partially eliminated.
 * Returns 0 if merge constraints are violated.
 */
function calculateSavings(a: MergeNode, b: MergeNode): number {
  const combinedPop = a.populacao + b.populacao;
  const combinedMembers = a.members.length + b.members.length;

  // Hard constraints: don't exceed maximum population or group size
  if (combinedPop > MAX_POPULATION) return 0;
  if (combinedMembers > MAX_MEMBERS) return 0;

  // Only merge if at least one node is small (below trigger threshold)
  if (a.populacao >= MIN_POPULATION_TRIGGER && b.populacao >= MIN_POPULATION_TRIGGER) return 0;

  // Determine smaller and larger by population
  const [smaller, larger] = a.populacao <= b.populacao ? [a, b] : [b, a];

  // Personnel savings: eliminate part of smaller's personnel costs
  const personnelSavings = smaller.despesaPessoal * PERSONNEL_SAVINGS_RATE;

  // Admin savings: estimate admin costs if not directly available
  const smallerAdmin = smaller.despesa * ADMIN_COST_ESTIMATE;
  const adminSavings = smallerAdmin * ADMIN_SAVINGS_RATE;

  const totalSavings = personnelSavings + adminSavings;

  // Must meet minimum threshold
  if (totalSavings < MIN_SAVINGS_THRESHOLD) return 0;

  // Penalty for merging two large municipalities (diminishing returns)
  const sizePenalty = Math.min(1, 500000 / combinedPop);

  return totalSavings * sizePenalty;
}

/**
 * Run greedy merge optimization for a single state.
 */
function optimizeState(
  stateMunicipios: FiscalEntry[],
  adjacency: Record<string, string[]>
): { groups: MergeNode[]; ungrouped: string[]; economia: number } {
  // Initialize nodes
  const nodes = new Map<string, MergeNode>();
  for (const m of stateMunicipios) {
    if (m.dadosIndisponiveis) continue;
    nodes.set(m.codIbge, {
      id: m.codIbge,
      members: [m.codIbge],
      nome: m.nome,
      uf: m.uf,
      populacao: m.populacao,
      receita: m.receita,
      despesa: m.despesa,
      despesaPessoal: m.despesaPessoal,
      receitaPropria: m.receitaPropria,
      economia: 0,
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

  // Build initial savings priority queue (sorted array)
  let savingsQueue: SavingsEntry[] = [];
  const processed = new Set<string>();

  for (const [codA, neighbors] of stateAdj.entries()) {
    for (const codB of neighbors) {
      const key = [codA, codB].sort().join('-');
      if (processed.has(key)) continue;
      processed.add(key);

      const nodeA = nodes.get(codA)!;
      const nodeB = nodes.get(codB)!;
      const savings = calculateSavings(nodeA, nodeB);

      if (savings > 0) {
        savingsQueue.push({ nodeA: codA, nodeB: codB, savings });
      }
    }
  }

  // Sort descending by savings
  savingsQueue.sort((a, b) => b.savings - a.savings);

  // Greedy merge loop
  let totalEconomia = 0;
  let mergeCount = 0;

  while (savingsQueue.length > 0) {
    // Pop best pair
    const best = savingsQueue.shift()!;
    const nodeA = nodes.get(best.nodeA);
    const nodeB = nodes.get(best.nodeB);

    // Skip if either node was already merged (deactivated)
    if (!nodeA?.active || !nodeB?.active) continue;

    // Perform merge: A absorbs B
    const [larger, smaller] = nodeA.populacao >= nodeB.populacao ? [nodeA, nodeB] : [nodeB, nodeA];
    const savings = calculateSavings(larger, smaller);

    if (savings <= 0) continue;

    // Create merged node (reuse larger's ID)
    larger.members = [...larger.members, ...smaller.members];
    larger.populacao += smaller.populacao;
    larger.receita += smaller.receita;
    larger.despesa += smaller.despesa;
    larger.despesaPessoal += smaller.despesaPessoal;
    larger.receitaPropria += smaller.receitaPropria;
    larger.economia += savings;

    // Deactivate smaller
    smaller.active = false;

    // Transfer smaller's adjacency to larger
    const smallerNeighbors = stateAdj.get(smaller.id) || new Set();
    const largerNeighbors = stateAdj.get(larger.id) || new Set();

    for (const n of smallerNeighbors) {
      if (n === larger.id) continue;
      largerNeighbors.add(n);
      // Update neighbor's adjacency to point to larger instead of smaller
      const nAdj = stateAdj.get(n);
      if (nAdj) {
        nAdj.delete(smaller.id);
        nAdj.add(larger.id);
      }
    }
    largerNeighbors.delete(smaller.id);
    stateAdj.set(larger.id, largerNeighbors);

    // Recompute savings for larger's new edges
    for (const neighborId of largerNeighbors) {
      const neighbor = nodes.get(neighborId);
      if (!neighbor?.active) continue;

      const newSavings = calculateSavings(larger, neighbor);
      if (newSavings > 0) {
        savingsQueue.push({ nodeA: larger.id, nodeB: neighborId, savings: newSavings });
      }
    }

    // Re-sort
    savingsQueue.sort((a, b) => b.savings - a.savings);

    totalEconomia += savings;
    mergeCount++;
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

  return { groups, ungrouped, economia: totalEconomia };
}

async function main() {
  console.log('=== Script 05: Optimize Merges (Greedy per State) ===\n');

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

  console.log('Loading fiscal data and adjacency graph...');
  const fiscalData: Record<string, FiscalEntry> = JSON.parse(fs.readFileSync(FISCAL_FILE, 'utf-8'));
  const adjacency: Record<string, string[]> = JSON.parse(fs.readFileSync(ADJACENCY_FILE, 'utf-8'));

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

  interface StateResult {
    uf: string;
    nomeEstado: string;
    municipiosOriginal: number;
    municipiosResultante: number;
    reducaoPercent: number;
    economiaTotal: number;
    efaAntes: number;
    efaDepois: number;
    deficitAntes: number;
    deficitDepois: number;
  }
  const stateResults: StateResult[] = [];

  const UF_NAMES: Record<string, string> = {
    AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas',
    BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo',
    GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul',
    MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná',
    PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte',
    RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina',
    SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
  };

  for (const [uf, municipios] of byState.entries()) {
    const result = optimizeState(municipios, adjacency);

    allGroups.push(...result.groups);
    allUngrouped.push(...result.ungrouped);
    totalEconomia += result.economia;

    const municipiosResultante = result.groups.length + result.ungrouped.length;
    const municipiosOriginal = municipios.filter(m => !m.dadosIndisponiveis).length;

    // Calculate EFA and deficit before/after
    const validMunicipios = municipios.filter(m => !m.dadosIndisponiveis);
    const totalReceitaAntes = validMunicipios.reduce((s, m) => s + m.receita, 0);
    const totalReceitaPropriaAntes = validMunicipios.reduce((s, m) => s + m.receitaPropria, 0);
    const deficitAntes = validMunicipios.filter(m => m.saldo < 0).reduce((s, m) => s + m.saldo, 0);

    // After merge
    const groupReceitaPropria = result.groups.reduce((s, g) => s + g.receitaPropria, 0);
    const groupReceita = result.groups.reduce((s, g) => s + g.receita, 0);
    const ungroupedNodes = result.ungrouped.map(id => fiscalData[id]).filter(Boolean);
    const ungroupedReceitaPropria = ungroupedNodes.reduce((s, m) => s + m.receitaPropria, 0);
    const ungroupedReceita = ungroupedNodes.reduce((s, m) => s + m.receita, 0);
    const totalReceitaDepois = groupReceita + ungroupedReceita;
    const totalReceitaPropriaDepois = groupReceitaPropria + ungroupedReceitaPropria;

    const deficitDepois = [
      ...result.groups.map(g => g.receita - (g.despesa - g.economia)),
      ...ungroupedNodes.map(m => m.saldo),
    ].filter(s => s < 0).reduce((sum, s) => sum + s, 0);

    stateResults.push({
      uf,
      nomeEstado: UF_NAMES[uf] || uf,
      municipiosOriginal,
      municipiosResultante,
      reducaoPercent: municipiosOriginal > 0 ? ((municipiosOriginal - municipiosResultante) / municipiosOriginal) * 100 : 0,
      economiaTotal: result.economia,
      efaAntes: totalReceitaAntes > 0 ? totalReceitaPropriaAntes / totalReceitaAntes : 0,
      efaDepois: totalReceitaDepois > 0 ? totalReceitaPropriaDepois / totalReceitaDepois : 0,
      deficitAntes,
      deficitDepois,
    });

    const reducao = municipiosOriginal - municipiosResultante;
    console.log(
      `  ${uf}: ${municipiosOriginal} → ${municipiosResultante} municípios ` +
      `(-${reducao}, economia R$ ${(result.economia / 1e6).toFixed(1)}M)`
    );
  }

  // Sort state results by economia descending
  stateResults.sort((a, b) => b.economiaTotal - a.economiaTotal);

  // Compute national stats
  const totalOriginal = allMunicipios.filter(m => !m.dadosIndisponiveis).length;
  const totalResultante = allGroups.length + allUngrouped.length;
  const totalPopulacao = allMunicipios.reduce((s, m) => s + m.populacao, 0);
  const totalReceitaPropria = allMunicipios.reduce((s, m) => s + m.receitaPropria, 0);
  const totalReceita = allMunicipios.reduce((s, m) => s + m.receita, 0);

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
    economiaPorHabitante: totalPopulacao > 0 ? totalEconomia / totalPopulacao : 0,
    efaAntes: totalReceita > 0 ? totalReceitaPropria / totalReceita : 0,
    efaDepois: totalReceita > 0 ? totalReceitaPropria / totalReceita : 0, // Simplified
    desequilibrioAntes: 0, // Will compute below
    desequilibrioDepois: 0,
    populacaoMediaPorEnte: totalResultante > 0 ? totalPopulacao / totalResultante : 0,
    deficitTotalAntes,
    deficitTotalDepois,
    byState: stateResults,
  };

  // Compute desequilibrio (standard deviation of saldo per capita)
  const saldosPerCapitaAntes = allMunicipios
    .filter(m => !m.dadosIndisponiveis && m.populacao > 0)
    .map(m => m.saldo / m.populacao);
  const meanAntes = saldosPerCapitaAntes.reduce((a, b) => a + b, 0) / saldosPerCapitaAntes.length;
  globalStats.desequilibrioAntes = Math.sqrt(
    saldosPerCapitaAntes.reduce((s, v) => s + (v - meanAntes) ** 2, 0) / saldosPerCapitaAntes.length
  );

  // After merges — compute per merged entity
  const saldosPerCapitaDepois: number[] = [];
  for (const g of allGroups) {
    const saldoOtimizado = g.receita - (g.despesa - g.economia);
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
      saldoOtimizado: g.receita - (g.despesa - g.economia),
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
  console.log(`  Total economia: R$ ${(totalEconomia / 1e9).toFixed(2)} B`);
  console.log(`  Economia per capita: R$ ${globalStats.economiaPorHabitante.toFixed(2)}`);
  console.log(`  Desequilíbrio fiscal: ${globalStats.desequilibrioAntes.toFixed(0)} → ${globalStats.desequilibrioDepois.toFixed(0)} (σ saldo/capita)`);
}

main().catch((err) => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
