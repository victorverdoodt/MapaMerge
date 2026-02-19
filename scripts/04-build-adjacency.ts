// ============================================================
// Script 04: Build Adjacency Graph with Geographic Metadata
// Uses topojson.neighbors() for adjacency + Turf for area/centroid/distance
// ============================================================
import * as fs from 'fs';
import * as path from 'path';
import * as topojsonClient from 'topojson-client';
import * as turf from '@turf/turf';

const DATA_DIR = path.join(__dirname, 'data');
const INPUT_FILE = path.join(DATA_DIR, 'br-municipalities.topojson');
const OUTPUT_FILE = path.join(DATA_DIR, 'adjacency.json');
const GEO_FILE = path.join(DATA_DIR, 'municipality-geo.json');

export interface MunicipalityGeo {
  areaKm2: number;
  centroid: [number, number]; // [lng, lat]
}

async function main() {
  console.log('=== Script 04: Build Adjacency Graph + Geographic Metadata ===\n');

  if (!fs.existsSync(INPUT_FILE)) {
    throw new Error(`Input file not found: ${INPUT_FILE}\nRun script 03 first.`);
  }

  // Step 1: Load TopoJSON
  console.log('Step 1: Loading TopoJSON...');
  const topology = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));
  const geometries = topology.objects.municipalities.geometries;
  console.log(`  Geometries: ${geometries.length}`);

  // Step 2: Build code index (geometry index → codIbge)
  console.log('\nStep 2: Building index...');
  const indexToCod: string[] = [];
  for (let i = 0; i < geometries.length; i++) {
    const props = geometries[i].properties || {};
    indexToCod[i] = String(props.codIbge || props.codarea || i);
  }

  // Step 3: Compute neighbors using topojson-client
  console.log('\nStep 3: Computing adjacency via topojson.neighbors()...');
  const startTime = Date.now();
  const neighbors = topojsonClient.neighbors(geometries);
  const elapsed = Date.now() - startTime;
  console.log(`  Computed in ${elapsed}ms`);

  // Step 4: Convert to {codIbge: [neighborCodes]} format
  console.log('\nStep 4: Converting to codIbge-based adjacency map...');
  const adjacency: Record<string, string[]> = {};
  let totalEdges = 0;

  for (let i = 0; i < neighbors.length; i++) {
    const cod = indexToCod[i];
    adjacency[cod] = neighbors[i].map((j: number) => indexToCod[j]);
    totalEdges += neighbors[i].length;
  }

  // Edges are counted twice (A→B and B→A), so divide by 2
  const uniqueEdges = totalEdges / 2;

  // Validate: check for isolated municipalities (no neighbors)
  const isolated = Object.entries(adjacency).filter(([, v]) => v.length === 0);
  if (isolated.length > 0) {
    console.warn(`  ⚠ Found ${isolated.length} isolated municipalities (no neighbors):`);
    isolated.slice(0, 10).forEach(([cod]) => {
      console.warn(`    - ${cod}`);
    });
    if (isolated.length > 10) {
      console.warn(`    ... and ${isolated.length - 10} more`);
    }
  }

  // Step 5: Compute geographic metadata (area, centroid) for every municipality
  console.log('\nStep 5: Computing area and centroid for each municipality...');
  const geoCollection = topojsonClient.feature(topology, topology.objects.municipalities) as GeoJSON.FeatureCollection;

  const municipalityGeo: Record<string, MunicipalityGeo> = {};
  let geoComputed = 0;
  let geoErrors = 0;

  for (const feature of geoCollection.features) {
    const cod = String(feature.properties?.codIbge || feature.properties?.codarea || '');
    if (!cod) continue;

    try {
      // Area in km²
      const areaM2 = turf.area(feature);
      const areaKm2 = areaM2 / 1_000_000;

      // Centroid [lng, lat]
      const centroidPoint = turf.centroid(feature);
      const centroid: [number, number] = centroidPoint.geometry.coordinates as [number, number];

      municipalityGeo[cod] = { areaKm2, centroid };
      geoComputed++;
    } catch {
      geoErrors++;
      // Fallback: use bounding box center
      try {
        const bbox = turf.bbox(feature);
        municipalityGeo[cod] = {
          areaKm2: 0,
          centroid: [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2],
        };
      } catch {
        municipalityGeo[cod] = { areaKm2: 0, centroid: [0, 0] };
      }
    }
  }

  console.log(`  Computed: ${geoComputed}, Errors: ${geoErrors}`);

  // Step 6: Save
  console.log('\nStep 6: Saving adjacency graph and geographic metadata...');
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(adjacency, null, 2), 'utf-8');
  fs.writeFileSync(GEO_FILE, JSON.stringify(municipalityGeo, null, 2), 'utf-8');

  // Stats
  const neighborCounts = Object.values(adjacency).map(v => v.length);
  const avgNeighbors = (neighborCounts.reduce((a, b) => a + b, 0) / neighborCounts.length).toFixed(1);
  const maxNeighbors = Math.max(...neighborCounts);
  const minNeighbors = Math.min(...neighborCounts);

  const areas = Object.values(municipalityGeo).map(g => g.areaKm2).filter(a => a > 0);
  const avgArea = areas.length > 0 ? (areas.reduce((a, b) => a + b, 0) / areas.length).toFixed(1) : '0';
  const maxArea = areas.length > 0 ? Math.max(...areas).toFixed(0) : '0';

  console.log(`\n✓ Saved adjacency graph to ${OUTPUT_FILE}`);
  console.log(`✓ Saved geographic metadata to ${GEO_FILE}`);
  console.log(`  Municipalities: ${Object.keys(adjacency).length}`);
  console.log(`  Unique edges: ${uniqueEdges}`);
  console.log(`  Avg neighbors per municipality: ${avgNeighbors}`);
  console.log(`  Min neighbors: ${minNeighbors}, Max neighbors: ${maxNeighbors}`);
  console.log(`  Isolated (0 neighbors): ${isolated.length}`);
  console.log(`  Avg area: ${avgArea} km², Max area: ${maxArea} km²`);
}

main().catch((err) => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
