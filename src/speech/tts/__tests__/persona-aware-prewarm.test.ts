import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { voice } from '@livekit/agents';

const gateway = vi.hoisted(() => ({ prewarm: vi.fn() }));
vi.mock('../../tts-gateway/providers/index.js', () => ({ getTTSProvider: () => gateway }));

// The Cartesia plugin reads the key when the module loads, so set it first.
let PersonaAwareTTS: typeof import('../persona-aware.js').PersonaAwareTTS;
beforeAll(async () => {
  process.env.CARTESIA_API_KEY = process.env.CARTESIA_API_KEY || 'test-key';
  ({ PersonaAwareTTS } = await import('../persona-aware.js'));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  gateway.prewarm.mockReset();
});

interface InnerTTS {
  prewarm: () => void;
  releaseIdleConnections: () => Promise<void>;
}

function make() {
  const outer = new PersonaAwareTTS('Ferni', { voiceId: 'voice-a' } as never);
  const inner = () => (outer as unknown as { personaTTS: InnerTTS }).personaTTS;
  return { outer, inner };
}

/** Load an SDK module the package does not export, as the same instance the SDK uses. */
async function sdkModule<T>(...path: string[]): Promise<T> {
  const require = createRequire(import.meta.url);
  const dist = dirname(require.resolve('@livekit/agents'));
  return (await import(pathToFileURL(join(dist, ...path)).href)) as T;
}

describe('PersonaAwareTTS.prewarm', () => {
  it('with the gateway on (default), opens the gateway socket and not the unused plugin TTS', () => {
    vi.stubEnv('USE_TTS_GATEWAY', '');
    const { outer, inner } = make();
    const innerPrewarm = vi.spyOn(inner(), 'prewarm');

    outer.prewarm();
    expect(gateway.prewarm).toHaveBeenCalledTimes(1);
    expect(innerPrewarm).not.toHaveBeenCalled();
  });

  it('with the gateway off, warms the inner Cartesia plugin TTS', () => {
    vi.stubEnv('USE_TTS_GATEWAY', 'false');
    const { outer, inner } = make();
    const innerPrewarm = vi.spyOn(inner(), 'prewarm').mockImplementation(() => undefined);

    outer.prewarm();
    expect(innerPrewarm).toHaveBeenCalledTimes(1);
    expect(gateway.prewarm).not.toHaveBeenCalled();
  });

  it('after a voice switch, warms the new inner TTS', () => {
    vi.stubEnv('USE_TTS_GATEWAY', 'false');
    const { outer, inner } = make();
    const first = inner();
    outer.switchVoice('Peter', 'voice-b');
    expect(inner()).not.toBe(first);
    const innerPrewarm = vi.spyOn(inner(), 'prewarm').mockImplementation(() => undefined);

    outer.prewarm();
    expect(innerPrewarm).toHaveBeenCalledTimes(1);
  });

  it('never throws when the provider prewarm throws', () => {
    vi.stubEnv('USE_TTS_GATEWAY', '');
    gateway.prewarm.mockImplementation(() => {
      throw new Error('boom');
    });
    const { outer } = make();
    expect(() => outer.prewarm()).not.toThrow();
    expect(() => outer.prewarm()).not.toThrow();
    expect(gateway.prewarm).toHaveBeenCalledTimes(2);
  });
});

describe('PersonaAwareTTS.releaseIdleConnections', () => {
  it('releases the inner plugin TTS pool', async () => {
    const { outer, inner } = make();
    const release = vi.spyOn(inner(), 'releaseIdleConnections').mockResolvedValue();
    await outer.releaseIdleConnections();
    expect(release).toHaveBeenCalledTimes(1);
    expect(gateway.prewarm).not.toHaveBeenCalled();
  });
});

describe('the SDK reaches PersonaAwareTTS', () => {
  it('AgentActivity start (_prewarmModels) prewarms the gateway through the session TTS', async () => {
    vi.stubEnv('USE_TTS_GATEWAY', '');
    const { AgentActivity } = await sdkModule<{
      AgentActivity: new (
        agent: voice.Agent,
        session: voice.AgentSession
      ) => { _prewarmModels: () => void };
    }>('voice', 'agent_activity.js');
    const { outer } = make();
    const session = new voice.AgentSession({});
    const agent = new voice.Agent({ instructions: 'test', tts: outer });
    const activity = new AgentActivity(agent, session);

    expect(gateway.prewarm).not.toHaveBeenCalled();
    activity._prewarmModels();
    expect(gateway.prewarm).toHaveBeenCalledTimes(1);
    await session.close().catch(() => undefined);
  });

  it("the SDK's last-user release reaches the inner plugin TTS", async () => {
    const { retainTts, releaseTts } = await sdkModule<{
      retainTts: (t: unknown) => void;
      releaseTts: (t: unknown) => Promise<void>;
    }>('voice', 'model_refs.js');
    const { outer, inner } = make();
    const release = vi.spyOn(inner(), 'releaseIdleConnections').mockResolvedValue();

    retainTts(outer);
    retainTts(outer);
    await releaseTts(outer);
    expect(release).not.toHaveBeenCalled();
    await releaseTts(outer);
    expect(release).toHaveBeenCalledTimes(1);
  });
});
