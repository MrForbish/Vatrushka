import { describe, expect, it } from 'vitest';

import { findDeepLink, parseDeepLink } from './deep-link.js';

describe('deep link validation', () => {
  it('accepts only opaque invite deep links', () => {
    expect(parseDeepLink('vatrushka://invite/aB2-_xyZ90ab', 'vatrushka')).toBe('aB2-_xyZ90ab');
    expect(parseDeepLink('vatrushka://server/aB2-_xyZ90ab', 'vatrushka')).toBeNull();
    expect(parseDeepLink('https://invite/aB2-_xyZ90ab', 'vatrushka')).toBeNull();
    expect(parseDeepLink('vatrushka://invite/not valid', 'vatrushka')).toBeNull();
    expect(parseDeepLink('vatrushka://invite/short', 'vatrushka')).toBeNull();
  });

  it('finds a deep link among process arguments', () => {
    expect(findDeepLink(['electron.exe', '.', 'vatrushka://invite/XYZ789ab_cde'], 'vatrushka')).toBe('XYZ789ab_cde');
  });
});
