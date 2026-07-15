import { describe, expect, it } from 'vitest';

import { findDeepLink, parseDeepLink } from './deep-link.js';

describe('deep link validation', () => {
  it('accepts only the configured join URI and normalizes room code', () => {
    expect(parseDeepLink('vatrushka://join/abc234', 'vatrushka')).toBe('ABC234');
    expect(parseDeepLink('vatrushka://other/ABC234', 'vatrushka')).toBeNull();
    expect(parseDeepLink('https://join/ABC234', 'vatrushka')).toBeNull();
    expect(parseDeepLink('vatrushka://join/ABO120', 'vatrushka')).toBeNull();
  });

  it('finds a deep link among process arguments', () => {
    expect(findDeepLink(['electron.exe', '.', 'vatrushka://join/XYZ789'], 'vatrushka')).toBe('XYZ789');
  });
});
