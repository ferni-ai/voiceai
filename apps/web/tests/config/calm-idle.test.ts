/**
 * calm-idle.ts: the build switch (VITE_CALM_IDLE) turns calm idle on only when it is
 * exactly "true". Prod builds pass the repo variable, which is unset today, so an
 * empty value must leave it off.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CALM_IDLE_STORAGE_KEY, isCalmIdleOn } from '../../src/config/calm-idle.js';

describe('calm idle build switch', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    localStorage.removeItem(CALM_IDLE_STORAGE_KEY);
  });

  it.each(['', 'false', 'on', '1', 'TRUE'])('stays off when the build passes %j', (value) => {
    vi.stubEnv('VITE_CALM_IDLE', value);
    expect(isCalmIdleOn()).toBe(false);
  });

  it('turns on when the build passes "true"', () => {
    vi.stubEnv('VITE_CALM_IDLE', 'true');
    expect(isCalmIdleOn()).toBe(true);
  });

  it('a device choice still wins over the build switch', () => {
    vi.stubEnv('VITE_CALM_IDLE', 'true');
    localStorage.setItem(CALM_IDLE_STORAGE_KEY, '0');
    expect(isCalmIdleOn()).toBe(false);
  });
});
