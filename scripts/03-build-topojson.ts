// ============================================================
// Script 03: Convert GeoJSON to TopoJSON
// Creates optimized TopoJSON with quantization and simplification
// ============================================================
import * as fs from 'fs';
import * as path from 'path';
import * as topojsonServer from 'topojson-server';
import * as topojsonSimplify from 'topojson-simplify';

const DATA_DIR = path.join(__dirname, 'data');
const INPUT_FILE = path.join(DATA_DIR, 'br-raw.geojson');
const OUTPUT_FILE = path.join(DATA_DIR, 'br-municipalities.topojson');

async function main() {
  console.log('=== Script 03: Convert GeoJSON → TopoJSON ===\n');

  if (!fs.existsSync(INPUT_FILE)) {
    throw new Error(`Input file not found: ${INPUT_FILE}\nRun script 01 first.`);
  }

  // Step 1: Load GeoJSON
  console.log('Step 1: Loading GeoJSON...');
  const geojson = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));
  console.log(`  Features: ${geojson.features.length}`);

  // Step 2: Convert to TopoJSON with quantization
  console.log('\nStep 2: Converting to TopoJSON...');
  const topology = topojsonServer.topology(
    { municipalities: geojson },
    1e5 // quantization parameter — 100,000 for good precision at national scale
  );
  console.log(`  Arcs: ${topology.arcs.length}`);

  // Step 3: Simplify (remove small details while preserving topology)
  console.log('\nStep 3: Simplifying topology...');
  const presimplified = topojsonSimplify.presimplify(topology);
  const simplified = topojsonSimplify.simplify(presimplified, 1e-7);
  const filtered = topojsonSimplify.filter(simplified, topojsonSimplify.filterWeight(simplified, 1e-8));
  
  const finalTopology = filtered || simplified;
  
  // Step 4: Save
  console.log('\nStep 4: Saving TopoJSON...');
  const output = JSON.stringify(finalTopology);
  fs.writeFileSync(OUTPUT_FILE, output, 'utf-8');

  const sizeMB = (Buffer.byteLength(output) / 1024 / 1024).toFixed(2);
  const originalSize = (fs.statSync(INPUT_FILE).size / 1024 / 1024).toFixed(2);

  console.log(`\n✓ Saved TopoJSON to ${OUTPUT_FILE}`);
  console.log(`  Original GeoJSON: ${originalSize} MB`);
  console.log(`  TopoJSON: ${sizeMB} MB`);
  console.log(`  Compression ratio: ${(parseFloat(sizeMB) / parseFloat(originalSize) * 100).toFixed(0)}%`);
  console.log(`  Arcs: ${finalTopology.arcs.length}`);
}

main().catch((err) => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
