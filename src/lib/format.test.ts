import { describe, it, expect } from 'vitest';
import {
  formatBRL,
  formatBRLDecimals,
  formatNumber,
  formatPercent,
  formatBRLAbbrev,
  formatPopulation,
} from './format';

describe('formatBRL', () => {
  it('should format positive values as BRL currency', () => {
    const result = formatBRL(1000);
    expect(result).toContain('1.000');
    expect(result).toContain('R$');
  });

  it('should format zero', () => {
    const result = formatBRL(0);
    expect(result).toContain('0');
    expect(result).toContain('R$');
  });

  it('should format negative values', () => {
    const result = formatBRL(-5000);
    expect(result).toContain('5.000');
  });
});

describe('formatBRLDecimals', () => {
  it('should format with 2 decimal places', () => {
    const result = formatBRLDecimals(1234.56);
    expect(result).toContain('R$');
    expect(result).toMatch(/1\.234,56/);
  });
});

describe('formatNumber', () => {
  it('should format with thousand separators', () => {
    expect(formatNumber(1234567)).toBe('1.234.567');
  });

  it('should format small numbers without separators', () => {
    expect(formatNumber(42)).toBe('42');
  });
});

describe('formatPercent', () => {
  it('should format as percentage', () => {
    const result = formatPercent(0.123);
    expect(result).toMatch(/12,3\s*%/);
  });

  it('should format zero percent', () => {
    const result = formatPercent(0);
    expect(result).toMatch(/0,0\s*%/);
  });
});

describe('formatBRLAbbrev', () => {
  it('should abbreviate billions with B', () => {
    expect(formatBRLAbbrev(2_300_000_000)).toBe('R$ 2,3 B');
  });

  it('should abbreviate millions with M', () => {
    expect(formatBRLAbbrev(1_500_000)).toBe('R$ 1,5 M');
  });

  it('should abbreviate thousands with mil', () => {
    expect(formatBRLAbbrev(5_000)).toBe('R$ 5 mil');
  });

  it('should handle negative values', () => {
    expect(formatBRLAbbrev(-1_500_000)).toBe('-R$ 1,5 M');
  });

  it('should fall back to regular BRL for small values', () => {
    const result = formatBRLAbbrev(500);
    expect(result).toContain('R$');
    expect(result).toContain('500');
  });
});

describe('formatPopulation', () => {
  it('should format with hab. suffix', () => {
    expect(formatPopulation(12345)).toBe('12.345 hab.');
  });
});
