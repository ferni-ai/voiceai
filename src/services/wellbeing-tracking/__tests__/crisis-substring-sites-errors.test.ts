/**
 * Shadow runs in prod, so the new reading must never change the outcome there:
 * if it throws, shadow logs and returns the off reading. on falls back to off
 * too, so it never reads less than off. Forced here by making the STT helpers
 * throw.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const shadow = vi.hoisted(() => vi.fn());
vi.mock('../../../utils/safe-logger.js', async (actual) => {
  const real = await actual<typeof import('../../../utils/safe-logger.js')>();
  return {
    ...real,
    createLogger: (b: Record<string, unknown>) =>
      b.module === 'SafetyPhraseShadow'
        ? { info: shadow, warn: shadow, debug: shadow, error: shadow }
        : real.createLogger(b),
  };
});
vi.mock('../../../utils/phrase-match.js', async (actual) => {
  const real = await actual<typeof import('../../../utils/phrase-match.js')>();
  const boom = (): string => {
    throw new Error('stt helper failed');
  };
  return { ...real, sttSpelling: boom, normalized: boom };
});

import { patternHit, phraseHit, saysPhrase } from '../../../utils/safety-whole-word.js';

afterEach(() => {
  vi.unstubAllEnvs();
  shadow.mockClear();
});

describe('when the new reading throws', () => {
  it.each(['shadow', 'on'] as const)('%s: returns the off reading and logs', (mode) => {
    vi.stubEnv('SAFETY_WHOLE_WORD_SITES', mode);
    expect(phraseHit('I want to end it all', 'end it all')).toBe('hit');
    expect(phraseHit('nothing here', 'end it all')).toBeNull();
    expect(saysPhrase('I want to end it all', 'end it all')).toBe(true);
    expect(patternHit(/no point/i, 'no point anymore')).toBe('hit');
    expect(shadow).toHaveBeenCalledWith(
      expect.objectContaining({ flag: 'SAFETY_WHOLE_WORD_SITES', error: 'stt helper failed' }),
      expect.any(String)
    );
  });
});
