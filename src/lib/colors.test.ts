import { describe, it, expect } from 'vitest';
import {
  getFillColorExpression,
  getSimpleFillColorExpression,
  getHoverOpacityExpression,
  getLineColorExpression,
  getLineHoverColorExpression,
  LEGEND_STOPS,
} from './colors';

describe('getFillColorExpression', () => {
  it('should return an interpolate expression array', () => {
    const expr = getFillColorExpression();
    expect(Array.isArray(expr)).toBe(true);
    expect(expr[0]).toBe('interpolate');
    expect(expr[1]).toEqual(['linear']);
  });

  it('should use saldoPerCapita by default', () => {
    const expr = getFillColorExpression();
    expect(expr[2]).toEqual(['get', 'saldoPerCapita']);
  });

  it('should accept custom property name', () => {
    const expr = getFillColorExpression('customProp');
    expect(expr[2]).toEqual(['get', 'customProp']);
  });

  it('should have symmetric color stops (deficit red, surplus green)', () => {
    const expr = getFillColorExpression();
    // First numeric value should be negative (deficit)
    expect(expr[3]).toBeLessThan(0);
    // Should contain yellow/amber for neutral (value = 0)
    const zeroIdx = expr.indexOf(0);
    expect(zeroIdx).toBeGreaterThan(-1);
  });
});

describe('getSimpleFillColorExpression', () => {
  it('should return a case expression', () => {
    const expr = getSimpleFillColorExpression();
    expect(expr[0]).toBe('case');
  });
});

describe('getHoverOpacityExpression', () => {
  it('should return a boolean feature-state expression', () => {
    const expr = getHoverOpacityExpression();
    expect(expr[0]).toBe('case');
    expect(expr).toContainEqual(['boolean', ['feature-state', 'hover'], false]);
  });

  it('should have higher opacity when hovered', () => {
    const expr = getHoverOpacityExpression();
    const hoveredOpacity = expr[2] as number;
    const normalOpacity = expr[3] as number;
    expect(hoveredOpacity).toBeGreaterThan(normalOpacity);
  });
});

describe('getLineColorExpression', () => {
  it('should return a string color', () => {
    expect(typeof getLineColorExpression()).toBe('string');
    expect(getLineColorExpression()).toContain('rgba');
  });
});

describe('getLineHoverColorExpression', () => {
  it('should return a case expression', () => {
    const expr = getLineHoverColorExpression();
    expect(expr[0]).toBe('case');
  });
});

describe('LEGEND_STOPS', () => {
  it('should have at least 5 stops', () => {
    expect(LEGEND_STOPS.length).toBeGreaterThanOrEqual(5);
  });

  it('should be sorted by value ascending', () => {
    for (let i = 1; i < LEGEND_STOPS.length; i++) {
      expect(LEGEND_STOPS[i].value).toBeGreaterThan(LEGEND_STOPS[i - 1].value);
    }
  });

  it('should include zero stop', () => {
    expect(LEGEND_STOPS.find(s => s.value === 0)).toBeDefined();
  });

  it('each stop should have color and label', () => {
    for (const stop of LEGEND_STOPS) {
      expect(typeof stop.color).toBe('string');
      expect(typeof stop.label).toBe('string');
      expect(stop.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});
