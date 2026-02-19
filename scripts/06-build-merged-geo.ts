// ============================================================
// Script 06: Build Merged Geometries
// Dissolves merged municipality geometries using topojson.merge()
// ============================================================
import * as fs from 'fs';
import * as path from 'path';
import * as topojsonClient from 'topojson-client';
import * as topojsonServer from 'topojson-server';

const DATA_DIR = path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, '..', 'public', 'data');
const TOPO_FILE = path.join(DATA_DIR, 'br-municipalities.topojson');
const FISCAL_FILE = path.join(DATA_DIR, 'fiscal-raw.json');
const MERGE_FILE = path.join(PUBLIC_DIR, 'merge-results.json');
const OUTPUT_ORIGINAL = path.join(PUBLIC_DIR, 'br-original.topojson');
const OUTPUT_MERGED = path.join(PUBLIC_DIR, 'br-merged.topojson');

interface MergeGroup {
  id: string;
  members: string[];
  nome: string;
  uf: string;
  populacao: number;
  receita: number;
  despesa: number;
  despesaPessoal: number;
  receitaPropria: number;
  efa: number;
  saldo: number;
  economia: number;
  saldoOtimizado: number;
}

interface FiscalEntry {
  codIbge: string;
  nome: string;
  uf: string;
  populacao: number;
  receita: number;
  despesa: number;
  despesaPessoal: number;
  receitaPropria: number;
  saldo: number;
  dadosIndisponiveis: boolean;
}

