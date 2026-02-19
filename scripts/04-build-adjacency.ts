// ============================================================
// Script 04: Build Adjacency Graph
// Uses topojson.neighbors() for fast, topology-aware adjacency
// ============================================================
import * as fs from 'fs';
import * as path from 'path';
import * as topojsonClient from 'topojson-client';

const DATA_DIR = path.join(__dirname, 'data');
const INPUT_FILE = path.join(DATA_DIR, 'br-municipalities.topojson');
const OUTPUT_FILE = path.join(DATA_DIR, 'adjacency.json');

async function main() {
  console.log('=== Script 04: Build Adjacency Graph ===\n');

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

  // Step 5: Save
  console.log('\nStep 5: Saving adjacency graph...');
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(adjacency, null, 2), 'utf-8');

  // Stats
  const neighborCounts = Object.values(adjacency).map(v => v.length);
  const avgNeighbors = (neighborCounts.reduce((a, b) => a + b, 0) / neighborCounts.length).toFixed(1);
  const maxNeighbors = Math.max(...neighborCounts);
  const minNeighbors = Math.min(...neighborCounts);

  console.log(`\n✓ Saved adjacency graph to ${OUTPUT_FILE}`);
  console.log(`  Municipalities: ${Object.keys(adjacency).length}`);
  console.log(`  Unique edges: ${uniqueEdges}`);
  console.log(`  Avg neighbors per municipality: ${avgNeighbors}`);
  console.log(`  Min neighbors: ${minNeighbors}, Max neighbors: ${maxNeighbors}`);
  console.log(`  Isolated (0 neighbors): ${isolated.length}`);
}

main().catch((err) => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
