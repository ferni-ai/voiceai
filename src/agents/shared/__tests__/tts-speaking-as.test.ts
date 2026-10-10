/**
 * A roundtable line is spoken in its persona's voice: the TTS takes the persona from
 * userData.speakingAs when a line sets it, and from personaId (who is on the call)
 * otherwise. One session serves every persona, so the voice can't come from the session.
 */
import { describe, expect, it } from 'vitest';
import type { voice } from '@livekit/agents';
import { extractTtsSessionContext } from '../tts-wrapper.js';

const agentWith = (userData: Record<string, unknown>) =>
  ({
    session: { userData: { services: { sessionId: 's1' }, ...userData } },
  }) as unknown as voice.Agent;

describe('the voice a line is spoken in', () => {
  it("is the speaking-as persona's during a roundtable line", () => {
    const context = extractTtsSessionContext(
      agentWith({ personaId: 'ferni', speakingAs: 'maya-habits' }),
      'ferni'
    );
    expect(context.personaId).toBe('maya-habits');
  });

  it('is the persona on the call otherwise, and the default with neither', () => {
    expect(
      extractTtsSessionContext(agentWith({ personaId: 'peter-john' }), 'ferni').personaId
    ).toBe('peter-john');
    expect(extractTtsSessionContext(agentWith({}), 'ferni').personaId).toBe('ferni');
  });
});
