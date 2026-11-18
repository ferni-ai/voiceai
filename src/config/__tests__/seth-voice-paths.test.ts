/**
 * Every way a call picks Seth's voice goes through his gate (getVoiceIdForPersona in
 * config/voice-ids.ts): the reply TTS (spokenVoiceId), a handoff's voice switch and a
 * multi-agent call's TTS (resolveVoiceId), and the voice a single-agent call starts in
 * (resolveSessionVoice). The voice registry, which also serves client-named personas
 * (POST /api/landing/tts), never hands out a consented clone, and never gives Seth
 * Ferni's voice. The voice ids here are invented.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveSessionVoice } from '../../agents/voice-agent-entry/session-voice.js';
import { spokenVoiceId } from '../../agents/shared/spoken-voice.js';
import { resolveVoiceId } from '../../tools/handoff/voice-id-resolver.js';
import type { PersonaConfig } from '../../personas/types.js';

function gate(open: boolean): void {
  vi.stubEnv('SETH_TEAMMATE', open ? 'on' : 'off');
  vi.stubEnv('ROSTER_VOICE_SETH', open ? 'fake-seth-id' : '');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("Seth's voice on a call", () => {
  it('replies in his clone only with the gate open', () => {
    gate(true);
    expect(spokenVoiceId('seth', undefined)).toBe('fake-seth-id');
    gate(false);
    expect(spokenVoiceId('seth', undefined)).toBe('');
  });

  it('switches to his clone on a handoff only with the gate open', () => {
    gate(true);
    expect(resolveVoiceId({ personaId: 'seth' })).toEqual({
      success: true,
      voiceId: 'fake-seth-id',
      source: 'registry',
    });
    // The handoff executor puts the registry's voice on the event: for Seth, none.
    expect(resolveVoiceId({ voiceId: '', personaId: 'seth' })).toMatchObject({
      voiceId: 'fake-seth-id',
    });
    gate(false);
    expect(resolveVoiceId({ personaId: 'seth' }).success).toBe(false);
  });

  it('starts a call in his clone, though his bundle names no voice', async () => {
    const seth = { id: 'seth', name: 'Seth', voice: { voiceId: '' } } as unknown as PersonaConfig;
    gate(true);
    expect((await resolveSessionVoice(seth, null)).effectiveVoiceId).toBe('fake-seth-id');
    gate(false);
    expect((await resolveSessionVoice(seth, null)).effectiveVoiceId).toBe('');
    const maya = {
      id: 'maya-santos',
      voice: { voiceId: 'fake-maya-id' },
    } as unknown as PersonaConfig;
    expect((await resolveSessionVoice(maya, null)).effectiveVoiceId).toBe('fake-maya-id');
  });
});

describe('the voice registry', () => {
  it("never serves Seth's clone, and never gives him Ferni's voice", async () => {
    for (const open of [true, false]) {
      gate(open);
      vi.resetModules();
      const { getVoiceId } = await import('../../personas/voice-registry.js');
      expect(getVoiceId('seth'), `gate ${open ? 'open' : 'closed'}`).toBe('');
      expect(getVoiceId('maya-santos')).not.toBe('');
    }
  });

  it('never serves a consented clone set as a persona voice', async () => {
    vi.stubEnv('LEGEND_VOICE_JOHN_BOGLE', 'fake-legend-id');
    vi.stubEnv('JOHN_BOGLE_VOICE_ID', 'fake-legend-id');
    vi.resetModules();
    const { getVoiceId } = await import('../../personas/voice-registry.js');
    expect(getVoiceId('john-bogle')).toBe('');
    expect(getVoiceId('henry')).toBe('');
  });
});