async function main() {
  console.log('=== Script 06: Build Merged Geometries ===\n');

  // Ensure output dir
  if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });

  // Load inputs
  console.log('Loading data...');
  const topology = JSON.parse(fs.readFileSync(TOPO_FILE, 'utf-8'));
  const mergeResults = JSON.parse(fs.readFileSync(MERGE_FILE, 'utf-8'));
  const fiscalData: Record<string, FiscalEntry> = JSON.parse(fs.readFileSync(FISCAL_FILE, 'utf-8'));

  const geometries = topology.objects.municipalities.geometries;
  const groups: MergeGroup[] = mergeResults.groups;
  const ungrouped: string[] = mergeResults.ungrouped;

  console.log(`  Geometries: ${geometries.length}`);
  console.log(`  Merge groups: ${groups.length}`);
  console.log(`  Ungrouped: ${ungrouped.length}`);

  // Build codIbge → geometry index
  const codToGeomIndex = new Map<string, number>();
  for (let i = 0; i < geometries.length; i++) {
    const cod = String(geometries[i].properties?.codIbge || geometries[i].properties?.codarea || '');
    codToGeomIndex.set(cod, i);
  }

  // ============================================================
  // Part A: Build original map (with fiscal data in properties)
  // ============================================================
  console.log('\nBuilding original map TopoJSON...');
  for (const geom of geometries) {
    const cod = String(geom.properties?.codIbge || geom.properties?.codarea || '');
    const fiscal = fiscalData[cod];
    if (fiscal) {
      geom.properties = {
        ...geom.properties,
        codIbge: cod,
        nome: fiscal.nome,
        uf: fiscal.uf,
        populacao: fiscal.populacao,
        receita: fiscal.receita,
        despesa: fiscal.despesa,
        saldo: fiscal.saldo,
        saldoPerCapita: fiscal.populacao > 0 ? Math.round(fiscal.saldo / fiscal.populacao) : 0,
        efa: Math.round(fiscal.receita > 0 ? (fiscal.receitaPropria / fiscal.receita) * 100 : 0),
        despesaPessoal: fiscal.despesaPessoal,
        receitaPropria: fiscal.receitaPropria,
        dadosIndisponiveis: fiscal.dadosIndisponiveis || false,
      };
    }
  }
  fs.writeFileSync(OUTPUT_ORIGINAL, JSON.stringify(topology), 'utf-8');
  const origSize = (fs.statSync(OUTPUT_ORIGINAL).size / 1024 / 1024).toFixed(2);
  console.log(`  ✓ Saved ${OUTPUT_ORIGINAL} (${origSize} MB)`);

  // ============================================================
  // Part B: Build merged map
  // ============================================================
  console.log('\nBuilding merged map TopoJSON...');

  // Convert to GeoJSON first for feature manipulation
  const geoCollection = topojsonClient.feature(topology, topology.objects.municipalities);
  const mergedFeatures: GeoJSON.Feature[] = [];

  // Process merge groups — dissolve geometries
  let dissolvedCount = 0;
  for (const group of groups) {
    // Find geometries for all members
    const memberGeoms = group.members
      .map(cod => codToGeomIndex.get(cod))
      .filter((idx): idx is number => idx !== undefined)
      .map(idx => geometries[idx]);

    if (memberGeoms.length === 0) continue;

    // Use topojson.merge to dissolve
    let mergedGeometry: GeoJSON.Geometry;
    try {
      mergedGeometry = topojsonClient.merge(topology, memberGeoms);
    } catch {
      // Fallback: just use the first member's geometry
      const firstIdx = codToGeomIndex.get(group.members[0]);
      if (firstIdx === undefined) continue;
      const feat = (geoCollection as GeoJSON.FeatureCollection).features.find(
        f => f.properties?.codIbge === group.members[0] || f.properties?.codarea === group.members[0]
      );
      if (!feat) continue;
      mergedGeometry = feat.geometry;
    }

    mergedFeatures.push({
      type: 'Feature',
      properties: {
        codIbge: group.id,
        nome: group.nome,
        uf: group.uf,
        populacao: group.populacao,
        receita: group.receita,
        despesa: group.despesa,
        saldo: group.saldo,
        saldoPerCapita: group.populacao > 0 ? Math.round(group.saldoOtimizado / group.populacao) : 0,
        efa: Math.round(group.efa * 100),
        economia: group.economia,
        saldoOtimizado: group.saldoOtimizado,
        isMerged: true,
        membersCount: group.members.length,
        memberCodes: group.members.join(','),
      },
      geometry: mergedGeometry,
    });

    dissolvedCount++;
  }

  // Add ungrouped municipalities (unchanged geometry)
  for (const codIbge of ungrouped) {
    const feat = (geoCollection as GeoJSON.FeatureCollection).features.find(
      f => f.properties?.codIbge === codIbge || f.properties?.codarea === codIbge
    );
    if (!feat) continue;

    const fiscal = fiscalData[codIbge];
    mergedFeatures.push({
      type: 'Feature',
      properties: {
        codIbge,
        nome: fiscal?.nome || `Município ${codIbge}`,
        uf: fiscal?.uf || '',
        populacao: fiscal?.populacao || 0,
        receita: fiscal?.receita || 0,
        despesa: fiscal?.despesa || 0,
        saldo: fiscal?.saldo || 0,
        saldoPerCapita: fiscal && fiscal.populacao > 0 ? Math.round(fiscal.saldo / fiscal.populacao) : 0,
        efa: fiscal ? Math.round((fiscal.receita > 0 ? fiscal.receitaPropria / fiscal.receita : 0) * 100) : 0,
        economia: 0,
        saldoOtimizado: fiscal?.saldo || 0,
        isMerged: false,
        membersCount: 1,
      },
      geometry: feat.geometry,
    });
  }

  console.log(`  Dissolved groups: ${dissolvedCount}`);
  console.log(`  Ungrouped features: ${ungrouped.length}`);
  console.log(`  Total merged features: ${mergedFeatures.length}`);

  // Convert back to TopoJSON
  const mergedGeoJSON: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: mergedFeatures,
  };

  const mergedTopology = topojsonServer.topology({ municipalities: mergedGeoJSON }, 1e5);
  fs.writeFileSync(OUTPUT_MERGED, JSON.stringify(mergedTopology), 'utf-8');
  const mergedSize = (fs.statSync(OUTPUT_MERGED).size / 1024 / 1024).toFixed(2);
  console.log(`  ✓ Saved ${OUTPUT_MERGED} (${mergedSize} MB)`);

  console.log(`\n✓ Done! Both maps ready in ${PUBLIC_DIR}`);
}

main().catch((err) => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
