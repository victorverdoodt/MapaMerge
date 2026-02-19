// ============================================================
// Build merged GeoJSON client-side from topology + merge groups
// Replaces the static br-merged.topojson when optimizer runs
// ============================================================
import * as topojsonClient from 'topojson-client';
import type { Topology, GeometryObject } from 'topojson-specification';
import type { MergeGroup, MunicipalityData } from './types';

/**
 * Build a merged GeoJSON FeatureCollection from the original topology
 * and optimizer results. Dissolves geometries for merge groups using
 * topojson.merge(), and copies ungrouped features as-is.
 */
export function buildMergedGeoJSON(
  topology: Topology,
  groups: MergeGroup[],
  ungrouped: string[],
  fiscal?: Record<string, MunicipalityData>,
): GeoJSON.FeatureCollection {
  const topoObj = topology.objects.municipalities;
  if (!topoObj || topoObj.type !== 'GeometryCollection') {
    return { type: 'FeatureCollection', features: [] };
  }

  const geometries = (topoObj as { type: 'GeometryCollection'; geometries: GeometryObject[] }).geometries;

  // Build codIbge → geometry index
  const codToIndex = new Map<string, number>();
  for (let i = 0; i < geometries.length; i++) {
    const props = (geometries[i] as GeometryObject & { properties?: Record<string, unknown> }).properties || {};
    const cod = String(props.codIbge || props.codarea || '');
    if (cod) codToIndex.set(cod, i);
  }

  // Build codIbge → feature map for ungrouped
  const allFeatures = (topojsonClient.feature(topology, topoObj) as GeoJSON.FeatureCollection).features;
  const featureMap = new Map<string, GeoJSON.Feature>();
  for (const f of allFeatures) {
    const cod = String(f.properties?.codIbge || f.properties?.codarea || '');
    if (cod) featureMap.set(cod, f);
  }

  const mergedFeatures: GeoJSON.Feature[] = [];

  // Process merge groups — dissolve geometries
  for (const group of groups) {
    const memberGeoms = group.members
      .map(cod => codToIndex.get(cod))
      .filter((idx): idx is number => idx !== undefined)
      .map(idx => geometries[idx]);

    if (memberGeoms.length === 0) continue;

    let mergedGeometry: GeoJSON.Geometry;
    try {
      mergedGeometry = topojsonClient.merge(topology, memberGeoms as never[]);
    } catch {
      // Fallback: use first member's geometry
      const feat = featureMap.get(group.members[0]);
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
        economiaLiquida: group.economiaLiquida,
        perdaFPM: group.perdaFPM,
        custoTransicao: group.custoTransicao,
        saldoOtimizado: group.saldoOtimizado,
        isMerged: true,
        membersCount: group.members.length,
        memberCodes: group.members.join(','),
        areaKm2: group.areaKm2 ?? 0,
      },
      geometry: mergedGeometry,
    });
  }

  // Process ungrouped municipalities — keep original geometry
  for (const codIbge of ungrouped) {
    const feat = featureMap.get(codIbge);
    if (!feat) continue;

    // Get fiscal data for properties (from topology or from fiscal map)
    const props = feat.properties || {};
    const fiscalEntry = fiscal?.[codIbge];

    mergedFeatures.push({
      type: 'Feature',
      properties: {
        codIbge,
        nome: fiscalEntry?.nome || props.nome || `Município ${codIbge}`,
        uf: fiscalEntry?.uf || props.uf || '',
        populacao: fiscalEntry?.populacao || props.populacao || 0,
        receita: fiscalEntry?.receita || props.receita || 0,
        despesa: fiscalEntry?.despesa || props.despesa || 0,
        saldo: fiscalEntry?.saldo || props.saldo || 0,
        saldoPerCapita: props.saldoPerCapita || (fiscalEntry && fiscalEntry.populacao > 0 
          ? Math.round(fiscalEntry.saldo / fiscalEntry.populacao) : 0),
        efa: props.efa || (fiscalEntry && fiscalEntry.receita > 0
          ? Math.round((fiscalEntry.receitaPropria / fiscalEntry.receita) * 100) : 0),
        economia: 0,
        economiaLiquida: 0,
        saldoOtimizado: fiscalEntry?.saldo || props.saldo || 0,
        isMerged: false,
        membersCount: 1,
      },
      geometry: feat.geometry,
    });
  }

  return { type: 'FeatureCollection', features: mergedFeatures };
}
