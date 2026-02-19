// ============================================================
// Script 02: Fetch Fiscal Data from SICONFI API
// Downloads DCA data for ALL Brazilian municipalities
// Supports incremental caching (resumable on failure)
// ============================================================
import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(__dirname, 'data');
const CACHE_DIR = path.join(DATA_DIR, 'fiscal-cache');
const ENTES_FILE = path.join(DATA_DIR, 'entes.json');
const OUTPUT_FILE = path.join(DATA_DIR, 'fiscal-raw.json');

// SICONFI API endpoints
const ENTES_URL = 'https://apidatalake.tesouro.gov.br/ords/siconfi/tt/entes';
const DCA_URL = 'https://apidatalake.tesouro.gov.br/ords/siconfi/tt/dca';

// Years to try (most recent first)
const YEARS_TO_TRY = [2024, 2023, 2022];

// Rate limit: 1 request per second
const RATE_LIMIT_MS = 1100;

interface Ente {
  cod_ibge: number;
  ente: string;
  capital: string;
  regiao: string;
  uf: string;
  esfera: string;
  exercicio: number;
  populacao: number;
  cnpj: string;
}

interface DCAItem {
  exercicio: number;
  cod_ibge: number;
  instituicao: string;
  anexo: string;
  cod_conta: string;
  conta: string;
  coluna: string;
  rotulo: string;
  populacao: number;
  valor: number;
}

