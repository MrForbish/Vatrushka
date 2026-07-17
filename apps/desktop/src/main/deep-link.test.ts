import { describe, expect, it } from 'vitest';

import { findDeepLink, parseDeepLink } from './deep-link.js';

describe('deep link validation', () => {
  it('accepts only server invite links and normalizes the invite code', () => {
    expect(parseDeepLink('vatrushka://server/abc234xy', 'vatrushka')).toBe('ABC234XY');
    expect(parseDeepLink('vatrushka://join/ABC234XY', 'vatrushka')).toBeNull();
    expect(parseDeepLink('https://server/ABC234XY', 'vatrushka')).toBeNull();
    expect(parseDeepLink('vatrushka://server/ABO120XY', 'vatrushka')).toBeNull();
    expect(parseDeepLink('vatrushka://server/ABC234', 'vatrushka')).toBeNull();
  });

  it('finds a deep link among process arguments', () => {
    expect(findDeepLink(['electron.exe', '.', 'vatrushka://server/XYZ789AB'], 'vatrushka')).toBe('XYZ789AB');
  });
});
