'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import Map, { Source, Layer, MapLayerMouseEvent, MapRef } from 'react-map-gl/maplibre';
import * as topojsonClient from 'topojson-client';
import type { Topology } from 'topojson-specification';
import type { MapViewState, TooltipInfo, MergeResults, MergeGroup, GlobalStats } from '@/lib/types';
import { getFillColorExpression, getHoverOpacityExpression, getLineHoverColorExpression } from '@/lib/colors';
import Tooltip from './Tooltip';
import Legend from './Legend';
import StateFilter from './StateFilter';

// CARTO Dark Matter — free, no API key
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

const INITIAL_VIEW: MapViewState = {
  longitude: -50,
  latitude: -14,
  zoom: 4,
};

interface DualMapViewProps {
  originalTopojson: Topology | null;
  mergedTopojson: Topology | null;
  mergedGeoJSON?: GeoJSON.FeatureCollection | null;
  mergeResults: MergeResults | null;
  globalStats: GlobalStats | null;
}

export default function DualMapView({
  originalTopojson,
  mergedTopojson,
  mergedGeoJSON: mergedGeoJSONProp,
  mergeResults,
  globalStats,
}: DualMapViewProps) {
  const [viewState, setViewState] = useState<MapViewState>(INITIAL_VIEW);
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);
  const [hoveredId, setHoveredId] = useState<{ source: 'original' | 'merged'; id: string } | null>(null);

  const mapOriginalRef = useRef<MapRef>(null);
  const mapMergedRef = useRef<MapRef>(null);

  // Convert TopoJSON to GeoJSON
  const originalGeoJSON = useMemo(() => {
    if (!originalTopojson) return null;
    try {
      return topojsonClient.feature(originalTopojson, originalTopojson.objects.municipalities) as GeoJSON.FeatureCollection;
    } catch (e) {
      console.error('Error converting original TopoJSON:', e);
      return null;
    }
  }, [originalTopojson]);

  const mergedGeoJSON = useMemo(() => {
    // Prefer dynamic GeoJSON from optimizer if available
    if (mergedGeoJSONProp) return mergedGeoJSONProp;
    // Fall back to static TopoJSON
    if (!mergedTopojson) return null;
    try {
      return topojsonClient.feature(mergedTopojson, mergedTopojson.objects.municipalities) as GeoJSON.FeatureCollection;
    } catch (e) {
      console.error('Error converting merged TopoJSON:', e);
      return null;
    }
  }, [mergedGeoJSONProp, mergedTopojson]);

  // Create merge lookup: codIbge → group info
  const mergeLookup = useMemo((): Record<string, MergeGroup> => {
    if (!mergeResults) return {};
    const lookup: Record<string, MergeGroup> = {};
    for (const group of mergeResults.groups) {
      for (const member of group.members) {
        lookup[member] = group;
      }
      lookup[group.id] = group;
    }
    return lookup;
  }, [mergeResults]);

  // Handle view state change (syncs both maps)
  const onMove = useCallback((evt: { viewState: MapViewState }) => {
    setViewState(evt.viewState);
  }, []);

  // Handle hover on original map
  const onHoverOriginal = useCallback((evt: MapLayerMouseEvent) => {
    const feature = evt.features?.[0];
    if (feature?.properties) {
      const props = feature.properties;
      setTooltip({
        x: evt.point.x,
        y: evt.point.y,
        codIbge: props.codIbge,
        nome: props.nome,
        uf: props.uf,
        populacao: props.populacao || 0,
        saldo: props.saldo || 0,
        efa: props.efa || 0,
        receita: props.receita || 0,
        despesa: props.despesa || 0,
      });
      setHoveredId({ source: 'original', id: props.codIbge });
    } else {
      setTooltip(null);
      setHoveredId(null);
    }
  }, []);

  // Handle hover on merged map
  const onHoverMerged = useCallback((evt: MapLayerMouseEvent) => {
    const feature = evt.features?.[0];
    if (feature?.properties) {
      const props = feature.properties;
      const group = mergeLookup[props.codIbge];

      // Get member names if it's a merged group
      let memberNames: string[] | undefined;
      if (group && group.members.length > 1 && originalGeoJSON) {
        memberNames = group.members
          .map(cod => {
            const feat = originalGeoJSON.features.find(f => f.properties?.codIbge === cod);
            return feat?.properties?.nome || cod;
          })
          .slice(0, 10); // limit to 10 names
      }

      setTooltip({
        x: evt.point.x + (typeof window !== 'undefined' ? window.innerWidth / 2 : 0), // offset for right map
        y: evt.point.y,
        codIbge: props.codIbge,
        nome: props.nome,
        uf: props.uf,
        populacao: props.populacao || 0,
        saldo: props.saldo || 0,
        efa: props.efa || 0,
        receita: props.receita || 0,
        despesa: props.despesa || 0,
        isMerged: props.isMerged === true || props.isMerged === 'true',
        membersCount: props.membersCount || 1,
        economia: props.economia || 0,
        saldoOtimizado: props.saldoOtimizado || props.saldo || 0,
        memberNames,
      });
      setHoveredId({ source: 'merged', id: props.codIbge });
    } else {
      setTooltip(null);
      setHoveredId(null);
    }
  }, [mergeLookup, originalGeoJSON]);

  const onMouseLeave = useCallback(() => {
    setTooltip(null);
    setHoveredId(null);
  }, []);

  // Feature state for hover highlighting
  useEffect(() => {
    const maps = [
      { ref: mapMergedRef, sourceLayer: 'merged' },
      { ref: mapOriginalRef, sourceLayer: 'original' },
    ];
    for (const { ref } of maps) {
      const map = ref.current?.getMap();
      if (!map) continue;
      // Clear all hover states would require tracking previous — skip for simplicity
    }
  }, [hoveredId]);

  // Fly to state when selected
  const onStateSelect = useCallback((uf: string | null) => {
    if (!uf || !originalGeoJSON) {
      setViewState(INITIAL_VIEW);
      return;
    }

    // Find bounding box of selected state
    const stateFeatures = originalGeoJSON.features.filter(f => f.properties?.uf === uf);
    if (stateFeatures.length === 0) return;

    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    for (const feat of stateFeatures) {
      const coords = getAllCoords(feat.geometry);
      for (const [lng, lat] of coords) {
        if (lng < minLng) minLng = lng;
        if (lat < minLat) minLat = lat;
        if (lng > maxLng) maxLng = lng;
        if (lat > maxLat) maxLat = lat;
      }
    }

    const centerLng = (minLng + maxLng) / 2;
    const centerLat = (minLat + maxLat) / 2;
    const span = Math.max(maxLng - minLng, maxLat - minLat);
    const zoom = Math.max(3, Math.min(10, Math.log2(360 / span) - 0.5));

    setViewState({ longitude: centerLng, latitude: centerLat, zoom });
  }, [originalGeoJSON]);

  const numResultante = globalStats?.municipiosResultante ?? '...';

  return (
    <div className="relative flex-1 flex flex-col h-full">
      {/* Map labels */}
      <div className="flex h-10 bg-gray-900/80 backdrop-blur border-b border-gray-800 z-10">
        <div className="flex-1 flex items-center justify-center gap-2 border-r border-gray-800">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-sm font-medium text-gray-300">
            Original — 5.570 municípios
          </span>
        </div>
        <div className="flex-1 flex items-center justify-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-sm font-medium text-gray-300">
            Otimizado — {numResultante} municípios
          </span>
        </div>
      </div>

      {/* State filter */}
      <div className="absolute top-12 left-4 z-20">
        <StateFilter
          states={globalStats?.byState || []}
          onSelect={onStateSelect}
        />
      </div>

      {/* Maps container */}
      <div className="flex-1 flex">
        {/* Original Map (Left) */}
        <div className="flex-1 relative">
          <Map
            ref={mapOriginalRef}
            {...viewState}
            onMove={onMove}
            mapStyle={MAP_STYLE}
            interactiveLayerIds={originalGeoJSON ? ['choropleth-fill-original'] : []}
            onMouseMove={onHoverOriginal}
            onMouseLeave={onMouseLeave}
          >
            {originalGeoJSON && (
              <Source id="original" type="geojson" data={originalGeoJSON}>
                <Layer
                  id="choropleth-fill-original"
                  type="fill"
                  paint={{
                    'fill-color': getFillColorExpression() as never,
                    'fill-opacity': getHoverOpacityExpression() as never,
                  }}
                />
                <Layer
                  id="choropleth-line-original"
                  type="line"
                  paint={{
                    'line-color': getLineHoverColorExpression() as never,
                    'line-width': 0.5,
                  }}
                />
              </Source>
            )}
          </Map>
          <Legend />
        </div>

        {/* Divider */}
        <div className="w-px bg-gray-700" />

        {/* Merged Map (Right) */}
        <div className="flex-1 relative">
          <Map
            ref={mapMergedRef}
            {...viewState}
            onMove={onMove}
            mapStyle={MAP_STYLE}
            interactiveLayerIds={mergedGeoJSON ? ['choropleth-fill-merged'] : []}
            onMouseMove={onHoverMerged}
            onMouseLeave={onMouseLeave}
          >
            {mergedGeoJSON && (
              <Source id="merged" type="geojson" data={mergedGeoJSON}>
                <Layer
                  id="choropleth-fill-merged"
                  type="fill"
                  paint={{
                    'fill-color': getFillColorExpression() as never,
                    'fill-opacity': getHoverOpacityExpression() as never,
                  }}
                />
                <Layer
                  id="choropleth-line-merged"
                  type="line"
                  paint={{
                    'line-color': getLineHoverColorExpression() as never,
                    'line-width': [
                      'case',
                      ['boolean', ['get', 'isMerged'], false],
                      1.5,
                      0.5,
                    ] as never,
                  }}
                />
              </Source>
            )}
          </Map>
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && <Tooltip data={tooltip} />}
    </div>
  );
}

/** Helper: extract all coordinates from a geometry */
function getAllCoords(geometry: GeoJSON.Geometry): number[][] {
  const coords: number[][] = [];
  function walk(obj: unknown) {
    if (Array.isArray(obj)) {
      if (typeof obj[0] === 'number') {
        coords.push(obj as number[]);
      } else {
        for (const item of obj) walk(item);
      }
    }
  }
  if ('coordinates' in geometry) {
    walk(geometry.coordinates);
  }
  return coords;
}
