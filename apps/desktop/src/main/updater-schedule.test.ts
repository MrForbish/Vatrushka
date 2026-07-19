import { describe, expect, it } from 'vitest';

import {
  isUpdateCheckDue,
  UPDATE_ACTIVITY_COOLDOWN_MS,
  UPDATE_INTERVAL_MS,
  UPDATE_START_DELAY_MS,
} from './updater-schedule.js';

describe('automatic update schedule', () => {
  it('checks shortly after startup and at least every fifteen minutes', () => {
    expect(UPDATE_START_DELAY_MS).toBeLessThanOrEqual(5_000);
    expect(UPDATE_INTERVAL_MS).toBeLessThanOrEqual(15 * 60 * 1_000);
  });

  it('checks immediately when no previous attempt exists', () => {
    expect(isUpdateCheckDue(null, 10_000)).toBe(true);
  });

  it('prevents repeated focus events from hammering the update feed', () => {
    expect(isUpdateCheckDue(10_000, 10_000 + UPDATE_ACTIVITY_COOLDOWN_MS - 1)).toBe(false);
    expect(isUpdateCheckDue(10_000, 10_000 + UPDATE_ACTIVITY_COOLDOWN_MS)).toBe(true);
  });

  it('recovers when the system clock moves backwards', () => {
    expect(isUpdateCheckDue(20_000, 10_000)).toBe(true);
  });
});
