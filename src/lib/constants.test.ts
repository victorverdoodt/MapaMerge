import { describe, it, expect } from 'vitest';
import { getCoefFPM, FPM_BRACKETS, UF_NAMES, DEFAULT_PARAMS, PRESETS } from './constants';

describe('getCoefFPM', () => {
  it('should return 0.6 for populations <= 10188', () => {
    expect(getCoefFPM(0)).toBe(0.6);
    expect(getCoefFPM(5000)).toBe(0.6);
    expect(getCoefFPM(10188)).toBe(0.6);
  });

  it('should return 0.8 for populations 10189-13584', () => {
    expect(getCoefFPM(10189)).toBe(0.8);
    expect(getCoefFPM(13584)).toBe(0.8);
  });

  it('should return 4.0 for very large populations', () => {
    expect(getCoefFPM(200000)).toBe(4.0);
    expect(getCoefFPM(1000000)).toBe(4.0);
  });

  it('should match each bracket boundary exactly', () => {
    for (const bracket of FPM_BRACKETS) {
      if (bracket.maxPop === Infinity) continue;
      expect(getCoefFPM(bracket.maxPop)).toBe(bracket.coef);
    }
  });

  it('should transition to next bracket above boundary', () => {
    // Just above first bracket should give second bracket's coef
    expect(getCoefFPM(10189)).toBe(0.8);
    expect(getCoefFPM(13585)).toBe(1.0);
  });
});

describe('FPM_BRACKETS', () => {
  it('should have 18 brackets', () => {
    expect(FPM_BRACKETS).toHaveLength(18);
  });

  it('should be sorted by maxPop ascending', () => {
    for (let i = 1; i < FPM_BRACKETS.length; i++) {
      expect(FPM_BRACKETS[i].maxPop).toBeGreaterThan(FPM_BRACKETS[i - 1].maxPop);
    }
  });

  it('should have increasing coefficients', () => {
    for (let i = 1; i < FPM_BRACKETS.length; i++) {
      expect(FPM_BRACKETS[i].coef).toBeGreaterThan(FPM_BRACKETS[i - 1].coef);
    }
  });

  it('should end with Infinity', () => {
    expect(FPM_BRACKETS[FPM_BRACKETS.length - 1].maxPop).toBe(Infinity);
  });
});

describe('UF_NAMES', () => {
  it('should have 27 Brazilian states', () => {
    expect(Object.keys(UF_NAMES)).toHaveLength(27);
  });

  it('should contain all known UF codes', () => {
    const expectedUFs = [
      'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
      'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
      'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
    ];
    for (const uf of expectedUFs) {
      expect(UF_NAMES).toHaveProperty(uf);
      expect(typeof UF_NAMES[uf]).toBe('string');
      expect(UF_NAMES[uf].length).toBeGreaterThan(0);
    }
  });
});

describe('DEFAULT_PARAMS', () => {
  it('should have valid savings rates between 0 and 1', () => {
    expect(DEFAULT_PARAMS.personnelSavingsRate).toBeGreaterThan(0);
    expect(DEFAULT_PARAMS.personnelSavingsRate).toBeLessThanOrEqual(1);
    expect(DEFAULT_PARAMS.adminSavingsRate).toBeGreaterThan(0);
    expect(DEFAULT_PARAMS.adminSavingsRate).toBeLessThanOrEqual(1);
  });

  it('should have positive transition cost', () => {
    expect(DEFAULT_PARAMS.transitionCostPerCapita).toBeGreaterThan(0);
  });

  it('should have positive amortization years', () => {
    expect(DEFAULT_PARAMS.amortizationYears).toBeGreaterThan(0);
  });

  it('should have valid population and area limits', () => {
    expect(DEFAULT_PARAMS.maxPopulation).toBeGreaterThan(0);
    expect(DEFAULT_PARAMS.maxAreaKm2).toBeGreaterThan(0);
    expect(DEFAULT_PARAMS.maxCentroidDistanceKm).toBeGreaterThan(0);
  });
});

describe('PRESETS', () => {
  it('should have conservador, moderado, agressivo', () => {
    expect(PRESETS).toHaveProperty('conservador');
    expect(PRESETS).toHaveProperty('moderado');
    expect(PRESETS).toHaveProperty('agressivo');
  });

  it('conservador should be more restrictive than agressivo', () => {
    expect(PRESETS.conservador.maxPopulation!).toBeLessThan(PRESETS.agressivo.maxPopulation!);
    expect(PRESETS.conservador.maxMembers!).toBeLessThan(PRESETS.agressivo.maxMembers!);
    expect(PRESETS.conservador.personnelSavingsRate!).toBeLessThan(PRESETS.agressivo.personnelSavingsRate!);
  });
});
