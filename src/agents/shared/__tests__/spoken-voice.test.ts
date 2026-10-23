/**
 * A custom agent speaks in its owner's chosen voice, and an accent-localized session in
 * its localized voice, instead of the gateway falling back to Ferni's (SESSION_OWN_VOICE).
 */
import { describe, expect, it } from 'vitest';
import type { voice } from '@livekit/agents';
import { getVoiceIdForPersona } from '../../../config/voice-ids.js';
import { asSessionVoice, spokenVoiceId } from '../spoken-voice.js';
import { extractTtsSessionContext } from '../tts-wrapper.js';

const ON = { SESSION_OWN_VOICE: 'on' } as NodeJS.ProcessEnv;
const OFF = {} as NodeJS.ProcessEnv;
const PICKED = '11111111-2222-4333-8444-555555555555';
const LOCALIZED = '66666666-7777-4888-9999-000000000000';
const custom = { personaId: 'custom_abc', voiceId: PICKED, localized: false };

describe('the voice a reply is spoken in', () => {
  it("is Ferni's for a custom agent with the flag off, exactly as before", () => {
    expect(spokenVoiceId('custom_abc', custom, OFF)).toBe(getVoiceIdForPersona('custom_abc'));
    expect(spokenVoiceId('custom_abc', custom, OFF)).toBe(getVoiceIdForPersona('ferni'));
  });

  it("is the custom agent's own voice with the flag on", () => {
    expect(spokenVoiceId('custom_abc', custom, ON)).toBe(PICKED);
    expect(
      spokenVoiceId('ca_9', { personaId: 'ca_9', voiceId: PICKED, localized: false }, ON)
    ).toBe(PICKED);
  });

  it("is a built-in persona's localized voice with the flag on", () => {
    const localized = { personaId: 'maya-santos', voiceId: LOCALIZED, localized: true };
    expect(spokenVoiceId('maya-santos', localized, ON)).toBe(LOCALIZED);
    expect(spokenVoiceId('maya-santos', localized, OFF)).toBe(getVoiceIdForPersona('maya-santos'));
  });

  it("stays the built-in voice for a built-in persona that isn't localized", () => {
    const drifted = { personaId: 'jordan-taylor', voiceId: PICKED, localized: false };
    expect(spokenVoiceId('jordan-taylor', drifted, ON)).toBe(getVoiceIdForPersona('jordan-taylor'));
  });

  it("is the teammate's own voice after a custom agent hands off", () => {
    expect(spokenVoiceId('maya-santos', custom, ON)).toBe(getVoiceIdForPersona('maya-santos'));
    expect(spokenVoiceId('maya-santos', custom, ON)).not.toBe(PICKED);
  });

  it('falls back to the persona lookup with no session voice', () => {
    expect(spokenVoiceId('custom_abc', undefined, ON)).toBe(getVoiceIdForPersona('custom_abc'));
  });
});

describe('the session voice the TTS reads', () => {
  const agentWith = (userData: Record<string, unknown>) =>
    ({
      session: { userData: { services: { sessionId: 's1' }, ...userData } },
    }) as unknown as voice.Agent;

  it('comes from userData.sessionVoice', () => {
    const context = extractTtsSessionContext(
      agentWith({ personaId: 'custom_abc', sessionVoice: custom }),
      'ferni'
    );
    expect(context.sessionVoice).toEqual(custom);
  });

  it('is ignored when malformed', () => {
    expect(asSessionVoice({ personaId: 'custom_abc' })).toBeUndefined();
    expect(asSessionVoice({ personaId: 'custom_abc', voiceId: '' })).toBeUndefined();
    expect(asSessionVoice('x')).toBeUndefined();
    expect(asSessionVoice({ personaId: 'p', voiceId: 'v', localized: 'yes' })).toEqual({
      personaId: 'p',
      voiceId: 'v',
      localized: false,
    });
  });
});
