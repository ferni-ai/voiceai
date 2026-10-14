import { describe, expect, it } from 'vitest';
import { interruptionOverrides } from '../interruption-config.js';

describe('interruption config', () => {
  it('uses the adaptive model with no word gate by default', () => {
    expect(interruptionOverrides({})).toEqual({ mode: 'adaptive', minWords: 0 });
  });
  it('INTERRUPTION_MODE=vad keeps the previous VAD barge-in', () => {
    expect(interruptionOverrides({ INTERRUPTION_MODE: 'vad' })).toEqual({ mode: 'vad' });
  });
  it('leaves LiveKit timing alone unless BARGE_IN_GUARD=on', () => {
    for (const v of [undefined, '', 'off', 'true']) {
      const o = interruptionOverrides({ BARGE_IN_GUARD: v });
      expect(o.minDuration).toBeUndefined();
      expect(o.falseInterruptionTimeout).toBeUndefined();
    }
  });
  it('BARGE_IN_GUARD=on needs half a second of speech and resumes a false pause after 1 s', () => {
    expect(interruptionOverrides({ BARGE_IN_GUARD: 'on' })).toEqual({
      mode: 'adaptive',
      minWords: 0,
      minDuration: 500,
      falseInterruptionTimeout: 1000,
    });
    expect(interruptionOverrides({ BARGE_IN_GUARD: 'on', INTERRUPTION_MODE: 'vad' })).toEqual({
      mode: 'vad',
      minDuration: 500,
      falseInterruptionTimeout: 1000,
    });
  });

  it('resumes a reply paused for noise after 1 s with NEVER_SILENT=on (resume-buffer.ts)', () => {
    expect(interruptionOverrides({ NEVER_SILENT: 'on' })).toEqual({
      mode: 'adaptive',
      minWords: 0,
      falseInterruptionTimeout: 1000,
    });
    expect(interruptionOverrides({ NEVER_SILENT: 'shadow' })).not.toHaveProperty(
      'falseInterruptionTimeout'
    );
  });
});
