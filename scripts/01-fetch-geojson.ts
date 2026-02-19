// ============================================================
// Script 01: Fetch GeoJSON from IBGE API
// Downloads municipality boundaries for ALL of Brazil
// ============================================================
import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(__dirname, 'data');
const OUTPUT_FILE = path.join(DATA_DIR, 'br-raw.geojson');
const NAMES_FILE = path.join(DATA_DIR, 'municipios-nomes.json');

// IBGE Malhas API v3 — parameter is "intrarregiao" (NOT "intrarregional")
const GEOJSON_URL =
  'https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=municipio';

// Localidades API for municipality names + UF codes
const LOCALIDADES_URL =
  'https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome';

// UF code lookup from IBGE 2-digit state codes
const UF_CODES: Record<string, { sigla: string; nome: string }> = {
  '11': { sigla: 'RO', nome: 'Rondônia' },
  '12': { sigla: 'AC', nome: 'Acre' },
  '13': { sigla: 'AM', nome: 'Amazonas' },
  '14': { sigla: 'RR', nome: 'Roraima' },
  '15': { sigla: 'PA', nome: 'Pará' },
  '16': { sigla: 'AP', nome: 'Amapá' },
  '17': { sigla: 'TO', nome: 'Tocantins' },
  '21': { sigla: 'MA', nome: 'Maranhão' },
  '22': { sigla: 'PI', nome: 'Piauí' },
  '23': { sigla: 'CE', nome: 'Ceará' },
  '24': { sigla: 'RN', nome: 'Rio Grande do Norte' },
  '25': { sigla: 'PB', nome: 'Paraíba' },
  '26': { sigla: 'PE', nome: 'Pernambuco' },
  '27': { sigla: 'AL', nome: 'Alagoas' },
  '28': { sigla: 'SE', nome: 'Sergipe' },
  '29': { sigla: 'BA', nome: 'Bahia' },
  '31': { sigla: 'MG', nome: 'Minas Gerais' },
  '32': { sigla: 'ES', nome: 'Espírito Santo' },
  '33': { sigla: 'RJ', nome: 'Rio de Janeiro' },
  '35': { sigla: 'SP', nome: 'São Paulo' },
  '41': { sigla: 'PR', nome: 'Paraná' },
  '42': { sigla: 'SC', nome: 'Santa Catarina' },
  '43': { sigla: 'RS', nome: 'Rio Grande do Sul' },
  '50': { sigla: 'MS', nome: 'Mato Grosso do Sul' },
  '51': { sigla: 'MT', nome: 'Mato Grosso' },
  '52': { sigla: 'GO', nome: 'Goiás' },
  '53': { sigla: 'DF', nome: 'Distrito Federal' },
};

interface IBGEMunicipio {
  id: number;
  nome: string;
  microrregiao?: {
    mesorregiao?: {
      UF?: {
        sigla: string;
        nome: string;
      };
    };
  } | null;
}

interface GeoJSONFeature {
  type: string;
  properties: Record<string, unknown>;
  geometry: unknown;
}

interface GeoJSONCollection {
  type: string;
  features: GeoJSONFeature[];
}

async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`  Fetching ${url.substring(0, 100)}...`);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      return res;
    } catch (err) {
      console.warn(`  Attempt ${i + 1} failed:`, (err as Error).message);
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, 2000 * (i + 1)));
    }
  }
  throw new Error('Unreachable');
}

async function main() {
  console.log('=== Script 01: Fetch GeoJSON from IBGE ===\n');

  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Step 1: Fetch municipality names and UF codes
  console.log('Step 1: Fetching municipality names...');
  let namesMap: Map<string, { nome: string; uf: string; ufNome: string }>;

  if (fs.existsSync(NAMES_FILE)) {
    console.log('  Using cached names file.');
    const cached = JSON.parse(fs.readFileSync(NAMES_FILE, 'utf-8'));
    namesMap = new Map(Object.entries(cached));
  } else {
    const namesRes = await fetchWithRetry(LOCALIDADES_URL);
    const municipios: IBGEMunicipio[] = await namesRes.json();
    console.log(`  Found ${municipios.length} municipalities.`);

    namesMap = new Map();
    const namesObj: Record<string, { nome: string; uf: string; ufNome: string }> = {};
    for (const m of municipios) {
      const codIbge = String(m.id);
      // Use optional chaining — some municipalities (e.g. DF) may lack microrregiao
      const ufFromAPI = m.microrregiao?.mesorregiao?.UF;
      const ufCodePrefix = codIbge.substring(0, 2);
      const ufFallback = UF_CODES[ufCodePrefix];
      const entry = {
        nome: m.nome,
        uf: ufFromAPI?.sigla ?? ufFallback?.sigla ?? ufCodePrefix,
        ufNome: ufFromAPI?.nome ?? ufFallback?.nome ?? `Estado ${ufCodePrefix}`,
      };
      namesMap.set(codIbge, entry);
      namesObj[codIbge] = entry;
    }

    fs.writeFileSync(NAMES_FILE, JSON.stringify(namesObj, null, 2), 'utf-8');
    console.log(`  Saved names to ${NAMES_FILE}`);
  }

  // Step 2: Fetch GeoJSON
  console.log('\nStep 2: Fetching GeoJSON from IBGE Malhas API...');
  console.log('  This may take a minute for all of Brazil...');

  let geojson: GeoJSONCollection;

  if (fs.existsSync(OUTPUT_FILE)) {
    console.log('  Using cached GeoJSON file.');
    geojson = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
  } else {
    const geoRes = await fetchWithRetry(GEOJSON_URL);
    geojson = await geoRes.json();
    console.log(`  Received ${geojson.features?.length ?? 0} features.`);
  }

  // Step 3: Enrich features with names and UF codes
  console.log('\nStep 3: Enriching features with municipality names...');
  let enriched = 0;
  let missing = 0;

  for (const feature of geojson.features) {
    const codarea = String(feature.properties.codarea || feature.properties.codIbge || '');
    const info = namesMap.get(codarea);

    if (info) {
      feature.properties.codIbge = codarea;
      feature.properties.nome = info.nome;
      feature.properties.uf = info.uf;
      feature.properties.ufNome = info.ufNome;
      enriched++;
    } else {
      feature.properties.codIbge = codarea;
      feature.properties.nome = `Município ${codarea}`;
      feature.properties.uf = codarea.substring(0, 2);
      missing++;
    }
  }

  console.log(`  Enriched: ${enriched}, Missing names: ${missing}`);

  // Save enriched GeoJSON
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(geojson), 'utf-8');
  const sizeMB = (fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(1);
  console.log(`\n✓ Saved enriched GeoJSON to ${OUTPUT_FILE} (${sizeMB} MB)`);
  console.log(`  Total features: ${geojson.features.length}`);
}

main().catch((err) => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
