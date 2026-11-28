/**
 * PREEMPTIVE_TTS=on asks the SDK to synthesize preemptive replies early; off
 * leaves the session options exactly as before.
 */
import { log as sdkLog, voice } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { endpointingDelays } from '../../shared/turn-patience.js';
import { interruptionOverrides } from '../interruption-config.js';
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
    expect(Object.keys(off.turnHandling as object)).toEqual([
      'interruption',
      'endpointing',
      'preemptiveGeneration',
    ]);
    const sdk = sdkTurnHandling(off).turnHandling.preemptiveGeneration;
    expect(sdk.enabled).toBe(true); // LLM-only preemption, as before
    expect(sdk.preemptiveTts).toBe(false);
  });

  it('takes the endpointing delays from turnHandling, not the SDK defaults', async () => {
    const { minEndpointingDelay, maxEndpointingDelay } = endpointingDelays();
    const { endpointing } = sdkTurnHandling(await build()).turnHandling;
    expect(endpoint(endpointing)).toEqual([minEndpointingDelay, maxEndpointingDelay]);
    const { turnHandling: _th, ...without } = await build();
    const bare = sdkTurnHandling(without).turnHandling.endpointing;
    expect(endpoint(bare)).not.toEqual([minEndpointingDelay, maxEndpointingDelay]);
  });
});

const endpoint = (e: { minDelay: number; maxDelay: number }): number[] => [e.minDelay, e.maxDelay];

/** The options as they were: `voiceOptions` carrying the delays, interruption values and the flag. */
function legacyShape(opts: Record<string, unknown>): Record<string, unknown> {
  const { turnHandling: _current, ...rest } = opts;
  return {
    ...rest,
    turnHandling: {
      interruption: interruptionOverrides(process.env, {}),
      ...preemptiveGenerationOverrides(),
    },
    voiceOptions: {
      allowInterruptions: true,
      ...endpointingDelays(),
      minInterruptionWords: 1,
      minInterruptionDuration: 150,
      preemptiveGeneration: true,
    },
  };
}

describe('turnHandling replaces the deprecated voiceOptions (SDK 1.9.3)', () => {
  beforeEach(() => {
    process.env.DISABLE_VAD = 'true';
    sessions.length = 0;
  });
  afterEach(() => {
    for (const name of ['PREEMPTIVE_TTS', 'INTERRUPTION_MODE', 'BARGE_IN_GUARD', 'NEVER_SILENT'])
      delete process.env[name];
  });

  const envs: Array<[string, Record<string, string>]> = [
    ['defaults', {}],
    ['PREEMPTIVE_TTS=on', { PREEMPTIVE_TTS: 'on' }],
    ['INTERRUPTION_MODE=vad', { INTERRUPTION_MODE: 'vad' }],
    ['BARGE_IN_GUARD=on', { BARGE_IN_GUARD: 'on', NEVER_SILENT: 'on' }],
  ];

  it.each(envs)('%s: the SDK resolves the same turn handling as before', async (_name, env) => {
    Object.assign(process.env, env);
    const opts = await build();

    expect(sdkTurnHandling(opts).turnHandling).toEqual(
      sdkTurnHandling(legacyShape(opts)).turnHandling
    );
  });

  it('sets neither voiceOptions nor a top-level preemptiveGeneration', async () => {
    const opts = await build();

    expect(opts).not.toHaveProperty('voiceOptions');
    expect(opts).not.toHaveProperty('preemptiveGeneration');
  });

  it('the SDK logs no deprecation warning for the new shape, and does for the old one', async () => {
    const warn = vi.spyOn(sdkLog(), 'warn');
    const opts = await build();

    sdkTurnHandling(opts);
    expect(warn).not.toHaveBeenCalled();

    sdkTurnHandling(legacyShape(opts));
    expect(warn.mock.calls.map((c) => String(c[0]))).toEqual([
      expect.stringContaining('voiceOptions is deprecated'),
      expect.stringContaining('preemptiveGeneration as a top-level option is deprecated'),
    ]);
  });
});
