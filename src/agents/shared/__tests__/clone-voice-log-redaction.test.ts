/**
 * End to end: with Seth's consented clone configured and his teammate on, setting up his
 * TTS (multi-agent/persona-tts.ts) and switching the call to him (handoff/coordinator-adapter.ts)
 * write lines that carry his voice id, through the real resolver and the real logger. None of
 * them may contain it: the logger redacts it once the roster is loaded, as every deployed
 * entry does at boot.
 *
 * The voice registry is mocked to hand out the clone for `seth` (the wiring PR #4084 adds),
 * so the id really flows: the TTS is built with it, and the session TTS switches to it.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.unmock('../../../utils/safe-logger.js');

const SETH_CLONE = 'fake-seth-id';

vi.mock('../../../personas/voice-registry.js', () => ({
  getVoiceId: (personaId: string) =>
    personaId === 'seth' ? process.env.ROSTER_VOICE_SETH : 'fake-maya-id',
  getPersonaDisplayName: (personaId: string) => (personaId === 'seth' ? 'Seth' : 'Maya'),
}));
vi.mock('../conversational-audio-cache.js', () => ({
  warmPersonaReactions: vi.fn(),
  getCachedAudioForPersona: vi.fn(),
}));
const createPersonaAwareTTS = vi.fn((_name: string, opts: { voiceId: string }) => ({
  getVoiceId: () => opts.voiceId,
}));
vi.mock('../../../speech/voice-manager.js', () => ({ createPersonaAwareTTS }));
const callbacks = vi.hoisted(() => ({
  onVoiceSwitch: undefined as undefined | ((voiceId: string, personaId: string) => Promise<void>),
}));
vi.mock('../../../tools/handoff/handoff-coordinator.js', () => ({
  createHandoffCoordinator: (config: typeof callbacks) => {
    callbacks.onVoiceSwitch = config.onVoiceSwitch;
    return {};
  },
}));
vi.mock('../handoff/cached-modules.js', () => ({
  getVoiceManagerCached: async () => ({ switchVoice: vi.fn() }),
  getPersonaAsyncCached: vi.fn(),
}));

const env = { ROSTER_VOICE_SETH: SETH_CLONE, SETH_TEAMMATE: 'on', LOG_LEVEL: 'debug' };
const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));

beforeAll(() => Object.assign(process.env, env));
afterAll(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

function captureStderr(): { text: () => string; restore: () => void } {
  const chunks: string[] = [];
  const spy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
    chunks.push(String(chunk));
    return true;
  });
  return { text: () => chunks.join(''), restore: () => spy.mockRestore() };
}

describe("a consented clone's voice id never reaches the log", () => {
  it('setting up the TTS for seth logs lines, none with his voice id', async () => {
    await import('../../../personas/roster/index.js'); // what every entry does at boot
    const { createPersonaTTS } = await import('../../multi-agent/persona-tts.js');
    const out = captureStderr();
    try {
      await createPersonaTTS('seth');
    } finally {
      out.restore();
    }
    expect(createPersonaAwareTTS).toHaveBeenCalledWith(
      'Seth',
      expect.objectContaining({ voiceId: SETH_CLONE })
    );
    expect(out.text()).toContain('Creating TTS with Cartesia voice');
    expect(out.text()).toContain('[consented-clone]');
    expect(out.text()).not.toContain(SETH_CLONE);
  });

  it('switching the call to seth logs lines, none with his voice id', async () => {
    await import('../../../personas/roster/index.js');
    const { CoordinatorAdapter } = await import('../handoff/coordinator-adapter.js');
    const tts = { switchVoice: vi.fn() };
    new CoordinatorAdapter({
      ctx: {},
      session: {},
      services: { sessionId: 'clone-log-test' },
      room: {},
      getVoiceAgentRef: () => null,
      initialAgent: 'ferni',
      tts,
    } as unknown as ConstructorParameters<typeof CoordinatorAdapter>[0]);
    const out = captureStderr();
    try {
      await callbacks.onVoiceSwitch?.(SETH_CLONE, 'seth');
    } finally {
      out.restore();
    }
    expect(tts.switchVoice).toHaveBeenCalledWith('Seth', SETH_CLONE);
    expect(out.text()).toContain('Voice switched');
    expect(out.text()).toContain('[consented-clone]');
    expect(out.text()).not.toContain(SETH_CLONE);
  });
});
