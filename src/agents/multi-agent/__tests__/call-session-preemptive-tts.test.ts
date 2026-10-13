/**
 * PREEMPTIVE_TTS=on asks the SDK to synthesize preemptive replies early; off
 * leaves the session options exactly as before.
 */
import { voice } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { preemptiveGenerationOverrides } from '../preemptive-tts.js';

const sessions: Array<{ opts: Record<string, unknown> }> = [];

vi.mock('../../model-provider/index.js', () => ({
  createProviderSTT: () => undefined,
  buildCascadeKeyterms: () => ['Ferni'],
  getModelProvider: () => ({ getSessionTurnDetection: () => 'stt', speaksNatively: () => false }),
}));
vi.mock('@livekit/agents', async (importOriginal) => {
  const real = await importOriginal<typeof import('@livekit/agents')>();
  return {
    ...real,
    voice: {
      ...real.voice,
      AgentSession: class {
        constructor(readonly opts: Record<string, unknown>) {
          sessions.push(this);
        }
      },
    },
  };
});
vi.mock('../../shared/session-listener-limit.js', () => ({ limitSessionListeners: () => {} }));
vi.mock('../live-call-behaviors.js', () => ({ logBargeInDecisions: () => {} }));

const { createCallSession } = await import('../call-session.js');
const RealAgentSession = (
  await vi.importActual<typeof import('@livekit/agents')>('@livekit/agents')
).voice.AgentSession;

/** A stand-in the call session only passes through. */
function stub<T>(value: unknown): T {
  return value as T;
}

async function build(): Promise<Record<string, unknown>> {
  await createCallSession({
    persona: stub({ id: 'ferni' }),
    sessionId: 's1',
    services: stub({}),
    userData: stub({}),
    llmModel: {},
    tts: stub({}),
  });
  return sessions.at(-1)?.opts ?? {};
}

/** What the real SDK makes of the options (migrateLegacyOptions + defaults). */
function sdkTurnHandling(opts: Record<string, unknown>): voice.AgentSession['sessionOptions'] {
  const { llm: _llm, tts: _tts, ...rest } = opts;
  return new RealAgentSession(rest as ConstructorParameters<typeof RealAgentSession>[0])
    .sessionOptions;
}

describe('PREEMPTIVE_TTS', () => {
  beforeEach(() => {
    process.env.DISABLE_VAD = 'true';
    sessions.length = 0;
  });
  afterEach(() => {
    delete process.env.PREEMPTIVE_TTS;
  });

  it('is off by default: no preemptiveGeneration in turnHandling', () => {
    expect(preemptiveGenerationOverrides({})).toEqual({});
    expect(preemptiveGenerationOverrides({ PREEMPTIVE_TTS: 'off' })).toEqual({});
  });

  it('asks for preemptive TTS when on', async () => {
    process.env.PREEMPTIVE_TTS = 'on';
    const opts = await build();
    const th = opts.turnHandling as Record<string, unknown>;
    expect(th.preemptiveGeneration).toEqual({ enabled: true, preemptiveTts: true });
    expect(th.interruption).toBeDefined();
    const sdk = sdkTurnHandling(opts).turnHandling.preemptiveGeneration;
    expect(sdk.enabled).toBe(true);
    expect(sdk.preemptiveTts).toBe(true);
  });

  it('leaves the session options unchanged when off', async () => {
    const off = await build();
    expect(Object.keys(off.turnHandling as object)).toEqual(['interruption']);
    const sdk = sdkTurnHandling(off).turnHandling.preemptiveGeneration;
    expect(sdk.enabled).toBe(true); // LLM-only preemption, as before
    expect(sdk.preemptiveTts).toBe(false);
    process.env.PREEMPTIVE_TTS = 'on';
    const on = await build();
    expect(on.voiceOptions).toEqual(off.voiceOptions);
  });

  // Why voiceOptions stays: turnHandling has no endpointing, so the SDK takes
  // the turn-patience delays from voiceOptions. Dropping it would fall back to
  // the SDK's own delays.
  it('still takes the endpointing delays from voiceOptions', async () => {
    const opts = await build();
    const vo = opts.voiceOptions as { minEndpointingDelay: number; maxEndpointingDelay: number };
    const withVo = sdkTurnHandling(opts).turnHandling.endpointing;
    expect(withVo.minDelay).toBe(vo.minEndpointingDelay);
    expect(withVo.maxDelay).toBe(vo.maxEndpointingDelay);
    const { voiceOptions: _vo, ...without } = opts;
    const withoutVo = sdkTurnHandling(without).turnHandling.endpointing;
    expect([withoutVo.minDelay, withoutVo.maxDelay]).not.toEqual([
      withVo.minDelay,
      withVo.maxDelay,
    ]);
  });
});
