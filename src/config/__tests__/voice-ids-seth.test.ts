/**
 * Seth speaks in his own cloned voice, read from one setting and never written
 * in code. Unset means he has no voice, never Ferni's. The voice id here is
 * invented.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configuredLegendVoiceIds } from '../../personas/roster/index.js';
import { getVoiceIdForPersona } from '../voice-ids.js';

describe("Seth's voice", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is empty, never Ferni, while the setting is unset or blank', () => {
    for (const value of ['', '   ']) {
      vi.stubEnv('ROSTER_VOICE_SETH', value);
      expect(getVoiceIdForPersona('seth')).toBe('');
      expect(getVoiceIdForPersona('seth')).not.toBe(getVoiceIdForPersona('ferni'));
    }
  });

  it('is the setting, trimmed, once it holds one', () => {
    vi.stubEnv('ROSTER_VOICE_SETH', ' fake-seth-id ');
    expect(getVoiceIdForPersona('seth')).toBe('fake-seth-id');
    expect(getVoiceIdForPersona('SETH')).toBe('fake-seth-id');
  });

  it("reads the same setting as Seth's consent record", () => {
    // voice-ids.ts can't import the roster (the roster imports it), so the two
    // name the setting separately; this keeps them in step.
    vi.stubEnv('LEGEND_VOICE_JOHN_BOGLE', '');
    vi.stubEnv('ROSTER_VOICE_SETH', 'fake-seth-id');
    expect(getVoiceIdForPersona('seth')).toBe('fake-seth-id');
    expect(configuredLegendVoiceIds()).toEqual(['fake-seth-id']);
  });
});
