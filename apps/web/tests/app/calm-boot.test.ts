import { afterEach, describe, expect, it, vi } from 'vitest';
import { heldModuleCount, holdUntilFirstCall } from '../../src/app/calm-boot.js';
import { CALM_IDLE_STORAGE_KEY } from '../../src/config/calm-idle.js';
import { appState } from '../../src/state/app.state.js';

describe('calm boot', () => {
  afterEach(() => {
    localStorage.removeItem(CALM_IDLE_STORAGE_KEY);
    appState.set('connection', 'disconnected');
  });

  it('with the flag off, starts every module at boot as before', () => {
    const run = vi.fn();
    expect(holdUntilFirstCall('EasterEggsUI', run)).toBe(false);
    expect(heldModuleCount()).toBe(0);
  });

  it('with the flag on, never holds an essential module', () => {
    localStorage.setItem(CALM_IDLE_STORAGE_KEY, '1');
    expect(holdUntilFirstCall('TranscriptUI', vi.fn())).toBe(false);
  });

  it('with the flag on, loads decorative modules when the first call starts', async () => {
    localStorage.setItem(CALM_IDLE_STORAGE_KEY, '1');
    const eggs = vi.fn();
    const weather = vi.fn();
    expect(holdUntilFirstCall('EasterEggsUI', eggs)).toBe(true);
    expect(holdUntilFirstCall('WeatherEffects', weather)).toBe(true);
    expect(heldModuleCount()).toBe(2);
    expect(eggs).not.toHaveBeenCalled();

    appState.set('connection', 'connecting');
    await Promise.resolve();

    expect(eggs).toHaveBeenCalledTimes(1);
    expect(weather).toHaveBeenCalledTimes(1);
    expect(heldModuleCount()).toBe(0);
  });
});
