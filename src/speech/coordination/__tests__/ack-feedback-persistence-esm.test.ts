/**
 * recordAcknowledgmentFeedback persisted through a bare require(), which throws
 * under plain Node ESM (how the agent runs), so learned acknowledgment
 * preferences never reached the persistence layer. The write is now real but
 * waits behind REQUIRE_FIX_VOICE, because it ends in a Firestore save.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runPlainEsm } from '../../../tests/helpers/plain-esm.js';

describe('acknowledgment feedback persistence under plain ESM', () => {
  it('hands learned preferences to the persistence cache when REQUIRE_FIX_VOICE=true', () => {
    const result = runPlainEsm(
      `
const acks = await import('./src/speech/coordination/persona-acknowledgments.ts');
const store = await import('./src/speech/coordination/acknowledgment-persistence.ts');
acks.recordAcknowledgmentFeedback('esm-user', 'one sec', 'thinking', true);
// Cache hit, so no Firestore read; clearing the cache cancels the debounced save.
const cached = await store.getAcknowledgmentPreferences('esm-user');
store.clearUserPreferencesCache('esm-user');
report({ phrases: cached.preferredPhrases, sampleCount: cached.sampleCount });
`,
      { REQUIRE_FIX_VOICE: 'true' }
    );
    expect(result).toEqual({ phrases: ['one sec'], sampleCount: 1 });
  });
});

describe('acknowledgment feedback persistence flag', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock('../acknowledgment-persistence.js');
    vi.resetModules();
  });

  async function recordWithFlag(flag: string) {
    vi.stubEnv('REQUIRE_FIX_VOICE', flag);
    const update = vi.fn();
    vi.doMock('../acknowledgment-persistence.js', () => ({
      updateAcknowledgmentPreferences: update,
    }));
    vi.resetModules();
    const acks = await import('../persona-acknowledgments.js');
    acks.recordAcknowledgmentFeedback('flag-user', 'one sec', 'thinking', true);
    return update;
  }

  it('does not persist when the flag is off', async () => {
    expect(await recordWithFlag('')).not.toHaveBeenCalled();
  });

  it('persists when the flag is on', async () => {
    expect(await recordWithFlag('true')).toHaveBeenCalledWith(
      'flag-user',
      expect.objectContaining({ preferredPhrases: ['one sec'], sampleCount: 1 })
    );
  });
});
