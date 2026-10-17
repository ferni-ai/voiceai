/**
 * TURN_RECEIPT joins the per-turn decisions that were only separate log lines
 * (PREEMPTIVE_DECISION, PAUSE_HOLD_RELEASED, BARGE_IN_FASTPATH,
 * BARGE_IN_DECISION) plus the call path and LiveKit's resolved turn handling,
 * so a latency experiment can be credited turn by turn. Each case drives the
 * real producer (our patched LiveKit, pause-hold.ts, live-call-behaviors.ts)
 * into the real recorder.
 */
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachPauseHold, waitForPauseHold } from '../../../speech/output-control/pause-hold.js';
import {
  installLiveCallBehaviors,
  logBargeInDecisions,
} from '../../multi-agent/live-call-behaviors.js';
import { attachTurnReceipts, type TurnReceipt, type TurnReceiptOptions } from '../turn-receipt.js';

const SESSION = 'RM_decisions';

/** A session double (a real EventEmitter) with a receipt recorder attached. */
function call(opts: Partial<TurnReceiptOptions> = {}, activity?: Record<string, unknown>) {
  const session = Object.assign(new EventEmitter(), {
    interrupt: vi.fn(),
    _activity: activity,
  });
  const receipts: TurnReceipt[] = [];
  const detach = attachTurnReceipts(session as never, {
    sessionId: SESSION,
    userId: 'u1',
    persona: () => 'ferni',
    emit: (r) => receipts.push(r),
    env: {},
    ...opts,
  });
  const state = (newState: string, oldState?: string) =>
    session.emit('agent_state_changed', { oldState, newState });
  const commit = (stoppedAt = Date.now()) =>
    session.emit('metrics_collected', {
      metrics: { type: 'eou_metrics', endOfUtteranceDelayMs: 300, lastSpeakingTimeMs: stoppedAt },
    });
  const reply = (o: { interrupted?: boolean } = {}) => {
    state('speaking', 'thinking');
    session.emit('conversation_item_added', {
      item: llm.ChatMessage.create({
        role: 'assistant',
        content: 'Sure.',
        interrupted: Boolean(o.interrupted),
      }),
    });
    state('listening', 'speaking');
  };
  return { session, receipts, detach, state, commit, reply };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

const agentsDist = dirname(createRequire(import.meta.url).resolve('@livekit/agents'));

type UserTurnCompleted = (this: unknown, info: Record<string, unknown>) => Promise<void>;

async function userTurnCompleted(): Promise<UserTurnCompleted> {
  const mod = (await import(pathToFileURL(join(agentsDist, 'voice/agent_activity.js')).href)) as {
    AgentActivity: { prototype: { userTurnCompleted: UserTurnCompleted } };
  };
  return mod.AgentActivity.prototype.userTurnCompleted;
}

/** The parts of an AgentActivity that userTurnCompleted reads, with a pending preemptive reply. */
function activityWithPreemptive(agentSession: EventEmitter, sameContext: boolean) {
  const words = 'what should I cook tonight';
  const preemptiveHandle = { id: 'speech_pre', _cancel: vi.fn() };
  return {
    agentSession,
    llm: {},
    schedulingPaused: false,
    newTurnsBlocked: false,
    _currentSpeech: undefined,
    // 1.8: a finished user turn first drops queued replies
    interruptQueuedSpeeches: vi.fn(),
    tools: { equals: () => true },
    toolChoice: undefined,
    agent: {
      chatCtx: { copy: () => ({}) },
      onUserTurnCompleted: async () => undefined,
    },
    _preemptiveGeneration: {
      speechHandle: preemptiveHandle,
      userMessage: { content: [] },
      info: { newTranscript: words },
      chatCtx: { isEquivalent: () => sameContext },
      tools: { equals: () => true },
      toolChoice: undefined,
      createdAt: Date.now() - 200,
    },
    logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
    scheduleSpeech: vi.fn(),
    generateReply: vi.fn(() => ({ id: 'speech_final' })),
    info: { newTranscript: words, endOfUtteranceDelay: 300, stoppedSpeakingAt: Date.now() },
    preemptiveHandle,
  };
}

describe('preemptive: LiveKit kept or dropped the reply it started early', () => {
  // The PREEMPTIVE_DECISION line is ours (patches/@livekit__agents@1.8.1.patch); the
  // patch also emits it on the session, just before the commit's eou_metrics.
  it.each([
    [true, 'reused'],
    [false, 'dropped'],
  ] as const)(
    'runs the patched decision (same context: %s) into the receipt as %s',
    async (same, want) => {
      const c = call();
      const a = activityWithPreemptive(c.session, same);
      await (await userTurnCompleted()).call(a, a.info);
      expect(a.preemptiveHandle._cancel).toHaveBeenCalledTimes(same ? 0 : 1);
      c.state('thinking', 'listening');
      c.reply();
      expect(c.receipts.map((r) => r.preemptive)).toEqual([want]);
    }
  );

  it("is 'none' for a turn with no preemptive reply, and a decision counts for one turn only", () => {
    const c = call();
    c.session.emit('ferni_preemptive_decision', { type: 'ferni_preemptive_decision', used: true });
    c.commit();
    c.reply();
    c.commit();
    c.reply();
    expect(c.receipts.map((r) => r.preemptive)).toEqual(['reused', 'none']);
  });
});

describe('pauseHoldMs: how long the reply waited for the caller (pause-hold.ts)', () => {
  /** Words, ink's late end and the commit, then the reply's first audio asks the hold. */
  async function heldTurn(words: string): Promise<TurnReceipt[]> {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    const c = call();
    const detachHold = attachPauseHold(c.session, SESSION, {
      PAUSE_HOLD: 'on',
      PAUSE_HOLD_MS: '1300',
    });
    const stoppedAt = Date.now();
    c.session.emit('user_state_changed', { newState: 'speaking' });
    c.session.emit('user_input_transcribed', { transcript: words, isFinal: false });
    c.session.emit('user_state_changed', { newState: 'listening', createdAt: stoppedAt + 350 });
    vi.advanceTimersByTime(650); // ink ended the turn 650 ms after the words: hesitant
    c.commit(stoppedAt);
    c.state('thinking', 'listening');
    vi.advanceTimersByTime(300);
    const released = waitForPauseHold(SESSION);
    for (let i = 0; i < 100; i++) await vi.advanceTimersByTimeAsync(25);
    await released;
    c.reply();
    detachHold?.();
    return c.receipts;
  }

  it('records the hold of a hesitant turn', async () => {
    const [r] = await heldTurn('Oh, and Biscuit chewed up my phone charger this morning.');
    // Quiet since the stop must reach 1300 ms; 950 ms had passed when the audio was ready.
    expect(r?.pauseHoldMs).toBeGreaterThanOrEqual(300);
    expect(r?.pauseHoldMs).toBeLessThanOrEqual(400);
  });

  it('is 0 when the reply was not held (a question)', async () => {
    const [r] = await heldTurn('Oh, and did Biscuit chew up my phone charger?');
    expect(r?.pauseHoldMs).toBe(0);
  });
});

describe('callerPath', () => {
  it.each([
    [true, 'phone'],
    [false, 'web'],
    [undefined, 'unknown'],
  ] as const)('phoneCaller %s reads as %s', (phoneCaller, want) => {
    const c = call({ phoneCaller });
    c.commit();
    c.reply();
    expect(c.receipts[0]?.callerPath).toBe(want);
  });
});

describe("turnDetection and interruptionMode: what LiveKit's activity resolved", () => {
  it('reads the end-of-turn model in use and the adaptive barge-in model', () => {
    const detector = { model: 'turn-detector-v1' };
    const c = call({}, { _resolvedTurnDetection: detector, interruptionDetector: {} });
    c.commit();
    c.reply();
    // Cloud fell back to local: the detector reports the model it now runs.
    detector.model = 'turn-detector-v1-mini';
    c.commit();
    c.reply();
    expect(c.receipts.map((r) => [r.turnDetection, r.interruptionMode])).toEqual([
      ['turn-detector-v1', 'adaptive'],
      ['turn-detector-v1-mini', 'adaptive'],
    ]);
  });

  it("reads ink-2's own turn end and voice-activity barge-in", () => {
    const c = call(
      {},
      {
        _resolvedTurnDetection: 'stt',
        turnDetectionMode: 'stt',
        isInterruptionByAudioActivityEnabled: true,
      }
    );
    c.commit();
    c.reply();
    expect(c.receipts.map((r) => [r.turnDetection, r.interruptionMode])).toEqual([['stt', 'vad']]);
  });

  it("is 'unknown' with no LiveKit activity running", () => {
    const c = call();
    c.commit();
    c.reply();
    expect(c.receipts.map((r) => [r.turnDetection, r.interruptionMode])).toEqual([
      ['unknown', 'unknown'],
    ]);
  });
});

describe('bargeInSource: what stopped Ferni for the caller', () => {
  it("'fastpath': the barge-in fast path interrupted (live-call-behaviors.ts)", () => {
    for (const flag of ['INTERRUPT_TRACE', 'TURN_KEEPER']) vi.stubEnv(flag, 'off');
    vi.stubEnv('BARGE_IN_ACK', 'any');
    const c = call();
    installLiveCallBehaviors({
      session: c.session as never,
      sessionWithEvents: c.session,
      sessionEventHandlers: [],
      cleanupFunctions: [],
      sessionId: SESSION,
      userId: 'u1',
    });
    c.commit();
    c.state('thinking', 'listening');
    c.state('speaking', 'thinking');
    c.session.emit('user_input_transcribed', { transcript: 'wait no hold on', isFinal: false });
    expect(c.session.interrupt).toHaveBeenCalledTimes(1);
    c.reply({ interrupted: true });
    expect(c.receipts.map((r) => r.bargeInSource)).toEqual(['fastpath']);
  });

  it("'adaptive': LiveKit's barge-in model called it an interruption (BARGE_IN_DECISION)", () => {
    const c = call();
    logBargeInDecisions(c.session as never, SESSION);
    const overlap = (isInterruption: boolean) =>
      c.session.emit('overlapping_speech', {
        isInterruption,
        probability: isInterruption ? 0.8 : 0.3,
        detectionDelayInS: 0.4,
        totalDurationInS: 0.6,
      });
    c.commit();
    c.state('speaking', 'thinking');
    overlap(false); // a backchannel: Ferni goes on
    c.reply();
    c.commit();
    c.state('speaking', 'thinking');
    overlap(true);
    c.reply({ interrupted: true });
    expect(c.receipts.map((r) => r.bargeInSource)).toEqual([null, 'adaptive']);
  });

  it("'vad': LiveKit paused the reply for the caller's voice; 'other' for any other cut-off", () => {
    const activity: Record<string, unknown> = {};
    const c = call({}, activity);
    c.commit();
    c.state('speaking', 'thinking');
    activity.pausedSpeech = { handle: {}, timeout: 2000 }; // interruptByAudioActivity
    c.state('listening', 'speaking');
    activity.pausedSpeech = undefined;
    c.commit();
    c.reply({ interrupted: true });
    c.commit();
    c.reply();
    expect(c.receipts.map((r) => r.bargeInSource)).toEqual(['vad', 'other', null]);
  });
});
