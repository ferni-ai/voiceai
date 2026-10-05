/**
 * Gemini Live (legacy pipeline) requires an explicitly-set LLM_REALTIME_MODEL
 * because Google retired gemini-2.0-flash. Selecting VOICE_PIPELINE=gemini-live
 * without explicit LLM_REALTIME_MODEL must fail fast at startup.
 */
import { describe, expect, it, vi } from 'vitest';

describe('Realtime model configuration', () => {
  it('throws when VOICE_PIPELINE=gemini-live without LLM_REALTIME_MODEL', async () => {
    vi.stubEnv('VOICE_PIPELINE', 'gemini-live');
    vi.stubEnv('LLM_REALTIME_MODEL', '');
    vi.resetModules();

    // Attempting to load the config should throw
    await expect(async () => {
      await import('../gemini-config.js');
    }).rejects.toThrow(/Gemini Live voice pipeline is legacy/);
  });

  it('succeeds when VOICE_PIPELINE=gemini-live with explicit LLM_REALTIME_MODEL', async () => {
    vi.stubEnv('VOICE_PIPELINE', 'gemini-live');
    vi.stubEnv('LLM_REALTIME_MODEL', 'test-live-model');
    vi.resetModules();

    const config = await import('../gemini-config.js');
    expect(config.REALTIME_MODEL).toBe('test-live-model');
  });

  it('succeeds with default pipeline (cartesia-cascade) without LLM_REALTIME_MODEL', async () => {
    vi.stubEnv('VOICE_PIPELINE', '');
    vi.stubEnv('LLM_REALTIME_MODEL', '');
    vi.resetModules();

    // Should not throw; default pipeline doesn't require REALTIME_MODEL
    const config = await import('../gemini-config.js');
    expect(config.REALTIME_MODEL).toBeDefined();
  });

  it('error message mentions the env var name', async () => {
    vi.stubEnv('VOICE_PIPELINE', 'gemini-live');
    vi.stubEnv('LLM_REALTIME_MODEL', '');
    vi.resetModules();

    try {
      await import('../gemini-config.js');
      throw new Error('Expected config load to fail');
    } catch (e) {
      const message = (e as Error).message;
      expect(message).toContain('LLM_REALTIME_MODEL');
      expect(message).toContain('VOICE_PIPELINE');
    }
  });
});
