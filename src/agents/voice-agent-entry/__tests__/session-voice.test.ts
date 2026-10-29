/**
 * The voice a single-agent session starts in (session-voice.ts): a live custom
 * agent keeps its own voice for a caller with a non-American accent, where
 * localization would have handed it a localized copy of Ferni's.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersonaConfig } from '../../../personas/types.js';
import { customAgentToPersonaConfig } from '../../../services/custom-agent/custom-agent-runtime-service.js';
import { liveCallPersona } from '../../../services/custom-agent/custom-agent-live-persona.js';
import {
  liveAgent,
  STOCK_VOICE_ID,
} from '../../../services/custom-agent/__tests__/fixtures/live-agent.js';
import { resolveLiveCustomAgent } from '../../shared/custom-agent-live.js';

const getLocalizedVoiceId = vi.hoisted(() =>
  vi.fn(async () => ({ voiceId: 'localized-voice', isLocalized: true, cached: true }))
);
vi.mock('../../../services/voice/cartesia-voice-localization.js', () => ({ getLocalizedVoiceId }));

const { resolveSessionVoice } = await import('../session-voice.js');

async function liveCustomAgent(): Promise<PersonaConfig> {
  const live = await resolveLiveCustomAgent(
    { id: liveAgent().id } as PersonaConfig,
    'uid-owner',
    { CUSTOM_AGENT_LIVE: 'on' },
    {
      personaForCaller: async (id) => id,
      loadCustomAgentAsPersona: async () => customAgentToPersonaConfig(liveAgent()),
      liveCallPersona: async (loaded) => liveCallPersona(loaded),
    }
  );
  if (live.kind !== 'loaded') throw new Error(`expected loaded, got ${live.kind}`);
  return live.persona;
}

beforeEach(() => getLocalizedVoiceId.mockClear());

describe('resolveSessionVoice', () => {
  it('keeps a live custom agent in its own voice for a British caller', async () => {
    const voice = await resolveSessionVoice(await liveCustomAgent(), 'british');
    expect(voice.effectiveVoiceId).toBe(STOCK_VOICE_ID);
    expect(voice.isLocalizedVoice).toBe(false);
    expect(getLocalizedVoiceId).not.toHaveBeenCalled();
  });

  it('still localizes a built-in persona (the path the skip guards)', async () => {
    const ferni = { id: 'ferni', voice: { voiceId: 'ferni-voice', provider: 'cartesia' } };
    const voice = await resolveSessionVoice(ferni as PersonaConfig, 'british');
    expect(voice.effectiveVoiceId).toBe('localized-voice');
    expect(voice.isLocalizedVoice).toBe(true);
  });

  it('flag off: an agent id that was never loaded is localized as before', async () => {
    const standIn = { id: liveAgent().id, voice: { voiceId: 'ferni-voice', provider: 'cartesia' } };
    const voice = await resolveSessionVoice(standIn as PersonaConfig, 'british');
    expect(voice.effectiveVoiceId).toBe('localized-voice');
  });

  it('an American caller is never localized', async () => {
    const voice = await resolveSessionVoice(await liveCustomAgent(), 'american');
    expect(voice.effectiveVoiceId).toBe(STOCK_VOICE_ID);
    expect(getLocalizedVoiceId).not.toHaveBeenCalled();
  });
});

describe('session-creator takes its voice from resolveSessionVoice', () => {
  it('and never localizes on its own', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const creator = readFileSync(join(here, '..', 'session-creator.ts'), 'utf8');
    expect(creator).toContain('await resolveSessionVoice(');
    expect(creator).not.toContain('getLocalizedVoiceId');
  });
});
