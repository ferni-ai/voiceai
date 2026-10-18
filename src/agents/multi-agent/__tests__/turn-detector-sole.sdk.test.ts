/**
 * TURN_DETECTOR and TURN_DETECTOR_SOLE through the real call-session builder
 * (call-session.ts: Silero VAD, Cartesia STT, LiveKit's AgentSession) and the
 * real install paths for the holds (live-call-behaviors.ts, turn-observers.ts).
 * With the model on and SOLE on, the unfinished-turn hold and PAUSE_HOLD stand
 * down; with SOLE alone, without VAD, or with every flag off, nothing changes.
 */
import type { EventEmitter } from 'node:events';
import { inference } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitForPauseHold } from '../../../speech/output-control/pause-hold.js';
import { createCallSession } from '../call-session.js';
import { installLiveCallBehaviors } from '../live-call-behaviors.js';
import { installTurnListeners } from '../turn-observers.js';

const cleanups: Array<() => void> = [];
let calls = 0;

beforeEach(() => {
  // Keep the unrelated live-call behaviours out of the way.
  for (const flag of ['INTERRUPT_TRACE', 'BARGE_IN_FASTPATH', 'TURN_KEEPER', 'BARGE_IN_ACK']) {
    vi.stubEnv(flag, flag === 'BARGE_IN_ACK' ? 'any' : 'off');
  }
  vi.stubEnv('CARTESIA_API_KEY', 'test-key');
  vi.stubEnv('LIVEKIT_API_KEY', 'test-key');
  vi.stubEnv('LIVEKIT_API_SECRET', 'test-secret');
  // LiveKit Inference is never reached in these tests.
  vi.stubEnv('LIVEKIT_INFERENCE_URL', 'http://127.0.0.1:9');
  // A hold that is easy to see: any commit counts as hesitant, 300 ms of quiet.
  vi.stubEnv('PAUSE_HOLD', 'on');
  vi.stubEnv('PAUSE_HOLD_LEAD_MS', '0');
  vi.stubEnv('PAUSE_HOLD_MS', '300');
});

afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
  vi.unstubAllEnvs();
});

interface Built {
  session: Awaited<ReturnType<typeof createCallSession>>;
  sessionId: string;
}

async function buildCall(env: Record<string, string>): Promise<Built> {
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  calls += 1;
  const sessionId = `td-${calls}`;
  const session = await createCallSession({
    persona: { id: 'ferni' } as never,
    sessionId,
    services: {} as never,
    userData: {} as never,
    llmModel: undefined,
    tts: undefined as never,
  });
  const cleanupFunctions: Array<() => void> = [];
  installLiveCallBehaviors({
    session,
    sessionWithEvents: session as never,
    sessionEventHandlers: [],
    cleanupFunctions,
    sessionId,
    userId: undefined,
  });
  await installTurnListeners({
    session: session as never,
    sessionId,
    agent: { chatCtx: { items: [] } },
    dynamicToolLoader: { loadAllDomains: async () => 0, getCurrentTools: () => ({}) },
    cleanupFunctions,
  });
  cleanups.push(() => cleanupFunctions.forEach((fn) => fn()));
  return { session, sessionId };
}

/** Commit a turn on the session the way LiveKit reports it, then time the reply's first-audio gate. */
async function firstAudioWaitMs({ session, sessionId }: Built): Promise<number> {
  const emit = (event: string, ev: unknown): boolean =>
    (session as unknown as EventEmitter).emit(event, ev);
  emit('user_input_transcribed', { transcript: 'so that was fun', isFinal: true });
  emit('metrics_collected', { metrics: { type: 'eou_metrics', lastSpeakingTimeMs: Date.now() } });
  emit('agent_state_changed', { oldState: 'listening', newState: 'thinking' });
  const start = Date.now();
  await waitForPauseHold(sessionId);
  return Date.now() - start;
}

const unfinishedHold = (session: object): unknown =>
  (session as { unfinishedTurnHoldMs?: unknown }).unfinishedTurnHoldMs;

describe('turn detector layers on a real call session', () => {
  it('every flag off: ink decides (stt), the holds run', async () => {
    vi.stubEnv('TURN_DETECTOR', '');
    const call = await buildCall({});
    expect(call.session.turnDetection).toBe('stt');
    expect(typeof unfinishedHold(call.session)).toBe('function');
    expect(await firstAudioWaitMs(call)).toBeGreaterThanOrEqual(200);
  }, 60_000);

  it('TURN_DETECTOR_SOLE alone changes nothing', async () => {
    const call = await buildCall({ TURN_DETECTOR_SOLE: 'on' });
    expect(call.session.turnDetection).toBe('stt');
    expect(typeof unfinishedHold(call.session)).toBe('function');
    expect(await firstAudioWaitMs(call)).toBeGreaterThanOrEqual(200);
  }, 60_000);

  it('detector with holds: the session gets turn-detector-v1 and the holds still run', async () => {
    const call = await buildCall({ TURN_DETECTOR: 'cloud' });
    expect(call.session.turnDetection).toBeInstanceOf(inference.TurnDetector);
    expect((call.session.turnDetection as inference.TurnDetector).model).toBe('turn-detector-v1');
    expect(call.session.vad).toBeDefined();
    expect(typeof unfinishedHold(call.session)).toBe('function');
    expect(await firstAudioWaitMs(call)).toBeGreaterThanOrEqual(200);
  }, 60_000);

  it('detector sole: the unfinished-turn hold and PAUSE_HOLD stand down', async () => {
    const call = await buildCall({ TURN_DETECTOR: 'cloud', TURN_DETECTOR_SOLE: 'on' });
    expect(call.session.turnDetection).toBeInstanceOf(inference.TurnDetector);
    expect(unfinishedHold(call.session)).toBeUndefined();
    expect(await firstAudioWaitMs(call)).toBeLessThan(100);
  }, 60_000);

  it('detector sole without VAD: no detector, ink keeps deciding and the holds run', async () => {
    const call = await buildCall({
      TURN_DETECTOR: 'cloud',
      TURN_DETECTOR_SOLE: 'on',
      DISABLE_VAD: 'true',
    });
    expect(call.session.turnDetection).toBe('stt');
    expect(typeof unfinishedHold(call.session)).toBe('function');
    expect(await firstAudioWaitMs(call)).toBeGreaterThanOrEqual(200);
  }, 60_000);
});
