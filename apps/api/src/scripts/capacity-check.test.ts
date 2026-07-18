import { describe, expect, it } from 'vitest';

import { assertCapacitySafety, percentile } from './capacity-check.js';

describe('capacity check safety', () => {
  it('computes nearest-rank percentiles', () => {
    expect(percentile([1, 2, 3, 4, 100], 0.95)).toBe(100);
    expect(percentile([4, 2], 0.5)).toBe(2);
    expect(percentile([], 0.95)).toBe(0);
  });

  it('requires explicit confirmation and remote authorization', () => {
    expect(() => assertCapacitySafety({ CAPACITY_API_URL: 'http://127.0.0.1:3001' })).toThrow(/CAPACITY_CONFIRM/u);
    expect(() => assertCapacitySafety({ CAPACITY_CONFIRM: 'I_UNDERSTAND_VATRUSHKA_CAPACITY_TEST', CAPACITY_API_URL: 'https://staging.example.test' })).toThrow(/CAPACITY_ALLOW_REMOTE/u);
    expect(() => assertCapacitySafety({ CAPACITY_CONFIRM: 'I_UNDERSTAND_VATRUSHKA_CAPACITY_TEST', CAPACITY_ALLOW_REMOTE: 'true', CAPACITY_API_URL: 'https://api.myvatrushka.ru' })).toThrow(/CAPACITY_ALLOW_PRODUCTION/u);
    expect(() => assertCapacitySafety({ CAPACITY_CONFIRM: 'I_UNDERSTAND_VATRUSHKA_CAPACITY_TEST', CAPACITY_API_URL: 'http://127.0.0.1:3001' })).not.toThrow();
  });
});
