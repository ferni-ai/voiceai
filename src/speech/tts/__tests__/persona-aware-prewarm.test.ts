import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { voice } from '@livekit/agents';

const gateway = vi.hoisted(() => ({ prewarm: vi.fn() }));
vi.mock('../../tts-gateway/providers/index.js', () => ({ getTTSProvider: () => gateway }));

// PersonaAwareTTS loads its logger lazily via getLogger(); hand it one we can read.
const logger = vi.hoisted(() => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getLogger: () => logger,
}));

/** The "TTS prewarm failed" lines PersonaAwareTTS has logged. */
const prewarmWarnings = (): unknown[][] =>
  logger.warn.mock.calls.filter((c) => c[1] === 'TTS prewarm failed');

// The Cartesia plugin reads the key when the module loads, so set it first.
let PersonaAwareTTS: typeof import('../persona-aware.js').PersonaAwareTTS;
beforeAll(async () => {
  process.env.CARTESIA_API_KEY = process.env.CARTESIA_API_KEY || 'test-key';
  ({ PersonaAwareTTS } = await import('../persona-aware.js'));
});

const gatewayPrewarmSpy = gateway.prewarm;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  gateway.prewarm = gatewayPrewarmSpy; // a test may swap in a plain function
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

  it('a rejecting gateway prewarm is caught: no unhandled rejection, one log line', async () => {
    vi.stubEnv('USE_TTS_GATEWAY', '');
    const { outer } = make();
    // The logger loads asynchronously at construction; wait until it is in use.
    await vi.waitFor(() => expect(logger.info).toHaveBeenCalled());
    logger.warn.mockClear();
    // A plain function, not vi.fn: a spy attaches its own handler to a returned
    // promise to record its result, which would hide an unhandled rejection.
    let calls = 0;
    (gateway as { prewarm: () => unknown }).prewarm = () => {
      calls++;
      return Promise.reject(new Error('socket refused'));
    };
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);
    try {
      outer.prewarm();
      outer.prewarm();
      await new Promise((r) => {
        setTimeout(r, 50);
      });
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
    expect(calls).toBe(2);
    expect(unhandled).toEqual([]);
    expect(prewarmWarnings()).toHaveLength(1);
    expect(prewarmWarnings()[0][0]).toMatchObject({ error: 'Error: socket refused' });
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