interface FiscalData {
  codIbge: string;
  nome: string;
  uf: string;
  populacao: number;
  receita: number;
  despesa: number;
  despesaPessoal: number;
  despesaAdmin: number;      // Despesa com Administração (função 04)
  receitaPropria: number;    // Broader: tributária + patrimonial + serviços + outras correntes
  receitaTransferencias: number; // Total transfers received
  fpm: number;               // FPM (Fundo de Participação dos Municípios)
  efa: number;
  saldo: number;
  ano: number;
  dadosIndisponiveis: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJSON<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error(`HTTP ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    console.warn(`    Fetch error: ${(err as Error).message}`);
    return null;
  }
}

function getCacheFile(codIbge: string): string {
  return path.join(CACHE_DIR, `${codIbge}.json`);
}

function extractFiscalFromDCA(items: DCAItem[], codIbge: string, nome: string, uf: string, populacao: number, ano: number): FiscalData {
  // Helper to find a single value by exact cod_conta and partial match on anexo/coluna
  function findValue(codConta: string, anexoSubstr: string, colunaSubstr: string): number {
    for (const item of items) {
      if (item.cod_conta !== codConta) continue;
      if (!item.anexo.includes(anexoSubstr)) continue;
      // Use substring match for coluna to handle encoding variations (e.g. Deduções vs Deduções)
      if (!item.coluna.includes(colunaSubstr)) continue;
      return item.valor || 0;
    }
    return 0;
  }

  // Receita Total — Anexo I-C, "ReceitasExcetoIntraOrcamentarias", "Receitas Brutas Realizadas"
  const receitaBruta = findValue('ReceitasExcetoIntraOrcamentarias', 'I-C', 'Receitas Brutas Realizadas');
  // Deductions (FUNDEB + other) — use partial match to handle encoding
  const deducoesFundeb = findValue('ReceitasExcetoIntraOrcamentarias', 'I-C', 'FUNDEB');
  const deducoesOutras = findValue('ReceitasExcetoIntraOrcamentarias', 'I-C', 'Outras Dedu');
  // Net revenue = gross - deductions (deductions are sometimes already negative)
  const receita = receitaBruta - Math.abs(deducoesFundeb) - Math.abs(deducoesOutras);

  // Despesa Total — Anexo I-D, "TotalDespesas", "Despesas Liquidadas"
  const despesa = findValue('TotalDespesas', 'I-D', 'Despesas Liquidadas');

  // Despesa com Pessoal e Encargos Sociais — Anexo I-D, "DO3.1.00.00.00.00", "Despesas Liquidadas"
  const despesaPessoal = findValue('DO3.1.00.00.00.00', 'I-D', 'Despesas Liquidadas');

  // Despesa com Administração (função 04) — Anexo I-D, "FO04", "Despesas Liquidadas"
  const despesaAdmin = findValue('FO04', 'I-D', 'Despesas Liquidadas');

  // Receita Tributária (Impostos, Taxas e Contribuições de Melhoria) — Anexo I-C, "RO1.1.0.0.00.0.0"
  const receitaTributaria = findValue('RO1.1.0.0.00.0.0', 'I-C', 'Receitas Brutas Realizadas');

  // Receita Patrimonial — Anexo I-C, "RO1.2.0.0.00.0.0"
  const receitaPatrimonial = findValue('RO1.2.0.0.00.0.0', 'I-C', 'Receitas Brutas Realizadas');

  // Receita de Serviços — Anexo I-C, "RO1.3.0.0.00.0.0"
  const receitaServicos = findValue('RO1.3.0.0.00.0.0', 'I-C', 'Receitas Brutas Realizadas');

  // Broader own-source revenue: tributária + patrimonial + serviços
  const receitaPropria = receitaTributaria + receitaPatrimonial + receitaServicos;

  // Receita de Transferências Correntes — Anexo I-C, "RO1.7.0.0.00.0.0"
  const receitaTransferencias = findValue('RO1.7.0.0.00.0.0', 'I-C', 'Receitas Brutas Realizadas');

  // FPM (Fundo de Participação dos Municípios) — Anexo I-C
  // Account code: RO1.7.1.1.51.0.0 = total FPM (mensal + extraordinária)
  // Sub-codes: RO1.7.1.1.51.1.0 = Cota Mensal, RO1.7.1.1.51.2.0 = Cotas Extraordinárias
  let fpm = findValue('RO1.7.1.1.51.0.0', 'I-C', 'Receitas Brutas Realizadas');
  if (fpm === 0) {
    // Fallback: sum sub-codes if aggregate not present
    const fpmMensal = findValue('RO1.7.1.1.51.1.0', 'I-C', 'Receitas Brutas Realizadas');
    const fpmExtra = findValue('RO1.7.1.1.51.2.0', 'I-C', 'Receitas Brutas Realizadas');
    fpm = fpmMensal + fpmExtra;
  }

  // Use gross revenue if net is negative or zero (deduction issue)
  const receitaFinal = receita > 0 ? receita : receitaBruta;

  const efa = receitaFinal > 0 ? receitaPropria / receitaFinal : 0;
  const saldo = receitaFinal - despesa;

  return {
    codIbge,
    nome,
    uf,
    populacao,
    receita: receitaFinal,
    despesa,
    despesaPessoal,
    despesaAdmin,
    receitaPropria,
    receitaTransferencias,
    fpm,
    efa,
    saldo,
    ano,
    dadosIndisponiveis: receitaFinal === 0 && despesa === 0,
  };
}

async function fetchMunicipio(codIbge: string, nome: string, uf: string, populacao: number): Promise<FiscalData> {
  // Try each year (most recent first)
  for (const year of YEARS_TO_TRY) {
    const url = `${DCA_URL}?an_exercicio=${year}&id_ente=${codIbge}`;
    const data = await fetchJSON<{ items: DCAItem[] }>(url);

    if (data?.items && data.items.length > 0) {
      return extractFiscalFromDCA(data.items, codIbge, nome, uf, populacao, year);
    }

    await sleep(RATE_LIMIT_MS);
  }

  // No data found for any year
  return {
    codIbge,
    nome,
    uf,
    populacao,
    receita: 0,
    despesa: 0,
    despesaPessoal: 0,
    despesaAdmin: 0,
    receitaPropria: 0,
    receitaTransferencias: 0,
    fpm: 0,
    efa: 0,
    saldo: 0,
    ano: 0,
    dadosIndisponiveis: true,
  };
}

async function main() {
  console.log('=== Script 02: Fetch Fiscal Data from SICONFI ===\n');

  // Ensure directories
  for (const dir of [DATA_DIR, CACHE_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  // Step 1: Fetch all entes (municipalities list)
  console.log('Step 1: Fetching list of municipalities (entes)...');
  let entes: Ente[];

  if (fs.existsSync(ENTES_FILE)) {
    console.log('  Using cached entes file.');
    entes = JSON.parse(fs.readFileSync(ENTES_FILE, 'utf-8'));
  } else {
    const res = await fetchJSON<{ items: Ente[] }>(ENTES_URL);
    if (!res?.items) {
      throw new Error('Failed to fetch entes from SICONFI');
    }
    entes = res.items;
    fs.writeFileSync(ENTES_FILE, JSON.stringify(entes, null, 2), 'utf-8');
    console.log(`  Saved ${entes.length} entes.`);
  }

  // Filter to municipalities only (esfera = 'M')
  const municipios = entes.filter(e => e.esfera === 'M');
  console.log(`  Total municipalities: ${municipios.length}\n`);

  // Step 2: Fetch fiscal data for each municipality
  console.log('Step 2: Fetching DCA data per municipality...');
  console.log(`  Rate limit: ${RATE_LIMIT_MS}ms/request`);
  console.log(`  Estimated time: ~${Math.ceil(municipios.length * RATE_LIMIT_MS / 60000)} minutes`);
  console.log(`  (Already cached municipalities will be skipped)\n`);

  const results: Record<string, FiscalData> = {};
  let cached = 0;
  let fetched = 0;
  let errors = 0;
  const startTime = Date.now();

  for (let i = 0; i < municipios.length; i++) {
    const m = municipios[i];
    const codIbge = String(m.cod_ibge);
    const cacheFile = getCacheFile(codIbge);

    // Check cache — invalidate if missing new fields (fpm, receitaTransferencias, despesaAdmin)
    if (fs.existsSync(cacheFile)) {
      const cachedData = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
      if ('fpm' in cachedData && 'receitaTransferencias' in cachedData && 'despesaAdmin' in cachedData) {
        results[codIbge] = cachedData;
        cached++;
        continue;
      }
      // Cache is stale (missing new fields) — re-fetch
    }

    // Fetch from API
    try {
      const fiscal = await fetchMunicipio(codIbge, m.ente, m.uf, m.populacao);
      results[codIbge] = fiscal;

      // Save to cache
      fs.writeFileSync(cacheFile, JSON.stringify(fiscal, null, 2), 'utf-8');
      fetched++;

      // Progress report every 100 municipalities
      if ((fetched + cached) % 100 === 0 || i === municipios.length - 1) {
        const elapsed = ((Date.now() - startTime) / 60000).toFixed(1);
        const pct = ((i + 1) / municipios.length * 100).toFixed(1);
        console.log(
          `  [${pct}%] ${i + 1}/${municipios.length} | ` +
          `Fetched: ${fetched}, Cached: ${cached}, Errors: ${errors} | ` +
          `Elapsed: ${elapsed} min`
        );
      }
    } catch (err) {
      console.error(`  ERROR for ${codIbge} (${m.ente}):`, (err as Error).message);
      errors++;
      results[codIbge] = {
        codIbge,
        nome: m.ente,
        uf: m.uf,
        populacao: m.populacao,
        receita: 0,
        despesa: 0,
        despesaPessoal: 0,
        despesaAdmin: 0,
        receitaPropria: 0,
        receitaTransferencias: 0,
        fpm: 0,
        efa: 0,
        saldo: 0,
        ano: 0,
        dadosIndisponiveis: true,
      };
    }

    // Rate limit
    await sleep(RATE_LIMIT_MS);
  }

  // Step 3: Save consolidated output
  console.log('\nStep 3: Saving consolidated fiscal data...');
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2), 'utf-8');

  const available = Object.values(results).filter(r => !r.dadosIndisponiveis).length;
  const totalElapsed = ((Date.now() - startTime) / 60000).toFixed(1);

  console.log(`\n✓ Saved fiscal data to ${OUTPUT_FILE}`);
  console.log(`  Total municipalities: ${municipios.length}`);
  console.log(`  Data available: ${available}`);
  console.log(`  Data unavailable: ${municipios.length - available}`);
  console.log(`  Cached (skipped): ${cached}`);
  console.log(`  Freshly fetched: ${fetched}`);
  console.log(`  Errors: ${errors}`);
  console.log(`  Total time: ${totalElapsed} min`);
}

main().catch((err) => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
