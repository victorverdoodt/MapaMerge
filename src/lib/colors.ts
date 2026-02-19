// ============================================================
// Choropleth color scales for fiscal balance
// ============================================================

/**
 * MapLibre expression for choropleth fill-color based on saldo fiscal.
 * Red = deficit, Yellow = neutral, Green = surplus.
 * Uses per-capita saldo for better comparability.
 */
export function getFillColorExpression(property = 'saldoPerCapita'): unknown[] {
  return [
    'interpolate',
    ['linear'],
    ['get', property],
    -2000, '#991B1B',  // deep red — severe deficit
    -1000, '#DC2626',  // red
    -500,  '#EF4444',  // light red
    -100,  '#F87171',  // very light red
    0,     '#FDE68A',  // yellow/amber — neutral
    100,   '#86EFAC',  // very light green
    500,   '#4ADE80',  // light green
    1000,  '#22C55E',  // green
    2000,  '#166534',  // deep green — strong surplus
  ];
}

/**
 * Simple fill-color: red vs green based on saldo sign.
 */
export function getSimpleFillColorExpression(property = 'saldo'): unknown[] {
  return [
    'case',
    ['<', ['get', property], 0],
    '#EF4444', // red for deficit
    '#22C55E', // green for surplus
  ];
}

/**
 * Hover highlight opacity expression using feature-state.
 */
export function getHoverOpacityExpression(): unknown[] {
  return [
    'case',
    ['boolean', ['feature-state', 'hover'], false],
    0.9,
    0.7,
  ];
}

/**
 * Border color: darker when hovered.
 */
export function getLineColorExpression(): string {
  return 'rgba(255, 255, 255, 0.15)';
}

export function getLineHoverColorExpression(): unknown[] {
  return [
    'case',
    ['boolean', ['feature-state', 'hover'], false],
    'rgba(255, 255, 255, 0.6)',
    'rgba(255, 255, 255, 0.15)',
  ];
}

/** Legend stops for UI */
export const LEGEND_STOPS = [
  { value: -2000, color: '#991B1B', label: '< -R$2.000' },
  { value: -1000, color: '#DC2626', label: '-R$1.000' },
  { value: -500, color: '#EF4444', label: '-R$500' },
  { value: 0, color: '#FDE68A', label: 'R$0' },
  { value: 500, color: '#4ADE80', label: 'R$500' },
  { value: 1000, color: '#22C55E', label: 'R$1.000' },
  { value: 2000, color: '#166534', label: '> R$2.000' },
];
