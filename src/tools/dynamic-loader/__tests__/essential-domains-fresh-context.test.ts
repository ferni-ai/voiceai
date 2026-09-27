/**
 * A LiveKit job runs in its own context (job process / worker thread) with a
 * fresh module graph: the worker's startup preload never reaches it. Vitest's
 * per-file isolation reproduces that. loadEssentialDomains() used to build
 * from a registry that nothing had filled in that context, so every call
 * started with 0 domain tools (only the 3 team-intro tools reached the model).
 */
import { describe, expect, it } from 'vitest';
import { loadEssentialDomains } from '../index.js';

describe('loadEssentialDomains in a fresh job context', () => {
  it('loads the essential domains itself instead of assuming a preloaded registry', async () => {
    const tools = await loadEssentialDomains('test-user', undefined);
    const names = Object.keys(tools);

    // memory, handoff, music, and safety must reach the model on the first turn
    expect(names).toContain('recallFromMemory');
    expect(names).toContain('rememberAboutUser');
    expect(names).toContain('handoffToMaya');
    expect(names).toContain('playMusic');
    expect(names).toContain('provideCrisisResources');
    expect(names).toContain('createSafetyPlan');
    expect(names).toContain('groundingExercise');
    expect(names.length).toBeGreaterThan(50);
  }, 60_000);

  it('is cheap the second time (loads once per context)', async () => {
    const start = Date.now();
    const tools = await loadEssentialDomains('test-user', undefined);
    expect(Object.keys(tools).length).toBeGreaterThan(50);
    expect(Date.now() - start).toBeLessThan(500);
  });
});
