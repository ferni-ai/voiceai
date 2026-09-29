import { describe, expect, it } from 'vitest';
import { interruptionOverrides } from '../interruption-config.js';

describe('interruption config', () => {
  it('uses the adaptive model with no word gate by default', () => {
    expect(interruptionOverrides({})).toEqual({ mode: 'adaptive', minWords: 0 });
  });
  it('INTERRUPTION_MODE=vad keeps the previous VAD barge-in', () => {
    expect(interruptionOverrides({ INTERRUPTION_MODE: 'vad' })).toEqual({ mode: 'vad' });
  });
});
