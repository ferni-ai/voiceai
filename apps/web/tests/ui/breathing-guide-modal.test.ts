import { describe, expect, it } from 'vitest';
import { mapBreathingPayloadToPattern } from '../../src/ui/breathing-guide-modal.ui.js';

describe('mapBreathingPayloadToPattern', () => {
  it('maps breatheWithMe techniques to guide patterns', () => {
    expect(mapBreathingPayloadToPattern({ technique: 'box' })).toBe('box');
    expect(mapBreathingPayloadToPattern({ technique: '4-7-8' })).toBe('sleep');
    expect(mapBreathingPayloadToPattern({ technique: 'simple' })).toBe('relaxing');
    expect(mapBreathingPayloadToPattern({ technique: 'coherent' })).toBe('focus');
  });

  it('falls back to purpose, then relaxing', () => {
    expect(mapBreathingPayloadToPattern({ purpose: 'energize' })).toBe('energizing');
    expect(mapBreathingPayloadToPattern({})).toBe('relaxing');
  });
});
