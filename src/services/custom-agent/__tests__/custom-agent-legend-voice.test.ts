/**
 * A custom agent may never speak in a legend's consented clone: only the legend
 * its record names may (personas/roster). A configured legend voice is refused
 * with LEGENDS_AS_THEMSELVES on or off. The voice id here is invented.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configuredLegendVoiceIds } from '../../../personas/roster/index.js';
import { isForbiddenCustomAgentVoiceId } from '../custom-agent-voice-policy.js';

const INVENTED_VOICE = '0b0b0b0b-1111-4222-8333-444444444444';

describe('a custom agent and a legend voice', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('may use the voice while no legend setting names it', () => {
    vi.stubEnv('LEGEND_VOICE_JOHN_BOGLE', '');
    expect(configuredLegendVoiceIds()).toEqual([]);
    expect(isForbiddenCustomAgentVoiceId(INVENTED_VOICE)).toBe(false);
  });

  it.each(['off', 'on'])('may never use a configured legend voice (flag %s)', (flag) => {
    vi.stubEnv('LEGENDS_AS_THEMSELVES', flag);
    vi.stubEnv('LEGEND_VOICE_JOHN_BOGLE', INVENTED_VOICE);
    expect(configuredLegendVoiceIds()).toEqual([INVENTED_VOICE]);
    expect(isForbiddenCustomAgentVoiceId(INVENTED_VOICE)).toBe(true);
    expect(isForbiddenCustomAgentVoiceId(` ${INVENTED_VOICE.toUpperCase()} `)).toBe(true);
  });
});
