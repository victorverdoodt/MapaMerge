// ============================================================
// Brazilian number and currency formatting utilities
// ============================================================

const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const brlFormatterDecimals = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat('pt-BR');

const percentFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Format as BRL currency: R$ 1.234.567 */
export function formatBRL(value: number): string {
  return brlFormatter.format(value);
}

/** Format as BRL with decimals: R$ 1.234,56 */
export function formatBRLDecimals(value: number): string {
  return brlFormatterDecimals.format(value);
}

/** Format as number with thousand separators: 1.234.567 */
export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

/** Format as percentage: 12,3% */
export function formatPercent(value: number): string {
  return percentFormatter.format(value);
}

/**
 * Abbreviate large numbers:
 * 1.500.000 → R$ 1,5 M
 * 2.300.000.000 → R$ 2,3 B
 */
export function formatBRLAbbrev(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  if (abs >= 1e9) {
    return `${sign}R$ ${(abs / 1e9).toFixed(1).replace('.', ',')} B`;
  }
  if (abs >= 1e6) {
    return `${sign}R$ ${(abs / 1e6).toFixed(1).replace('.', ',')} M`;
  }
  if (abs >= 1e3) {
    return `${sign}R$ ${(abs / 1e3).toFixed(0)} mil`;
  }
  return formatBRL(value);
}

/** Format population: "12.345 hab." */
export function formatPopulation(value: number): string {
  return `${numberFormatter.format(value)} hab.`;
}
